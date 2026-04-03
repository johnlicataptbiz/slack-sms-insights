import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConversationController } from '../../src/controllers/conversation.controller';
import { getPrismaClient } from '../../services/prisma';
import { redisCache } from '../../src/utils/redis-cache';

describe('ConversationController', () => {
  let controller: ConversationController;
  let prisma: ReturnType<typeof getPrismaClient>;

  beforeEach(() => {
    prisma = getPrismaClient();
    controller = new ConversationController(console);
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.conversation.deleteMany();
    await redisCache.clear();
  });

  describe('createConversation', () => {
    it('should create a new conversation successfully', async () => {
      const mockContext = {
        body: {
          participantIds: ['user1', 'user2'],
          initialMessage: 'Test conversation',
          tags: ['sales'],
          priority: 'medium'
        },
        logger: console
      };

      const result = await controller.createConversation(mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id');
      expect(result.data.initialMessage).toBe('Test conversation');
    });

    it('should handle validation errors', async () => {
      const mockContext = {
        body: {
          participantIds: [],
          initialMessage: ''
        },
        logger: console
      };

      const result = await controller.createConversation(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Validation failed');
    });
  });

  describe('getConversations', () => {
    beforeEach(async () => {
      // Seed test data
      await prisma.conversation.createMany({
        data: [
          { 
            contactKey: 'contact1', 
            status: 'active', 
            initialMessage: 'Test 1',
            createdAt: new Date()
          },
          { 
            contactKey: 'contact2', 
            status: 'resolved', 
            initialMessage: 'Test 2',
            createdAt: new Date()
          }
        ]
      });
    });

    it('should retrieve conversations with filtering', async () => {
      const mockContext = {
        query: {
          page: 1,
          limit: 10,
          status: 'active'
        },
        logger: console
      };

      const result = await controller.getConversations(mockContext);

      expect(result.success).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0].status).toBe('active');
    });
  });

  describe('updateConversation', () => {
    let existingConversation: any;

    beforeEach(async () => {
      existingConversation = await prisma.conversation.create({
        data: { 
          contactKey: 'contact1', 
          status: 'active',
          initialMessage: 'Test conversation'
        }
      });
    });

    it('should update an existing conversation', async () => {
      const mockContext = {
        body: {
          id: existingConversation.id,
          status: 'resolved',
          tags: ['completed']
        },
        logger: console
      };

      const result = await controller.updateConversation(mockContext);

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('resolved');
      expect(result.data.tags).toEqual(['completed']);
    });
  });
});