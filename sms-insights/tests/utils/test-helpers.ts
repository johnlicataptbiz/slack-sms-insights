import type { Request, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Test utilities for common patterns
export class TestUtils {
  /**
   * Create a mock Express request object
   */
  static createMockRequest(overrides: Partial<Request> = {}): Request {
    return {
      body: {},
      params: {},
      query: {},
      headers: {},
      method: 'GET',
      url: '/',
      ...overrides,
    } as Request;
  }

  /**
   * Create a mock Express response object
   */
  static createMockResponse(overrides: Partial<Response> = {}): Response {
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
      send: vi.fn().mockReturnThis(),
      ...overrides,
    };
    return res as Response;
  }

  /**
   * Create a mock database transaction
   */
  static createMockTransaction() {
    return {
      commit: vi.fn(),
      rollback: vi.fn(),
    };
  }

  /**
   * Wait for a specified amount of time
   */
  static async wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create a test database connection string
   */
  static getTestDatabaseUrl(): string {
    return process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';
  }
}

// Common test patterns
export const testPatterns = {
  /**
   * Test that a function throws an error with specific message
   */
  async expectThrowsAsync(fn: () => Promise<any>, expectedMessage: string) {
    try {
      await fn();
      expect.fail('Expected function to throw');
    } catch (error) {
      expect((error as Error).message).toContain(expectedMessage);
    }
  },

  /**
   * Test that an async operation completes within timeout
   */
  async expectCompletesWithin(fn: () => Promise<any>, timeoutMs: number) {
    const start = Date.now();
    await fn();
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(timeoutMs);
  },
};

// Database test helpers
export class DatabaseTestHelper {
  /**
   * Clean up database tables between tests
   */
  static async cleanupTables(prisma: any, tables: string[]) {
    for (const table of tables) {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
    }
  }

  /**
   * Seed database with test data
   */
  static async seedData(prisma: any, data: Record<string, any[]>) {
    for (const [table, records] of Object.entries(data)) {
      for (const record of records) {
        await prisma[table].create({ data: record });
      }
    }
  }
}

// Mock factories for common services
export const mockFactories = {
  slackService: () => ({
    sendMessage: vi.fn(),
    getChannelInfo: vi.fn(),
    getUserInfo: vi.fn(),
  }),

  mondayService: () => ({
    createItem: vi.fn(),
    updateItem: vi.fn(),
    getBoardItems: vi.fn(),
    getBoardInfo: vi.fn(),
  }),

  prismaClient: () => ({
    conversation: {
      create: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    $transaction: vi.fn(),
    $connect: vi.fn(),
    $disconnect: vi.fn(),
  }),
};
