import { BaseController } from './base.controller';
import { ConversationValidator } from '../validators/conversation-validator';
import { redisCache } from '../utils/redis-cache';
import { PerformanceTracker } from '../utils/performance-tracker';
import { z } from 'zod';

/**
 * Controller for managing conversations
 */
export class ConversationController extends BaseController {
  /**
   * Create a new conversation
   */
  async createConversation(context: RequestContext) {
    const tracker = PerformanceTracker.start('createConversation');

    try {
      // Validate input
      const validatedData = ConversationValidator.createConversation.parse(context.body);

      // Perform conversation creation logic
      // This would typically involve database interaction
      const conversation = await this.prisma.conversation.create({
        data: {
          participants: {
            connect: validatedData.participantIds.map(id => ({ id }))
          },
          initialMessage: validatedData.initialMessage,
          tags: validatedData.tags,
          priority: validatedData.priority,
          sourceChannel: validatedData.sourceChannel
        }
      });

      // Invalidate conversation list cache
      await redisCache.delete('conversations:list');

      tracker.stop();

      return {
        success: true,
        data: conversation,
        message: 'Conversation created successfully'
      };
    } catch (error) {
      this.logger.error('Conversation creation failed', { error });
      
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: 'Validation failed',
          details: error.errors
        };
      }

      throw error;
    }
  }

  /**
   * Get conversations with advanced filtering
   */
  async getConversations(context: RequestContext) {
    const tracker = PerformanceTracker.start('getConversations');

    try {
      // Validate query parameters
      const validatedQuery = ConversationValidator.conversationQuery.parse(context.query);

      // Generate cache key
      const cacheKey = `conversations:${JSON.stringify(validatedQuery)}`;

      // Use cached fetch to optimize performance
      const conversations = await redisCache.cachedFetch(
        cacheKey,
        async () => {
          // Construct dynamic query based on validated parameters
          const query: Record<string, any> = {};

          if (validatedQuery.status) query.status = validatedQuery.status;
          if (validatedQuery.priority) query.priority = validatedQuery.priority;
          if (validatedQuery.tags) query.tags = { hasSome: validatedQuery.tags };
          if (validatedQuery.assignedTo) query.assignedTo = validatedQuery.assignedTo;
          
          // Add date range filtering
          if (validatedQuery.startDate || validatedQuery.endDate) {
            query.createdAt = {};
            if (validatedQuery.startDate) query.createdAt.gte = new Date(validatedQuery.startDate);
            if (validatedQuery.endDate) query.createdAt.lte = new Date(validatedQuery.endDate);
          }

          return this.prisma.conversation.findMany({
            where: query,
            take: validatedQuery.limit,
            skip: (validatedQuery.page - 1) * validatedQuery.limit,
            orderBy: { 
              [validatedQuery.sortBy || 'createdAt']: validatedQuery.sortOrder 
            }
          });
        },
        3600 // 1 hour cache
      );

      tracker.stop();

      return {
        success: true,
        data: conversations,
        meta: {
          page: validatedQuery.page,
          limit: validatedQuery.limit,
          total: await this.prisma.conversation.count({ where: query })
        }
      };
    } catch (error) {
      this.logger.error('Failed to retrieve conversations', { error });
      
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: 'Invalid query parameters',
          details: error.errors
        };
      }

      throw error;
    }
  }

  /**
   * Update an existing conversation
   */
  async updateConversation(context: RequestContext) {
    const tracker = PerformanceTracker.start('updateConversation');

    try {
      // Validate input
      const validatedData = ConversationValidator.updateConversation.parse(context.body);

      // Perform conversation update
      const updatedConversation = await this.prisma.conversation.update({
        where: { id: validatedData.id },
        data: {
          status: validatedData.status,
          tags: validatedData.tags,
          priority: validatedData.priority,
          assignedTo: validatedData.assignedTo
        }
      });

      // Invalidate specific conversation and list caches
      await Promise.all([
        redisCache.delete(`conversation:${validatedData.id}`),
        redisCache.delete('conversations:list')
      ]);

      tracker.stop();

      return {
        success: true,
        data: updatedConversation,
        message: 'Conversation updated successfully'
      };
    } catch (error) {
      this.logger.error('Conversation update failed', { error });
      
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: 'Validation failed',
          details: error.errors
        };
      }

      throw error;
    }
  }

  /**
   * Add a message to a conversation
   */
  async addMessage(context: RequestContext) {
    const tracker = PerformanceTracker.start('addMessage');

    try {
      // Validate input
      const validatedData = ConversationValidator.addMessage.parse(context.body);

      // Add message to conversation
      const message = await this.prisma.message.create({
        data: {
          conversationId: validatedData.conversationId,
          content: validatedData.content,
          senderId: validatedData.senderId,
          type: validatedData.type
        }
      });

      // Invalidate conversation cache
      await redisCache.delete(`conversation:${validatedData.conversationId}`);

      tracker.stop();

      return {
        success: true,
        data: message,
        message: 'Message added successfully'
      };
    } catch (error) {
      this.logger.error('Adding message failed', { error });
      
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: 'Validation failed',
          details: error.errors
        };
      }

      throw error;
    }
  }
}