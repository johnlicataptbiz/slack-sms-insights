import { Request, Response, NextFunction } from 'express';
import { redisCache } from '../utils/redis-cache';

/**
 * Caching middleware for Express routes
 */
export class CacheMiddleware {
  /**
   * Create a caching middleware for GET routes
   * @param options Caching configuration
   * @returns Express middleware function
   */
  static cache(options: {
    ttl?: number;
    keyPrefix?: string;
  } = {}) {
    const { 
      ttl = 3600,  // Default 1 hour cache
      keyPrefix = 'api:' 
    } = options;

    return async (req: Request, res: Response, next: NextFunction) => {
      // Only cache GET requests
      if (req.method !== 'GET') {
        return next();
      }

      // Generate a unique cache key based on the request
      const cacheKey = this.generateCacheKey(req, keyPrefix);

      try {
        // Check if response is cached
        const cachedResponse = await redisCache.get(cacheKey);

        if (cachedResponse) {
          // Return cached response
          return res.json(cachedResponse);
        }

        // Patch the original json method to cache the response
        const originalJson = res.json;
        res.json = function(body) {
          // Cache the response
          redisCache.set(cacheKey, body, ttl)
            .catch(err => console.error('Cache set error:', err));
          
          // Call the original json method
          return originalJson.call(this, body);
        };

        next();
      } catch (error) {
        console.error('Cache middleware error:', error);
        next();
      }
    };
  }

  /**
   * Generate a unique cache key based on the request
   * @param req Express request object
   * @param prefix Optional key prefix
   * @returns Unique cache key
   */
  private static generateCacheKey(req: Request, prefix: string = ''): string {
    // Combine method, path, and query parameters
    const queryString = Object.entries(req.query)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('&');

    return `${prefix}${req.method}:${req.path}?${queryString}`;
  }

  /**
   * Invalidate cache for a specific route or pattern
   * @param pattern Cache key pattern to invalidate
   */
  static async invalidateCache(pattern: string) {
    // Note: This requires Redis to support pattern matching
    // You might need to use a different method depending on your Redis setup
    try {
      // This is a placeholder - actual implementation depends on your Redis client
      console.warn('Cache invalidation not fully implemented');
    } catch (error) {
      console.error('Cache invalidation error:', error);
    }
  }
}