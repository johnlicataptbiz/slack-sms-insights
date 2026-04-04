import { describe, it, expect } from 'vitest';
import { getPrismaClient } from '../services/prisma';
import { testUtils } from './setup';

describe('Edge Case Scenarios', () => {
  const prisma = getPrismaClient();

  describe('User Management Edge Cases', () => {
    it('should handle user creation with minimal data', async () => {
      const user = await testUtils.createMockUser({
        email: 'minimal@example.com',
        firstName: '',
        lastName: ''
      });

      expect(user).toBeDefined();
      expect(user.email).toBe('minimal@example.com');
    });

    it('should prevent creating user with invalid email', async () => {
      await expect(
        testUtils.createMockUser({ email: 'invalid-email' })
      ).rejects.toThrow();
    });
  });

  describe('Conversation Handling', () => {
    it('should handle conversation with extremely long message', async () => {
      const longMessage = 'x'.repeat(10000);
      
      const conversation = await prisma.conversation.create({
        data: {
          contactKey: 'long-message-test',
          initialMessage: longMessage,
          status: 'active'
        }
      });

      expect(conversation).toBeDefined();
      expect(conversation.initialMessage.length).toBe(10000);
    });

    it('should handle multiple conversations for same contact', async () => {
      const contactKey = 'multi-convo-contact';
      
      await prisma.conversation.createMany({
        data: [
          { contactKey, status: 'active', initialMessage: 'First message' },
          { contactKey, status: 'active', initialMessage: 'Second message' }
        ]
      });

      const conversations = await prisma.conversation.findMany({
        where: { contactKey }
      });

      expect(conversations.length).toBe(2);
    });
  });

  describe('SMS Event Scenarios', () => {
    it('should handle SMS events with missing optional fields', async () => {
      const smsEvent = await prisma.smsEvents.create({
        data: {
          direction: 'outbound',
          status: 'sent',
          // Intentionally omit optional fields
        }
      });

      expect(smsEvent).toBeDefined();
      expect(smsEvent.direction).toBe('outbound');
    });

    it('should prevent creating SMS event with invalid status', async () => {
      await expect(
        prisma.smsEvents.create({
          data: {
            direction: 'outbound',
            // @ts-ignore - intentionally passing invalid status
            status: 'invalid-status'
          }
        })
      ).rejects.toThrow();
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle concurrent user creations', async () => {
      const userPromises = Array.from({ length: 10 }, (_, i) => 
        testUtils.createMockUser({ 
          email: `concurrent-${i}@example.com` 
        })
      );

      const users = await Promise.all(userPromises);

      expect(users.length).toBe(10);
      const uniqueEmails = new Set(users.map(u => u.email));
      expect(uniqueEmails.size).toBe(10);
    });
  });
});