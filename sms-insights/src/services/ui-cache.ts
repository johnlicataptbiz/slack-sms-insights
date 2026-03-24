import { UserUIState } from './ui-state-manager.js';

// Simple in-memory cache with TTL for UI state
export class UICache {
  private cache = new Map<string, { data: UserUIState; expires: number }>();
  private readonly TTL = 5 * 60 * 1000; // 5 minutes

  set(userId: string, state: UserUIState): void {
    this.cache.set(userId, {
      data: state,
      expires: Date.now() + this.TTL,
    });
  }

  get(userId: string): UserUIState | null {
    const entry = this.cache.get(userId);
    if (!entry) return null;

    if (Date.now() > entry.expires) {
      this.cache.delete(userId);
      return null;
    }

    return entry.data;
  }

  delete(userId: string): void {
    this.cache.delete(userId);
  }

  clear(): void {
    this.cache.clear();
  }

  // Clean up expired entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expires) {
        this.cache.delete(key);
      }
    }
  }
}

// Singleton instance
export const uiCache = new UICache();

// Clean up expired entries every 5 minutes
setInterval(() => uiCache.cleanup(), 5 * 60 * 1000);