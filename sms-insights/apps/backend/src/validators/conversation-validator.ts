import { z } from 'zod';
import { BaseValidator } from './base-validator';

/**
 * Validation schemas for conversation-related endpoints
 */
export class ConversationValidator {
  /**
   * Schema for creating a new conversation
   */
  static createConversation = z.object({
    participantIds: z.array(BaseValidator.id()).min(1, 'At least one participant is required'),
    initialMessage: BaseValidator.string({ 
      min: 1, 
      max: 1000, 
      trim: true 
    }),
    tags: z.array(z.string()).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional().default('medium'),
    sourceChannel: z.string().optional()
  });

  /**
   * Schema for updating an existing conversation
   */
  static updateConversation = z.object({
    id: BaseValidator.id(),
    status: z.enum(['active', 'archived', 'resolved']).optional(),
    tags: z.array(z.string()).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    assignedTo: BaseValidator.id().optional()
  });

  /**
   * Schema for conversation filtering and pagination
   */
  static conversationQuery = z.object({
    ...BaseValidator.pagination().shape,
    status: z.enum(['active', 'archived', 'resolved']).optional(),
    priority: z.enum(['low', 'medium', 'high']).optional(),
    tags: z.array(z.string()).optional(),
    assignedTo: BaseValidator.id().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional()
  });

  /**
   * Schema for adding a message to a conversation
   */
  static addMessage = z.object({
    conversationId: BaseValidator.id(),
    content: BaseValidator.string({ 
      min: 1, 
      max: 2000, 
      trim: true 
    }),
    senderId: BaseValidator.id(),
    type: z.enum(['text', 'note', 'internal']).default('text')
  });
}