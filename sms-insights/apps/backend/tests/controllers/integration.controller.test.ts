import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IntegrationController } from '../../src/controllers/integration.controller';
import { getPrismaClient } from '../../services/prisma';
import { redisCache } from '../../src/utils/redis-cache';
import axios from 'axios';
import { vi } from 'vitest';

describe('IntegrationController', () => {
  let controller: IntegrationController;
  let prisma: ReturnType<typeof getPrismaClient>;

  beforeEach(() => {
    prisma = getPrismaClient();
    controller = new IntegrationController(console);
  });

  afterEach(async () => {
    // Clean up test data
    await prisma.webhook.deleteMany();
    await prisma.externalServiceConnection.deleteMany();
    await prisma.syncConfiguration.deleteMany();
    await prisma.webhookEvent.deleteMany();
    await redisCache.clear();
  });

  describe('registerWebhook', () => {
    it('should register a new webhook successfully', async () => {
      const mockContext = {
        body: {
          name: 'Test Webhook',
          url: 'https://example.com/webhook',
          events: ['create', 'update'],
          isActive: true
        },
        logger: console
      };

      const result = await controller.registerWebhook(mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id');
      expect(result.data.name).toBe('Test Webhook');
    });

    it('should prevent duplicate webhook registration', async () => {
      // First, create a webhook
      await prisma.webhook.create({
        data: {
          name: 'Existing Webhook',
          url: 'https://example.com/existing-webhook',
          events: ['test']
        }
      });

      const mockContext = {
        body: {
          name: 'Duplicate Webhook',
          url: 'https://example.com/existing-webhook',
          events: ['create']
        },
        logger: console
      };

      const result = await controller.registerWebhook(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Webhook with this URL already exists');
    });
  });

  describe('connectExternalService', () => {
    it('should connect to an external service successfully', async () => {
      const mockContext = {
        body: {
          serviceName: 'monday',
          connectionType: 'api_key',
          credentials: { apiKey: 'test-key' },
          isActive: true
        },
        logger: console
      };

      const result = await controller.connectExternalService(mockContext);

      expect(result.success).toBe(true);
      expect(result.data).toHaveProperty('id');
      expect(result.data.serviceName).toBe('monday');
    });

    it('should prevent duplicate service connection', async () => {
      // First, create a service connection
      await prisma.externalServiceConnection.create({
        data: {
          serviceName: 'slack',
          connectionType: 'oauth',
          credentials: JSON.stringify({ token: 'test-token' })
        }
      });

      const mockContext = {
        body: {
          serviceName: 'slack',
          connectionType: 'oauth',
          credentials: { token: 'new-token' }
        },
        logger: console
      };

      const result = await controller.connectExternalService(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Service connection already exists');
    });
  });

  describe('executeExternalApiRequest', () => {
    it('should execute an external API request successfully', async () => {
      // Mock axios response
      const mockResponse = {
        status: 200,
        headers: { 'content-type': 'application/json' },
        data: { message: 'Success' }
      };
      vi.spyOn(axios, 'request').mockResolvedValue(mockResponse);

      const mockContext = {
        body: {
          method: 'GET',
          url: 'https://api.example.com/test',
          headers: { 'Authorization': 'Bearer test-token' }
        },
        logger: console
      };

      const result = await controller.executeExternalApiRequest(mockContext);

      expect(result.success).toBe(true);
      expect(result.data.status).toBe(200);
      expect(result.data.data).toEqual({ message: 'Success' });
    });

    it('should handle API request errors', async () => {
      // Mock axios error
      const mockError = {
        response: {
          status: 404,
          data: { message: 'Not Found' }
        }
      };
      vi.spyOn(axios, 'request').mockRejectedValue(mockError);

      const mockContext = {
        body: {
          method: 'GET',
          url: 'https://api.example.com/nonexistent'
        },
        logger: console
      };

      const result = await controller.executeExternalApiRequest(mockContext);

      expect(result.success).toBe(false);
      expect(result.error).toBe('External API request failed');
      expect(result.details.status).toBe(404);
    });
  });
});