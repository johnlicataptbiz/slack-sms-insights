import { PrismaClient } from '@prisma/client';
import { afterAll, beforeAll, vi } from 'vitest';

// Extend global types
declare global {
  var integrationUtils: {
    prisma: PrismaClient;
    cleanDatabase: () => Promise<void>;
    seedTestData: () => Promise<void>;
  };
}

// Create a test database client
const prisma = new PrismaClient();

beforeAll(async () => {
  // Set up test environment
  process.env.NODE_ENV = 'test';

  // Clean up test database
  await prisma.$connect();

  // Mock external services for integration tests
  vi.mock('../src/services/slack.service', () => ({
    SlackService: {
      sendMessage: vi.fn(),
      getChannelInfo: vi.fn(),
    },
  }));

  vi.mock('../src/services/monday.service', () => ({
    MondayService: {
      createItem: vi.fn(),
      updateItem: vi.fn(),
      getBoardItems: vi.fn(),
    },
  }));
});

afterAll(async () => {
  // Clean up database connections
  await prisma.$disconnect();

  // Restore all mocks
  vi.restoreAllMocks();
});

// Global integration test utilities
global.integrationUtils = {
  prisma,

  // Helper to clean database between tests
  async cleanDatabase() {
    // Add database cleanup logic here
    // This would typically truncate tables or reset to known state
  },

  // Helper to seed test data
  async seedTestData() {
    // Add test data seeding logic here
  },
};
