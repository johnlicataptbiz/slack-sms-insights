import { Request, Response, NextFunction } from 'express';
import { healthMonitor, dbPerformanceMonitor } from '../lib/monitoring';
import { healthCheck } from '../lib/prisma';

export const databaseHealthMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const startTime = Date.now();

  try {
    // Perform health check
    const dbHealth = await healthCheck();

    // Record health status
    healthMonitor.recordHealth({
      service: 'database',
      status: dbHealth.status === 'healthy' ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      details: dbHealth.details
    });

    // Record performance
    const responseTime = Date.now() - startTime;
    dbPerformanceMonitor.recordResponseTime(responseTime);

    // Add health headers
    res.set('X-Database-Health', dbHealth.status);
    res.set('X-Database-Response-Time', responseTime.toString());

    next();
  } catch (error) {
    // Record failure
    healthMonitor.recordHealth({
      service: 'database',
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      details: { error: error.message }
    });

    // Continue processing (don't fail the request)
    next();
  }
};