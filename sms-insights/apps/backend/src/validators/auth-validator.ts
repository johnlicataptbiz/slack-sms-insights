import { z } from 'zod';
import { BaseValidator } from './base-validator';

/**
 * Validation schemas for authentication-related endpoints
 */
export class AuthValidator {
  /**
   * Login credentials validation schema
   */
  static login = z.object({
    email: BaseValidator.email(),
    password: BaseValidator.string({ 
      min: 8, 
      max: 128 
    }),
    rememberMe: z.boolean().optional().default(false)
  });

  /**
   * User registration validation schema
   */
  static register = z.object({
    email: BaseValidator.email(),
    password: BaseValidator.password(),
    firstName: BaseValidator.string({ 
      min: 2, 
      max: 50, 
      trim: true 
    }),
    lastName: BaseValidator.string({ 
      min: 2, 
      max: 50, 
      trim: true 
    }),
    role: z.enum(['user', 'admin', 'manager']).optional().default('user')
  });

  /**
   * Password reset request validation schema
   */
  static passwordResetRequest = z.object({
    email: BaseValidator.email()
  });

  /**
   * Password reset confirmation validation schema
   */
  static passwordResetConfirm = z.object({
    token: z.string().min(10, 'Invalid reset token'),
    newPassword: BaseValidator.password()
  });

  /**
   * Multi-factor authentication validation schema
   */
  static mfaSetup = z.object({
    method: z.enum(['totp', 'sms']),
    phoneNumber: z.string().optional()
  });

  /**
   * Multi-factor authentication verification schema
   */
  static mfaVerify = z.object({
    method: z.enum(['totp', 'sms']),
    code: z.string().min(6, 'Invalid verification code').max(8, 'Invalid verification code')
  });

  /**
   * Session management validation schema
   */
  static sessionQuery = z.object({
    ...BaseValidator.pagination().shape,
    status: z.enum(['active', 'expired', 'revoked']).optional(),
    deviceType: z.string().optional()
  });
}