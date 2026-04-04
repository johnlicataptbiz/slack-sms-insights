import { BaseController } from './base.controller';
import { AdminValidator } from '../validators/admin-validator';
import { redisCache } from '../utils/redis-cache';
import { PerformanceTracker } from '../utils/performance-tracker';
import { z } from 'zod';
import bcrypt from 'bcrypt';
import type { Prisma } from '@prisma/client';

/**
 * Controller for managing administrative operations
 */
export class AdminController extends BaseController {
  /**
   * Get list of users with advanced filtering
   */
  async getUserList(context: RequestContext) {
    const tracker = PerformanceTracker.start('getUserList');

    try {
      // Validate query parameters
      const validatedQuery = AdminValidator.userManagementQuery.parse(context.query);
      const query: Prisma.UserWhereInput = {};

      if (validatedQuery.role) query.role = validatedQuery.role;
      if (validatedQuery.status) query.status = validatedQuery.status;
      if (validatedQuery.searchTerm) {
        query.OR = [
          { email: { contains: validatedQuery.searchTerm, mode: 'insensitive' } },
          { firstName: { contains: validatedQuery.searchTerm, mode: 'insensitive' } },
          { lastName: { contains: validatedQuery.searchTerm, mode: 'insensitive' } }
        ];
      }

      // Generate cache key
      const cacheKey = `admin:users:${JSON.stringify(validatedQuery)}`;

      // Use cached fetch to optimize performance
      const users = await redisCache.cachedFetch(
        cacheKey,
        async () => {
          return this.prisma.user.findMany({
            where: query,
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              role: true,
              status: true,
              lastLogin: true,
              createdAt: true
            },
            take: validatedQuery.limit,
            skip: (validatedQuery.page - 1) * validatedQuery.limit,
            orderBy: { 
              [validatedQuery.sortBy || 'createdAt']: validatedQuery.sortOrder 
            }
          });
        },
        3600 // 1 hour cache
      );

      tracker.stop();

      return {
        success: true,
        data: users,
        meta: {
          page: validatedQuery.page,
          limit: validatedQuery.limit,
          total: await this.prisma.user.count({ where: query })
        }
      };
    } catch (error) {
      this.logger.error('Failed to retrieve user list', { error });
      
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

  /**
   * Create a new user
   */
  async createUser(context: RequestContext) {
    const tracker = PerformanceTracker.start('createUser');

    try {
      // Validate input
      const validatedData = AdminValidator.createUser.parse(context.body);

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
          role: validatedData.role,
          department: validatedData.department,
          teamId: validatedData.teamId
        }
      });

      // Invalidate user list cache
      await redisCache.delete('admin:users:list');

      tracker.stop();

