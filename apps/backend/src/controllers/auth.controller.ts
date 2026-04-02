import { z } from 'zod';
import type { RequestContext } from './base.controller.js';
import { BaseController } from './base.controller.js';

const LoginRequestSchema = z.object({
  password: z.string().min(1, 'Password is required'),
});

export class AuthController extends BaseController {
  private readonly correctPassword = process.env.DASHBOARD_PASSWORD || 'default';

  protected async execute(context: RequestContext): Promise<void> {
    await this.verify(context);
  }

  async verify(context: RequestContext): Promise<void> {
    // For now, just return success - session management would be added later
    this.sendSuccessResponse(context.res, {
      success: true,
      message: 'Session verified',
    });
  }

  async login(context: RequestContext): Promise<void> {
    const { req, res, body } = context;

    try {
      const validatedData = LoginRequestSchema.parse(body);

      if (validatedData.password === this.correctPassword) {
        // For now, just return success - session management would be added later
        this.sendSuccessResponse(res, {
          success: true,
          message: 'Login successful',
        });
      } else {
        this.sendErrorResponse(res, 'Invalid password', 401);
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        this.sendErrorResponse(res, 'Invalid request data', 400);
      } else {
        this.sendErrorResponse(res, 'Login failed', 500);
      }
    }
  }
}
