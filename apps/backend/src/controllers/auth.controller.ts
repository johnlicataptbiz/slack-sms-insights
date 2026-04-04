import { BaseController, RequestContext } from './base.controller.js';

/**
 * Controller for authentication endpoints.
 * Provides stub implementations for verify and login.
 * Full implementation requires auth service integration.
 */
export class AuthController extends BaseController {
  protected async execute(context: RequestContext): Promise<void> {
    this.sendErrorResponse(context.res, 'Use a specific method', 404);
  }

  async verify(context: RequestContext): Promise<void> {
    const authHeader = (context.req as { headers?: Record<string, string> }).headers?.authorization;
    if (!authHeader) {
      this.sendErrorResponse(context.res, 'No authorization header provided', 401);
      return;
    }
    this.sendSuccessResponse(context.res, { authenticated: true });
  }

  async login(context: RequestContext): Promise<void> {
    this.sendErrorResponse(context.res, 'Login endpoint not yet configured', 501);
  }
}
