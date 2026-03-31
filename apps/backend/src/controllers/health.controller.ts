import type { RequestContext } from './base.controller.js';
import { BaseController } from './base.controller.js';
import { prisma } from '../lib/prisma.js';

export class HealthController extends BaseController {
  async execute(context: RequestContext): Promise<void> {
    const { res } = context;

    // Database health check (optional for basic health)
    let dbStatus = 'unknown';
    try {
      // Only attempt DB check if Prisma is available
      const { prisma } = await import('../lib/prisma.js');
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'healthy';
    } catch (error) {
      dbStatus = 'unavailable';
      console.log('Database health check skipped or failed (expected during migration)');
    }

    // Health check response with basic system info
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,
      database: dbStatus,
      deployment: 'consolidated-backend-2026-03-31',
      migration: 'p0-complete',
    };

    this.sendSuccessResponse(res, healthData);
  }
}