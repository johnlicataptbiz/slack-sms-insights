import type { PrismaClient } from '@prisma/client';
import { config } from '../config/index.js';

export abstract class BaseRepository {
  protected prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  protected async executeWithTransaction<T>(operation: (tx: PrismaClient) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      return operation(tx as PrismaClient);
    });
  }

  protected async executeWithRetry<T>(operation: () => Promise<T>, maxRetries = 3, delay = 1000): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        if (attempt === maxRetries) {
          break;
        }

        // Exponential backoff
        const waitTime = delay * 2 ** (attempt - 1);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
      }
    }

    if (lastError) {
      throw lastError;
    }

    throw new Error('Operation failed without an error');
  }
}
