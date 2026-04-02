import { getPrismaClient } from '../lib/prisma.js';
import type { RequestContext } from './base.controller.js';
import { BaseController } from './base.controller.js';

export class HealthController extends BaseController {
  async execute(context: RequestContext): Promise<void> {
    const { res } = context;

    let dbStatus = 'unknown';
    try {
      const prisma = getPrismaClient();
      await prisma.$queryRaw`SELECT 1`;
      dbStatus = 'healthy';
    } catch (error) {
      dbStatus = 'unavailable';
      context.logger.warn('Database health check failed (expected during migration)');
    }

    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,
      database: dbStatus,
      deployment: 'consolidated-backend-v7.6.0',
    };

    this.sendSuccessResponse(res, healthData);
  }
}
