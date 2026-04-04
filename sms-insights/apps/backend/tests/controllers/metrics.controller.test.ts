import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MetricsController } from '../../src/controllers/metrics.controller';
import { getPrismaClient } from '../../services/prisma';
import { redisCache } from '../../src/utils/redis-cache';

describe('MetricsController', () => {
  let controller: MetricsController;
  let prisma: ReturnType<typeof getPrismaClient>;

  beforeEach(() => {
    prisma = getPrismaClient();
    controller = new MetricsController(console);
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.smsEvents.deleteMany();
    await prisma.conversations.deleteMany();
    await redisCache.clear();
  });

  describe('getSmsPerformanceMetrics', () => {
    beforeEach(async () => {
      // Seed test data
      await prisma.smsEvents.createMany({
        data: [
          { 
            direction: 'outbound', 
            status: 'sent', 
            createdAt: new Date(),
            channel: 'sms'
          },
          { 
            direction: 'outbound', 
            status: 'delivered', 
            createdAt: new Date(),
            channel: 'sms'
          }
        ]
      });
    });

    it('should retrieve SMS performance metrics', async () => {
      const mockContext = {
        query: {
          page: 1,
          limit: 10,
          interval: 'day'
        },
        logger: console
      };

      const result = await controller.getSmsPerformanceMetrics(mockContext);

      expect(result.success).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.meta.interval).toBe('day');
    });
  });

  describe('getConversationMetrics', () => {
    beforeEach(async () => {
      // Seed test data
      await prisma.conversations.createMany({
        data: [
          { 
            status: 'active', 
            createdAt: new Date(),
            type: 'outbound'
          },
          { 
            status: 'resolved', 
            createdAt: new Date(),
            type: 'inbound'
          }
        ]
      });
    });

    it('should retrieve conversation metrics', async () => {
      const mockContext = {
        query: {
          page: 1,
          limit: 10,
          interval: 'day',
          status: 'active'
        },
        logger: console
      };

      const result = await controller.getConversationMetrics(mockContext);

      expect(result.success).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.meta.interval).toBe('day');
    });
  });

  describe('getLeadConversionMetrics', () => {
    beforeEach(async () => {
      // Seed test data
      await prisma.leads.createMany({
        data: [
          { 
            stage: 'lead', 
            createdAt: new Date(),
            source: 'sms'
          },
          { 
            stage: 'opportunity', 
            createdAt: new Date(),
            source: 'email'
          }
        ]
      });
    });

    it('should retrieve lead conversion metrics', async () => {
      const mockContext = {
        query: {
          page: 1,
          limit: 10,
          interval: 'day',
          stage: 'lead'
        },
        logger: console
      };

      const result = await controller.getLeadConversionMetrics(mockContext);

      expect(result.success).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.meta.interval).toBe('day');
    });
  });
});