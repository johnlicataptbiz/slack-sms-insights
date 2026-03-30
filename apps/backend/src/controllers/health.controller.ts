import type { RequestContext } from './base.controller.js';
import { BaseController } from './base.controller.js';
import { prisma } from '../lib/prisma.js';

export class HealthController extends BaseController {
  async execute(context: RequestContext): Promise<void> {
    const { res } = context;

    // Database health check
    let dbStatus = 'unknown';
    try {
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'healthy';
    } catch (error) {
      dbStatus = 'unhealthy';
      console.error('Database health check failed:', error);
    }

    // Health check response with basic system info
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,
      database: dbStatus,
    };

    this.sendSuccessResponse(res, healthData);
  }
}