// Performance optimization with multi-layer caching and rate limiting

export interface CacheEntry<T = any> {
  data: T;
  expires: number;
  lastAccessed: number;
  accessCount: number;
}

export interface RateLimitRule {
  id: string;
  action: string;
  windowMs: number; // time window in milliseconds
  maxRequests: number;
  blockDurationMs?: number; // how long to block after limit exceeded
}

export class PerformanceOptimizer {
  private static memoryCache = new Map<string, CacheEntry>();
  private static rateLimitStore = new Map<string, { count: number; resetTime: number; blockedUntil?: number }>();
  private static readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes default
  private static readonly MAX_CACHE_SIZE = 1000;

  // Multi-layer caching
  static async get<T>(key: string, fetcher?: () => Promise<T>, ttl: number = this.CACHE_TTL): Promise<T | null> {
    // Check memory cache first
    const cached = this.memoryCache.get(key);
    if (cached && Date.now() < cached.expires) {
      cached.lastAccessed = Date.now();
      cached.accessCount++;
      return cached.data;
    }

    // Remove expired entry
    if (cached) {
      this.memoryCache.delete(key);
    }

    // If no fetcher provided, return null
    if (!fetcher) return null;

    // Fetch fresh data
    try {
      const data = await fetcher();
      this.set(key, data, ttl);
      return data;
    } catch (error) {
      console.error(`Cache fetch failed for key ${key}:`, error);
      return null;
    }
  }

  static set<T>(key: string, data: T, ttl: number = this.CACHE_TTL): void {
    // Evict least recently used if cache is full
    if (this.memoryCache.size >= this.MAX_CACHE_SIZE) {
      this.evictLRU();
    }

    this.memoryCache.set(key, {
      data,
      expires: Date.now() + ttl,
      lastAccessed: Date.now(),
      accessCount: 1,
    });
  }

  static invalidate(pattern: string): void {
    const regex = new RegExp(pattern.replace(/\*/g, '.*'));
    for (const key of this.memoryCache.keys()) {
      if (regex.test(key)) {
        this.memoryCache.delete(key);
      }
    }
  }

  static clear(): void {
    this.memoryCache.clear();
  }

  static getCacheStats(): { size: number; hitRate: number; totalAccesses: number } {
    let totalAccesses = 0;
    let hits = 0;

    for (const entry of this.memoryCache.values()) {
      totalAccesses += entry.accessCount;
      if (entry.accessCount > 1) {
        hits += entry.accessCount - 1; // First access is always a miss
      }
    }

    return {
      size: this.memoryCache.size,
      hitRate: totalAccesses > 0 ? hits / totalAccesses : 0,
      totalAccesses,
    };
  }

  // Rate limiting
  static checkRateLimit(identifier: string, rule: RateLimitRule): { allowed: boolean; remaining: number; resetTime: number } {
    const key = `${rule.id}:${identifier}`;
    const now = Date.now();
    let record = this.rateLimitStore.get(key);

    // Check if currently blocked
    if (record?.blockedUntil && now < record.blockedUntil) {
      return {
        allowed: false,
        remaining: 0,
        resetTime: record.blockedUntil,
      };
    }

    // Initialize or reset window
    if (!record || now > record.resetTime) {
      record = {
        count: 0,
        resetTime: now + rule.windowMs,
      };
    }

    // Check if limit exceeded
    if (record.count >= rule.maxRequests) {
      // Block the identifier
      record.blockedUntil = now + (rule.blockDurationMs || rule.windowMs);
      this.rateLimitStore.set(key, record);

      return {
        allowed: false,
        remaining: 0,
        resetTime: record.blockedUntil,
      };
    }

    // Increment counter
    record.count++;
    this.rateLimitStore.set(key, record);

    return {
      allowed: true,
      remaining: rule.maxRequests - record.count,
      resetTime: record.resetTime,
    };
  }

