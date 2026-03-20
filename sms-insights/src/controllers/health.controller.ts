import type { RequestContext } from './base.controller.js';
import { BaseController } from './base.controller.js';

export class HealthController extends BaseController {
  async execute(context: RequestContext): Promise<void> {
    const { res } = context;

    // Health check response with basic system info
    const healthData = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
      version: process.version,
    };

    this.sendSuccessResponse(res, healthData);
  }
}