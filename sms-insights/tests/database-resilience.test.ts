import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { DatabaseService } from '../src/services/database-service';
import { dbCircuitBreaker } from '../src/lib/circuit-breaker';
import { appCache } from '../src/lib/cache';

describe('Database Resilience', () => {
  let dbService: DatabaseService;

  beforeEach(() => {
    dbService = new DatabaseService();
    appCache.clear();
  });

  afterEach(() => {
    appCache.clear();
  });

  describe('Circuit Breaker', () => {
    it('should start in CLOSED state', () => {
      const state = dbCircuitBreaker.getState();
      expect(state.state).toBe('CLOSED');
      expect(state.failures).toBe(0);
    });

    it('should open after failure threshold', async () => {
      // Simulate failures
      for (let i = 0; i < 5; i++) {
        try {
          await dbCircuitBreaker.execute(() => Promise.reject(new Error('Test error')));
        } catch (error) {
          // Expected
        }
      }

      const state = dbCircuitBreaker.getState();
      expect(state.state).toBe('OPEN');
      expect(state.failures).toBe(5);
    });
  });

  describe('Fallback Cache', () => {
    it('should return cached data when DB fails', async () => {
      const fallbackData = { id: 'test', status: 'cached' };

      // First call should fail and return fallback
      const result = await dbService.executeQuery(
        () => Promise.reject(new Error('DB down')),
        'test-key',
        fallbackData
      );

      expect(result).toEqual(fallbackData);
    });

    it('should cache successful results', async () => {
      const testData = { id: 'test', status: 'success' };

      // Mock successful operation
      const result = await dbService.executeQuery(
        () => Promise.resolve(testData),
        'test-key'
      );

      expect(result).toEqual(testData);

      // Should be cached
      const cached = appCache.get('test-key');
      expect(cached).toEqual(testData);
    });
  });

  describe('Health Monitoring', () => {
    it('should track health status', () => {
      const health = dbService.getHealthStatus();
      expect(health).toHaveProperty('connected');
      expect(health).toHaveProperty('circuitBreaker');
      expect(health).toHaveProperty('performance');
    });
  });
});