  static getDefaultRateLimitRules(): RateLimitRule[] {
    return [
      {
        id: 'ui_interactions',
        action: 'ui_click',
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 30, // 30 clicks per minute
        blockDurationMs: 5 * 60 * 1000, // 5 minute block
      },
      {
        id: 'report_generation',
        action: 'generate_report',
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 5, // 5 reports per minute
        blockDurationMs: 10 * 60 * 1000, // 10 minute block
      },
      {
        id: 'export_requests',
        action: 'export_data',
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 3, // 3 exports per minute
        blockDurationMs: 15 * 60 * 1000, // 15 minute block
      },
      {
        id: 'api_calls',
        action: 'api_request',
        windowMs: 60 * 1000, // 1 minute
        maxRequests: 100, // 100 API calls per minute
        blockDurationMs: 2 * 60 * 1000, // 2 minute block
      },
    ];
  }

  // Lazy loading utilities
  static createLazyLoader<T>(
    loader: () => Promise<T>,
    placeholder?: T
  ): { load: () => Promise<T>; isLoaded: boolean; data?: T } {
    let loaded = false;
    let loading = false;
    let data: T | undefined = placeholder;
    let loadPromise: Promise<T> | null = null;

    return {
      load: async () => {
        if (loaded) return data!;
        if (loading) return loadPromise!;

        loading = true;
        loadPromise = loader()
          .then(result => {
            data = result;
            loaded = true;
            loading = false;
            return result;
          })
          .catch(error => {
            loading = false;
            throw error;
          });

        return loadPromise;
      },
      get isLoaded() { return loaded; },
      get data() { return data; },
    };
  }

  // Background processing
  static async processInBackground<T>(
    task: () => Promise<T>,
    onProgress?: (progress: number) => void,
    onComplete?: (result: T) => void,
    onError?: (error: Error) => void
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      // Simulate background processing with progress updates
      let progress = 0;
      const progressInterval = setInterval(() => {
        progress += Math.random() * 20;
        if (progress >= 100) {
          progress = 100;
          clearInterval(progressInterval);
        }
        onProgress?.(Math.round(progress));
      }, 500);

      task()
        .then(result => {
          clearInterval(progressInterval);
          onProgress?.(100);
          onComplete?.(result);
          resolve(result);
        })
        .catch(error => {
          clearInterval(progressInterval);
          onError?.(error);
          reject(error);
        });
    });
  }

  // Cleanup utilities
  private static evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.lastAccessed < oldestTime) {
        oldestTime = entry.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.memoryCache.delete(oldestKey);
    }
  }

  static cleanup(): void {
    const now = Date.now();

    // Clean expired cache entries
    for (const [key, entry] of this.memoryCache.entries()) {
      if (now > entry.expires) {
        this.memoryCache.delete(key);
      }
    }

    // Clean expired rate limit records
    for (const [key, record] of this.rateLimitStore.entries()) {
      if (record.resetTime < now && (!record.blockedUntil || record.blockedUntil < now)) {
        this.rateLimitStore.delete(key);
      }
    }
  }

  // Performance monitoring
  static startTiming(label: string): () => number {
    const start = process.hrtime.bigint();
    return () => {
      const end = process.hrtime.bigint();
      const duration = Number(end - start) / 1_000_000; // Convert to milliseconds
      console.log(`${label}: ${duration.toFixed(2)}ms`);
      return duration;
    };
  }

  static measurePerformance<T>(label: string, operation: () => T): T {
    const endTiming = this.startTiming(label);
    try {
      const result = operation();
      endTiming();
      return result;
    } catch (error) {
      endTiming();
      throw error;
    }
  }

  static async measureAsyncPerformance<T>(label: string, operation: () => Promise<T>): Promise<T> {
    const endTiming = this.startTiming(label);
    try {
      const result = await operation();
      endTiming();
      return result;
    } catch (error) {
      endTiming();
      throw error;
    }
  }
}

// Auto-cleanup every 5 minutes
setInterval(() => PerformanceOptimizer.cleanup(), 5 * 60 * 1000);