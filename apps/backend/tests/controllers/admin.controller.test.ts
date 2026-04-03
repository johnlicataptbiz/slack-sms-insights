import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AdminController } from '../../src/controllers/admin.controller';
import { getPrismaClient } from '../../services/prisma';
import { redisCache } from '../../src/utils/redis-cache';
import bcrypt from 'bcrypt';

describe('AdminController', () => {
  let controller: AdminController;
  let prisma: ReturnType<typeof getPrismaClient>;

  beforeEach(() => {
    prisma = getPrismaClient();
    controller = new AdminController(console);
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.user.deleteMany();
    await prisma.systemConfig.deleteMany();
    await prisma.auditLog.deleteMany();
    await redisCache.clear();
  });

  describe('getUserList', () => {
    beforeEach(async () => {
      // Seed test users
      await prisma.user.createMany({
        data: [
          { 
            email: 'user1@example.com', 
            passwordHash: await bcrypt.hash('password', 10),
            firstName: 'John',
            lastName: 'Doe',
            role: 'user'
          },
          { 
            email: 'admin1@example.com', 
            passwordHash: await bcrypt.hash('password', 10),
            firstName: 'Admin',
            lastName: 'User',
            role: 'admin'
          }
        ]
      });
    });

    it('should retrieve user list with filtering', async () => {
      const mockContext = {
        query: {
          page: 1,
          limit: 10,
          role: 'user'
        },
        logger: console
      };

      const result = await controller.getUserList(mockContext);

      expect(result.success).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0].role).toBe('user');
    });
  });

  describe('createUser', () => {
    it('should create a new user successfully', async () => {
      const mockContext = {
        body: {
          email: 'newuser@example.com',
          password: 'StrongPassword123!',
          firstName: 'New',
          lastName: 'User',
          role: 'user'
        },
        logger: console
      };

      const result = await controller.createUser(mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id');
      expect(result.data.email).toBe('newuser@example.com');
    });

    it('should prevent duplicate user creation', async () => {
      // First, create a user
      await prisma.user.create({
        data: {
          email: 'existing@example.com',
          passwordHash: await bcrypt.hash('password', 10),
          firstName: 'Existing',
          lastName: 'User'
        }
      });

      const mockContext = {
        body: {
          email: 'existing@example.com',
          password: 'NewPassword123!',
          firstName: 'New',
          lastName: 'User'
        },
        logger: console
      };

      const result = await controller.createUser(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User already exists');
    });
  });

  describe('getSystemConfig', () => {
    beforeEach(async () => {
      // Seed test configurations
      await prisma.systemConfig.createMany({
        data: [
          { 
            category: 'performance', 
            key: 'max_concurrent_requests', 
            value: JSON.stringify(100) 
          },
          { 
            category: 'security', 
            key: 'password_complexity', 
            value: JSON.stringify({ minLength: 8 }) 
          }
        ]
      });
    });

    it('should retrieve system configurations with filtering', async () => {
      const mockContext = {
        query: {
          page: 1,
          limit: 10,
          category: 'performance'
        },
        logger: console
      };

      const result = await controller.getSystemConfig(mockContext);

      expect(result.success).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0].category).toBe('performance');
    });
  });

  describe('getAuditLogs', () => {
    beforeEach(async () => {
      // Seed test audit logs
      await prisma.auditLog.createMany({
        data: [
          { 
            userId: 'user1', 
            action: 'login', 
            resourceType: 'user',
            createdAt: new Date()
          },
          { 
            userId: 'user2', 
            action: 'create', 
            resourceType: 'conversation',
            createdAt: new Date()
          }
        ]
      });
    });

    it('should retrieve audit logs with filtering', async () => {
      const mockContext = {
        query: {
          page: 1,
          limit: 10,
          action: 'login'
        },
        logger: console
      };

      const result = await controller.getAuditLogs(mockContext);

      expect(result.success).toBe(true);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.data[0].action).toBe('login');
    });
  });
});