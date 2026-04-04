import { beforeEach, afterEach } from 'vitest';
import { getPrismaClient } from '../services/prisma';
import { redisCache } from '../src/utils/redis-cache';

// Global setup for database and cache cleanup
beforeEach(async () => {
  // Initialize Prisma client
  const prisma = getPrismaClient();

  // Optional: Clear database tables before each test
  // Be cautious with this in production environments
  // Note: These tables may not exist in all environments, so we wrap in try/catch
  try { await prisma.conversations.deleteMany(); } catch { /* ignore */ }
  try { await prisma.sms_events.deleteMany(); } catch { /* ignore */ }
});

afterEach(async () => {
  // Clear Redis cache after each test (if available)
  try { await redisCache.clear?.(); } catch { /* ignore */ }
});

// Optional: Add global mocks or test utilities
export const testUtils = {
  // Helper functions for test setup
  createMockUser: async (userData = {}) => {
    const prisma = getPrismaClient();
    return prisma.user.create({
      data: {
        email: 'test@example.com',
        passwordHash: 'mock-hash',
        firstName: 'Test',
        lastName: 'User',
        ...userData
      }
    });
  },

  // Add more utility functions as needed
};