      return {
        success: true,
        data: {
          id: user.id,
          email: user.email,
          role: user.role
        },
        message: 'User created successfully'
      };
    } catch (error) {
      this.logger.error('User creation failed', { error });
      
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
   * Update an existing user
   */
  async updateUser(context: RequestContext) {
    const tracker = PerformanceTracker.start('updateUser');

    try {
      // Validate input
      const validatedData = AdminValidator.updateUser.parse(context.body);

      // Update user
      const updatedUser = await this.prisma.user.update({
        where: { id: validatedData.id },
        data: {
          email: validatedData.email,
          firstName: validatedData.firstName,
          lastName: validatedData.lastName,
          role: validatedData.role,
          status: validatedData.status,
          department: validatedData.department,
          teamId: validatedData.teamId
        }
      });

      // Invalidate user list and specific user cache
      await Promise.all([
        redisCache.delete('admin:users:list'),
        redisCache.delete(`admin:user:${validatedData.id}`)
      ]);

      tracker.stop();

      return {
        success: true,
        data: {
          id: updatedUser.id,
          email: updatedUser.email,
          role: updatedUser.role
        },
        message: 'User updated successfully'
      };
    } catch (error) {
      this.logger.error('User update failed', { error });
      
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
   * Perform bulk actions on users
   */
  async bulkUserAction(context: RequestContext) {
    const tracker = PerformanceTracker.start('bulkUserAction');

    try {
      // Validate input
      const validatedData = AdminValidator.bulkAction.parse(context.body);

      let result;
      switch (validatedData.action) {
        case 'activate':
          result = await this.prisma.user.updateMany({
            where: { id: { in: validatedData.ids } },
            data: { status: 'active' }
          });
          break;
        case 'suspend':
          result = await this.prisma.user.updateMany({
            where: { id: { in: validatedData.ids } },
            data: { status: 'suspended' }
          });
          break;
        case 'delete':
          result = await this.prisma.user.deleteMany({
            where: { id: { in: validatedData.ids } }
          });
          break;
        default:
          throw new Error('Unsupported bulk action');
      }

      // Invalidate user list cache
      await redisCache.delete('admin:users:list');

      tracker.stop();

      return {
        success: true,
        data: {
          affectedCount: result.count
        },
        message: `Bulk ${validatedData.action} action completed successfully`
      };
    } catch (error) {
      this.logger.error('Bulk user action failed', { error });
      
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
   * Get system configuration
   */
  async getSystemConfig(context: RequestContext) {
    const tracker = PerformanceTracker.start('getSystemConfig');

    try {
      // Validate query parameters
      const validatedQuery = AdminValidator.systemConfigQuery.parse(context.query);
      const query: Record<string, any> = {};

      if (validatedQuery.category) query.category = validatedQuery.category;
      if (validatedQuery.key) query.key = validatedQuery.key;

      // Generate cache key
      const cacheKey = `admin:system-config:${JSON.stringify(validatedQuery)}`;

      // Use cached fetch to optimize performance
      const configs = await redisCache.cachedFetch(
        cacheKey,
        async () => {
          return this.prisma.systemConfig.findMany({
            where: query,
            take: validatedQuery.limit,
            skip: (validatedQuery.page - 1) * validatedQuery.limit
          });
        },
        3600 // 1 hour cache
      );

      tracker.stop();

      return {
        success: true,
        data: configs,
        meta: {
          page: validatedQuery.page,
          limit: validatedQuery.limit,
          total: await this.prisma.systemConfig.count({ where: query })
        }
      };
    } catch (error) {
      this.logger.error('Failed to retrieve system configuration', { error });
      
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

  /**
   * Update system configuration
   */
  async updateSystemConfig(context: RequestContext) {
    const tracker = PerformanceTracker.start('updateSystemConfig');

    try {
      // Validate input
      const validatedData = AdminValidator.updateSystemConfig.parse(context.body);

      // Update or create system configuration
      const updatedConfig = await this.prisma.systemConfig.upsert({
        where: { 
          category_key: { 
            category: validatedData.category, 
            key: validatedData.key 
          } 
        },
        update: { 
          value: JSON.stringify(validatedData.value) 
        },
        create: {
          category: validatedData.category,
          key: validatedData.key,
          value: JSON.stringify(validatedData.value)
        }
      });

      // Invalidate system config cache
      await redisCache.delete(`admin:system-config:${validatedData.category}`);

      tracker.stop();

      return {
        success: true,
        data: updatedConfig,
        message: 'System configuration updated successfully'
      };
    } catch (error) {
      this.logger.error('System configuration update failed', { error });
      
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
   * Get audit logs
   */
  async getAuditLogs(context: RequestContext) {
    const tracker = PerformanceTracker.start('getAuditLogs');

    try {
      // Validate query parameters
      const validatedQuery = AdminValidator.auditLogQuery.parse(context.query);
      const query: Record<string, any> = {};

      if (validatedQuery.startDate) query.createdAt = { gte: new Date(validatedQuery.startDate) };
      if (validatedQuery.endDate) {
        query.createdAt = query.createdAt || {};
        query.createdAt.lte = new Date(validatedQuery.endDate);
      }
      if (validatedQuery.userId) query.userId = validatedQuery.userId;
      if (validatedQuery.action) query.action = validatedQuery.action;
      if (validatedQuery.resourceType) query.resourceType = validatedQuery.resourceType;
      if (validatedQuery.ipAddress) query.ipAddress = validatedQuery.ipAddress;

      // Generate cache key
      const cacheKey = `admin:audit-logs:${JSON.stringify(validatedQuery)}`;

      // Use cached fetch to optimize performance
      const auditLogs = await redisCache.cachedFetch(
        cacheKey,
        async () => {
          return this.prisma.auditLog.findMany({
            where: query,
            take: validatedQuery.limit,
            skip: (validatedQuery.page - 1) * validatedQuery.limit,
            orderBy: { createdAt: 'desc' }
          });
        },
        3600 // 1 hour cache
      );

      tracker.stop();

      return {
        success: true,
        data: auditLogs,
        meta: {
          page: validatedQuery.page,
          limit: validatedQuery.limit,
          total: await this.prisma.auditLog.count({ where: query })
        }
      };
    } catch (error) {
      this.logger.error('Failed to retrieve audit logs', { error });
      
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
