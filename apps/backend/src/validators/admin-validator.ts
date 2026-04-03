import { z } from 'zod';
import { BaseValidator } from './base-validator';

/**
 * Validation schemas for admin operations endpoints
 */
export class AdminValidator {
  /**
   * User management query schema
   */
  static userManagementQuery = z.object({
    ...BaseValidator.pagination().shape,
    role: z.enum(['user', 'admin', 'manager', 'support']).optional(),
    status: z.enum(['active', 'suspended', 'pending']).optional(),
    searchTerm: z.string().optional(),
    sortBy: z.enum(['createdAt', 'lastLogin', 'email']).optional().default('createdAt')
  });

  /**
   * Create user schema
   */
  static createUser = z.object({
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
    role: z.enum(['user', 'admin', 'manager', 'support']).optional().default('user'),
    department: z.string().optional(),
    teamId: BaseValidator.id().optional()
  });

  /**
   * Update user schema
   */
  static updateUser = z.object({
    id: BaseValidator.id(),
    email: BaseValidator.email().optional(),
    firstName: BaseValidator.string({ 
      min: 2, 
      max: 50, 
      trim: true 
    }).optional(),
    lastName: BaseValidator.string({ 
      min: 2, 
      max: 50, 
      trim: true 
    }).optional(),
    role: z.enum(['user', 'admin', 'manager', 'support']).optional(),
    status: z.enum(['active', 'suspended', 'pending']).optional(),
    department: z.string().optional(),
    teamId: BaseValidator.id().optional()
  });

  /**
   * System configuration query schema
   */
  static systemConfigQuery = z.object({
    ...BaseValidator.pagination().shape,
    category: z.enum([
      'performance', 
      'security', 
      'integration', 
      'notification', 
      'feature_flags'
    ]).optional(),
    key: z.string().optional()
  });

  /**
   * Update system configuration schema
   */
  static updateSystemConfig = z.object({
    category: z.enum([
      'performance', 
      'security', 
      'integration', 
      'notification', 
      'feature_flags'
    ]),
    key: z.string(),
    value: z.union([
      z.string(), 
      z.number(), 
      z.boolean(), 
      z.array(z.string()), 
      z.record(z.string(), z.any())
    ])
  });

  /**
   * Audit log query schema
   */
  static auditLogQuery = z.object({
    ...BaseValidator.pagination().shape,
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    userId: BaseValidator.id().optional(),
    action: z.string().optional(),
    resourceType: z.string().optional(),
    ipAddress: z.string().ip().optional()
  });

  /**
   * Team management query schema
   */
  static teamManagementQuery = z.object({
    ...BaseValidator.pagination().shape,
    name: z.string().optional(),
    status: z.enum(['active', 'inactive']).optional(),
    department: z.string().optional()
  });

  /**
   * Create team schema
   */
  static createTeam = z.object({
    name: BaseValidator.string({ 
      min: 2, 
      max: 100, 
      trim: true 
    }),
    description: BaseValidator.string({ 
      min: 0, 
      max: 500, 
      trim: true 
    }).optional(),
    department: z.string().optional(),
    leaderId: BaseValidator.id().optional()
  });

  /**
   * Update team schema
   */
  static updateTeam = z.object({
    id: BaseValidator.id(),
    name: BaseValidator.string({ 
      min: 2, 
      max: 100, 
      trim: true 
    }).optional(),
    description: BaseValidator.string({ 
      min: 0, 
      max: 500, 
      trim: true 
    }).optional(),
    department: z.string().optional(),
    leaderId: BaseValidator.id().optional(),
    status: z.enum(['active', 'inactive']).optional()
  });

  /**
   * Bulk action schema for users or teams
   */
  static bulkAction = z.object({
    ids: z.array(BaseValidator.id()).min(1, 'At least one ID is required'),
    action: z.enum(['activate', 'suspend', 'delete', 'transfer'])
  });
}