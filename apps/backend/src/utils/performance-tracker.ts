import { Request, Response, NextFunction } from "express";

/**
 * Performance tracking utility
 */
export class PerformanceTracker {
  private static instances: Map<string, PerformanceTracker> = new Map();

  private startTime: number;
  private endTime?: number;
  private name: string;

  private constructor(name: string) {
    this.name = name;
    this.startTime = performance.now();
  }

  /**
   * Start tracking performance for a specific operation
   * @param name Unique identifier for the operation
   * @returns PerformanceTracker instance
   */
  static start(name: string): PerformanceTracker {
    const tracker = new PerformanceTracker(name);
    this.instances.set(name, tracker);
    return tracker;
  }

  /**
   * Stop tracking and log performance
   * @returns Total execution time in milliseconds
   */
  stop(): number {
    this.endTime = performance.now();
    const duration = this.endTime - this.startTime;

    // Log performance metrics
    console.log(`Performance: ${this.name} took ${duration.toFixed(2)}ms`);

    return duration;
  }

  /**
   * Middleware for tracking endpoint performance
   * @returns Express middleware function
   */
  static middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const tracker = PerformanceTracker.start(`${req.method} ${req.path}`);

      // Patch the response end method to stop tracking
      const originalEnd = res.end;
      res.end = function (...args: any[]) {
        tracker.stop();
        return (originalEnd as any).apply(this, args);
      };

      next();
    };
  }
}
