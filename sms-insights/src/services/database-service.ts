import { prisma, connectPrisma } from '../lib/prisma';
import { dbCircuitBreaker, dbFallbackCache } from '../lib/cache';
import { healthMonitor, dbPerformanceMonitor } from '../lib/monitoring';

export class DatabaseService {
  private isConnected = false;

  async initialize(): Promise<void> {
    try {
      await connectPrisma();
      this.isConnected = true;
      healthMonitor.recordHealth({
        service: 'database-service',
        status: 'healthy',
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.isConnected = false;
      healthMonitor.recordHealth({
        service: 'database-service',
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        details: { error: error.message }
      });
      throw error;
    }
  }

  async executeQuery<T>(
    operation: () => Promise<T>,
    cacheKey?: string,
    fallbackData?: T
  ): Promise<T> {
    const startTime = Date.now();

    try {
      let result: T;

      if (cacheKey && fallbackData) {
        // Use fallback cache
        result = await dbFallbackCache.getWithFallback(cacheKey, operation, fallbackData);
      } else {
        // Use circuit breaker
        result = await dbCircuitBreaker.execute(operation);
      }

      // Record success metrics
      const responseTime = Date.now() - startTime;
      dbPerformanceMonitor.recordResponseTime(responseTime);
      healthMonitor.recordMetric('database', 'response_time', responseTime);

      return result;
    } catch (error) {
      // Record failure metrics
      healthMonitor.recordMetric('database', 'errors', 1);

      // Re-throw with context
      throw new Error(`Database operation failed: ${error.message}`);
    }
  }

  // Convenience methods for common operations
  async getConversation(id: string) {
    return this.executeQuery(
      () => prisma.conversations.findUnique({
        where: { id },
        include: {
          sms_events: {
            orderBy: { event_ts: 'desc' },
            take: 10
          }
        }
      }),
      `conversation:${id}`,
      { id, status: 'UNKNOWN', contact_key: '', created_at: new Date() } // Minimal fallback
    );
  }

  async getSmsEvents(conversationId: string, limit = 50) {
    return this.executeQuery(
      () => prisma.sms_events.findMany({
        where: { conversation_id: conversationId },
        orderBy: { event_ts: 'desc' },
        take: limit
      }),
      `sms_events:${conversationId}:${limit}`,
      [] // Empty array fallback
    );
  }

  getHealthStatus() {
    return {
      connected: this.isConnected,
      circuitBreaker: dbCircuitBreaker.getState(),
      cacheSize: dbFallbackCache.size(),
      performance: {
        avgResponseTime: dbPerformanceMonitor.getAverageResponseTime(),
        p95ResponseTime: dbPerformanceMonitor.getPercentile(95)
      }
    };
  }
}

// Export singleton instance
export const databaseService = new DatabaseService();