import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AuthController } from '../../src/controllers/auth.controller';
import { getPrismaClient } from '../../services/prisma';
import { redisCache } from '../../src/utils/redis-cache';
import bcrypt from 'bcrypt';

describe('AuthController', () => {
  let controller: AuthController;
  let prisma: ReturnType<typeof getPrismaClient>;

  beforeEach(() => {
    prisma = getPrismaClient();
    controller = new AuthController(console);
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.user.deleteMany();
    await prisma.session.deleteMany();
    await redisCache.clear();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const mockContext = {
        body: {
          email: 'test@example.com',
          password: 'StrongPassword123!',
          firstName: 'John',
          lastName: 'Doe',
          role: 'user'
        },
        logger: console
      };

      const result = await controller.register(mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id');
      expect(result.data.email).toBe('test@example.com');
    });

    it('should prevent duplicate user registration', async () => {
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
          firstName: 'John',
          lastName: 'Doe'
        },
        logger: console
      };

      const result = await controller.register(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User already exists');
    });
  });

  describe('login', () => {
    let existingUser: any;

    beforeEach(async () => {
      existingUser = await prisma.user.create({
        data: {
          email: 'login@example.com',
          passwordHash: await bcrypt.hash('correctPassword', 10),
          firstName: 'Login',
          lastName: 'User'
        }
      });
    });

    it('should login successfully with correct credentials', async () => {
      const mockContext = {
        body: {
          email: 'login@example.com',
          password: 'correctPassword',
          rememberMe: false
        },
        req: { headers: { 'user-agent': 'Test Agent' } },
        logger: console
      };

      const result = await controller.login(mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('token');
      expect(result.data.user.email).toBe('login@example.com');
    });

    it('should reject login with incorrect password', async () => {
      const mockContext = {
        body: {
          email: 'login@example.com',
          password: 'wrongPassword'
        },
        req: { headers: { 'user-agent': 'Test Agent' } },
        logger: console
      };

      const result = await controller.login(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid credentials');
    });
  });

  describe('requestPasswordReset', () => {
    beforeEach(async () => {
      await prisma.user.create({
        data: {
          email: 'reset@example.com',
          passwordHash: await bcrypt.hash('oldPassword', 10),
          firstName: 'Reset',
          lastName: 'User'
        }
      });
    });

    it('should initiate password reset for existing user', async () => {
      const mockContext = {
        body: {
          email: 'reset@example.com'
        },
        logger: console
      };

      const result = await controller.requestPasswordReset(mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Password reset link sent');
    });

    it('should handle non-existent user email', async () => {
      const mockContext = {
        body: {
          email: 'nonexistent@example.com'
        },
        logger: console
      };

      const result = await controller.requestPasswordReset(mockContext);

      expect(result.success).toBe(true);
      expect(result.message).toBe('If an account exists, a reset link will be sent');
    });
  });
});