import { beforeEach, afterEach } from 'vitest';
import { getPrismaClient } from '../services/prisma';
import { redisCache } from '../src/utils/redis-cache';

// Global setup for database and cache cleanup
beforeEach(async () => {
  // Initialize Prisma client
  const prisma = getPrismaClient();

  // Optional: Clear database tables before each test
  // Be cautious with this in production environments
  await prisma.user.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.smsEvents.deleteMany();
});

afterEach(async () => {
  // Clear Redis cache after each test
  await redisCache.clear();
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