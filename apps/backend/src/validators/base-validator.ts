import { z } from 'zod';

/**
 * Base validator utility for creating consistent validation schemas
 */
export class BaseValidator {
  /**
   * Create a common ID validation schema
   * @returns Zod schema for ID validation
   */
  static id() {
    return z.string().uuid().or(z.number().int().positive());
  }

  /**
   * Create a pagination schema
   * @returns Zod schema for pagination parameters
   */
  static pagination() {
    return z.object({
      page: z.number().int().positive().optional().default(1),
      limit: z.number().int().positive().optional().default(10),
      sortBy: z.string().optional(),
      sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
    });
  }

  /**
   * Sanitize and validate string input
   * @param options Validation options
   * @returns Zod string schema
   */
  static string(options: {
    min?: number;
    max?: number;
    trim?: boolean;
    toLowerCase?: boolean;
    toUpperCase?: boolean;
  } = {}) {
    let schema = z.string();

    if (options.min !== undefined) {
      schema = schema.min(options.min, `Minimum length is ${options.min}`);
    }

    if (options.max !== undefined) {
      schema = schema.max(options.max, `Maximum length is ${options.max}`);
    }

    // Add transformations
    schema = schema.transform(val => {
      let result = val;
      
      if (options.trim) {
        result = result.trim();
      }

      if (options.toLowerCase) {
        result = result.toLowerCase();
      }

      if (options.toUpperCase) {
        result = result.toUpperCase();
      }

      return result;
    });

    return schema;
  }

  /**
   * Create a safe email validator
   * @returns Zod email schema
   */
  static email() {
    return z.string()
      .email('Invalid email format')
      .transform(val => val.toLowerCase().trim());
  }

  /**
   * Create a password validator with strength requirements
   * @returns Zod password schema
   */
  static password() {
    return z.string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
      .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
      .regex(/[0-9]/, 'Password must contain at least one number')
      .regex(/[!@#$%^&*()]/, 'Password must contain at least one special character');
  }
}