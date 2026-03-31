export interface HealthStatus {
  service: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  details?: any;
  metrics?: {
    responseTime?: number;
    errorRate?: number;
    throughput?: number;
  };
}

export class HealthMonitor {
  private statuses = new Map<string, HealthStatus>();
  private metrics = new Map<string, any>();

  recordHealth(status: HealthStatus): void {
    this.statuses.set(status.service, {
      ...status,
      timestamp: new Date().toISOString()
    });
  }

  recordMetric(service: string, metric: string, value: number): void {
    if (!this.metrics.has(service)) {
      this.metrics.set(service, {});
    }
    const serviceMetrics = this.metrics.get(service);
    serviceMetrics[metric] = {
      value,
      timestamp: Date.now()
    };
  }

  getHealthStatus(): HealthStatus[] {
    return Array.from(this.statuses.values());
  }

  getOverallHealth(): 'healthy' | 'degraded' | 'unhealthy' {
    const statuses = this.getHealthStatus();
    if (statuses.some(s => s.status === 'unhealthy')) return 'unhealthy';
    if (statuses.some(s => s.status === 'degraded')) return 'degraded';
    return 'healthy';
  }

  getMetrics(): any {
    return Object.fromEntries(this.metrics);
  }
}

// Global health monitor
export const healthMonitor = new HealthMonitor();

// Performance monitoring
export class PerformanceMonitor {
  private responseTimes: number[] = [];
  private maxSamples = 100;

  recordResponseTime(timeMs: number): void {
    this.responseTimes.push(timeMs);
    if (this.responseTimes.length > this.maxSamples) {
      this.responseTimes.shift();
    }
  }

  getAverageResponseTime(): number {
    if (this.responseTimes.length === 0) return 0;
    return this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
  }

  getPercentile(percentile: number): number {
    if (this.responseTimes.length === 0) return 0;
    const sorted = [...this.responseTimes].sort((a, b) => a - b);
    const index = Math.floor((percentile / 100) * sorted.length);
    return sorted[Math.min(index, sorted.length - 1)];
  }
}

export const dbPerformanceMonitor = new PerformanceMonitor();