import { BaseController } from './base.controller';
import { AuthValidator } from '../validators/auth-validator';
import { redisCache } from '../utils/redis-cache';
import { PerformanceTracker } from '../utils/performance-tracker';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

/**
 * Controller for managing authentication and user-related operations
 */
export class AuthController extends BaseController {
  /**
   * User login
   */
  async login(context: RequestContext) {
    const tracker = PerformanceTracker.start('userLogin');

    try {
      // Validate input
      const validatedData = AuthValidator.login.parse(context.body);

      // Find user by email
      const user = await this.prisma.user.findUnique({
        where: { email: validatedData.email }
      });

      // Check if user exists and password is correct
      if (!user || !await bcrypt.compare(validatedData.password, user.passwordHash)) {
        return {
          success: false,
          error: 'Invalid credentials',
          statusCode: 401
        };
      }

      // Generate JWT token
      const token = jwt.sign(
        { 
          userId: user.id, 
          role: user.role 
        }, 
        process.env.JWT_SECRET || 'fallback_secret', 
        { 
          expiresIn: validatedData.rememberMe ? '30d' : '1d' 
        }
      );

      // Create session record
      const session = await this.prisma.session.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + (validatedData.rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000)),
          deviceInfo: context.req.headers['user-agent'] || 'Unknown'
        }
      });

      // Cache session for quick validation
      await redisCache.set(`session:${session.id}`, session, validatedData.rememberMe ? 30 * 24 * 60 * 60 : 24 * 60 * 60);

      tracker.stop();

      return {
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            email: user.email,
            role: user.role
          }
        },
        message: 'Login successful'
      };
    } catch (error) {
      this.logger.error('Login failed', { error });
      
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: 'Validation failed',
          details: error.errors,
          statusCode: 400
        };
      }

      throw error;
    }
  }

  /**
   * User registration
   */
  async register(context: RequestContext) {
    const tracker = PerformanceTracker.start('userRegistration');

    try {
      // Validate input
      const validatedData = AuthValidator.register.parse(context.body);

      // Check if user already exists
      const existingUser = await this.prisma.user.findUnique({
        where: { email: validatedData.email }
      });

      if (existingUser) {
        return {
          success: false,
          error: 'User already exists',
          statusCode: 409
        };
      }

      // Hash password
      const passwordHash = await bcrypt.hash(validatedData.password, 10);

      // Create user
      const user = await this.prisma.user.create({
        data: {
          email: validatedData.email,
          passwordHash,
          firstName: validatedData.firstName,
          lastName: validatedData.lastName,
          role: validatedData.role
        }
      });

      // Invalidate user list cache
      await redisCache.delete('users:list');

      tracker.stop();

      return {
        success: true,
        data: {
          id: user.id,
          email: user.email,
          role: user.role
        },
        message: 'Registration successful'
      };
    } catch (error) {
      this.logger.error('Registration failed', { error });
      
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: 'Validation failed',
          details: error.errors,
          statusCode: 400
        };
      }

      throw error;
    }
  }

  /**
   * Initiate password reset
   */
  async requestPasswordReset(context: RequestContext) {
    const tracker = PerformanceTracker.start('passwordResetRequest');

    try {
      // Validate input
      const validatedData = AuthValidator.passwordResetRequest.parse(context.body);

      // Find user by email
      const user = await this.prisma.user.findUnique({
        where: { email: validatedData.email }
      });

      if (!user) {
        // Prevent email enumeration
        return {
          success: true,
          message: 'If an account exists, a reset link will be sent'
        };
      }

      // Generate reset token
      const resetToken = this.generateResetToken();

      // Store reset token with expiration
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: resetToken,
          expiresAt: new Date(Date.now() + 3600000) // 1 hour expiration
        }
      });

      // TODO: Send email with reset link (implement email service)
      // This is a placeholder for email sending logic
      this.logger.info('Password reset requested', { email: validatedData.email });

      tracker.stop();

      return {
        success: true,
        message: 'Password reset link sent'
      };
    } catch (error) {
      this.logger.error('Password reset request failed', { error });
      
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: 'Validation failed',
          details: error.errors,
          statusCode: 400
        };
      }

      throw error;
    }
  }

  /**
   * Confirm password reset
   */
  async confirmPasswordReset(context: RequestContext) {
    const tracker = PerformanceTracker.start('passwordResetConfirm');

    try {
      // Validate input
      const validatedData = AuthValidator.passwordResetConfirm.parse(context.body);

      // Find valid reset token
      const resetTokenRecord = await this.prisma.passwordResetToken.findFirst({
        where: {
          token: validatedData.token,
          expiresAt: { gt: new Date() }
        },
        include: { user: true }
      });

      if (!resetTokenRecord) {
        return {
          success: false,
          error: 'Invalid or expired reset token',
          statusCode: 400
        };
      }

      // Hash new password
      const newPasswordHash = await bcrypt.hash(validatedData.newPassword, 10);

      // Update user password
      await this.prisma.user.update({
        where: { id: resetTokenRecord.userId },
        data: { passwordHash: newPasswordHash }
      });

      // Delete used reset token
      await this.prisma.passwordResetToken.delete({
        where: { id: resetTokenRecord.id }
      });

      tracker.stop();

      return {
        success: true,
        message: 'Password reset successful'
      };
    } catch (error) {
      this.logger.error('Password reset confirmation failed', { error });
      
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: 'Validation failed',
          details: error.errors,
          statusCode: 400
        };
      }

      throw error;
    }
  }

  /**
   * Generate a secure reset token
   */
  private generateResetToken(): string {
    return Array(32)
      .fill(0)
      .map(() => Math.floor(Math.random() * 16).toString(16))
      .join('');
  }

  /**
   * Get active user sessions
   */
  async getUserSessions(context: RequestContext) {
    const tracker = PerformanceTracker.start('getUserSessions');

    try {
      // Validate query parameters
      const validatedQuery = AuthValidator.sessionQuery.parse(context.query);

      // Generate cache key
      const cacheKey = `user:${context.req.user.id}:sessions:${JSON.stringify(validatedQuery)}`;

      // Use cached fetch to optimize performance
      const sessions = await redisCache.cachedFetch(
        cacheKey,
        async () => {
          // Construct dynamic query
          const query: Record<string, any> = { 
            userId: context.req.user.id 
          };

          if (validatedQuery.status) query.status = validatedQuery.status;
          if (validatedQuery.deviceType) query.deviceInfo = { contains: validatedQuery.deviceType };

          return this.prisma.session.findMany({
            where: query,
            take: validatedQuery.limit,
            skip: (validatedQuery.page - 1) * validatedQuery.limit,
            orderBy: { 
              [validatedQuery.sortBy || 'createdAt']: validatedQuery.sortOrder 
            },
            select: {
              id: true,
              deviceInfo: true,
              createdAt: true,
              expiresAt: true,
              status: true
            }
          });
        },
        3600 // 1 hour cache
      );

      tracker.stop();

      return {
        success: true,
        data: sessions,
        meta: {
          page: validatedQuery.page,
          limit: validatedQuery.limit,
          total: await this.prisma.session.count({ where: { userId: context.req.user.id } })
        }
      };
    } catch (error) {
      this.logger.error('Failed to retrieve user sessions', { error });
      
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: 'Invalid query parameters',
          details: error.errors,
          statusCode: 400
        };
      }

      throw error;
    }
  }
}