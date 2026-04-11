import { createClient, RedisClientType } from "redis";

/**
 * Redis Caching Utility
 * Provides a centralized, type-safe caching mechanism
 */
export class RedisCache {
  private static instance: RedisCache;
  private client: RedisClientType;

  private constructor() {
    // Use environment variable for Redis connection
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

    this.client = createClient({
      url: redisUrl,
      // Add additional configuration options as needed
      socket: {
        connectTimeout: 5000,
        reconnectStrategy: (retries) => {
          // Exponential backoff with max retry limit
          return Math.min(retries * 50, 5000);
        },
      },
    });

    // Handle connection events
    this.client.on("error", (err) => {
      console.error("Redis Client Error", err);
    });

    this.client.on("connect", () => {
      console.log("Redis client connected");
    });
  }

  /**
   * Get singleton instance of RedisCache
   */
  public static getInstance(): RedisCache {
    if (!RedisCache.instance) {
      RedisCache.instance = new RedisCache();
    }
    return RedisCache.instance;
  }

  /**
   * Connect to Redis
   */
  public async connect(): Promise<void> {
    if (!this.client.isOpen) {
      await this.client.connect();
    }
  }

  /**
   * Disconnect from Redis
   */
  public async disconnect(): Promise<void> {
    if (this.client.isOpen) {
      await this.client.quit();
    }
  }

  /**
   * Set a value in the cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time to live in seconds (optional)
   */
  public async set(
    key: string,
    value: string | number | object,
    ttl?: number,
  ): Promise<void> {
    await this.connect();

    const serializedValue =
      typeof value === "object" ? JSON.stringify(value) : String(value);

    if (ttl) {
      await this.client.set(key, serializedValue, { EX: ttl });
    } else {
      await this.client.set(key, serializedValue);
    }
  }

  /**
   * Get a value from the cache
   * @param key Cache key
   * @returns Cached value or null
   */
  public async get<T = string>(key: string): Promise<T | null> {
    await this.connect();

    const value = await this.client.get(key);

    if (!value) return null;

    try {
      // Try parsing as JSON first
      return JSON.parse(value) as T;
    } catch {
      // If not JSON, return as string
      return value as T;
    }
  }

  /**
   * Delete a key from the cache
   * @param key Cache key to delete
   */
  public async delete(key: string): Promise<void> {
    await this.connect();
    await this.client.del(key);
  }

  /**
   * Clear all cache keys in the current Redis database.
   */
  public async clear(): Promise<void> {
    try {
      await this.connect();
      await this.client.flushDb();
    } catch {
      // Cache is best-effort in tests and local environments.
    }
  }

  /**
   * Check if a key exists in the cache
   * @param key Cache key to check
   */
  public async exists(key: string): Promise<boolean> {
    await this.connect();
    const exists = await this.client.exists(key);
    return exists === 1;
  }

  /**
   * Utility method to cache and retrieve data with automatic expiration
   * @param key Cache key
   * @param fetchFn Function to fetch data if not in cache
   * @param ttl Time to live in seconds
   */
  public async cachedFetch<T>(
    key: string,
    fetchFn: () => Promise<T>,
    ttl: number = 3600,
  ): Promise<T> {
    // Try to get from cache first
    const cachedData = await this.get<T>(key);

    if (cachedData !== null) {
      return cachedData;
    }

    // Fetch data if not in cache
    const freshData = await fetchFn();

    // Store in cache
    if (freshData != null) {
      await this.set(
        key,
        freshData as unknown as string | number | object,
        ttl,
      );
    }

    return freshData;
  }
}

// Export a singleton instance for easy use
export const redisCache = RedisCache.getInstance();
