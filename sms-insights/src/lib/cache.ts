import { dbCircuitBreaker } from './circuit-breaker';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

export class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();

  set<T>(key: string, data: T, ttlMs: number = 300000): void { // 5 minutes default
    this.cache.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size();
  }
}

// Application cache instance
export const appCache = new MemoryCache();

// Database fallback cache
export class DatabaseFallbackCache {
  private cache = new MemoryCache();

  async getWithFallback<T>(
    cacheKey: string,
    dbOperation: () => Promise<T>,
    fallbackData?: T
  ): Promise<T> {
    // Try cache first
    const cached = this.cache.get<T>(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      // Try database operation
      const result = await dbCircuitBreaker.execute(dbOperation);
      // Cache successful result
      this.cache.set(cacheKey, result, 300000); // 5 minutes
      return result;
    } catch (error) {
      // Return fallback data if available
      if (fallbackData) {
        console.warn(`Database operation failed, using fallback for ${cacheKey}`);
        return fallbackData;
      }
      throw error;
    }
  }

  invalidate(pattern: string): void {
    // Simple pattern invalidation (could be enhanced)
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
}

export const dbFallbackCache = new DatabaseFallbackCache();