import { BaseController } from './base.controller';
import { IntegrationValidator } from '../validators/integration-validator';
import { redisCache } from '../utils/redis-cache';
import { PerformanceTracker } from '../utils/performance-tracker';
import { z } from 'zod';
import axios from 'axios';

/**
 * Controller for managing integrations and external service connections
 */
export class IntegrationController extends BaseController {
  /**
   * Register a new webhook
   */
  async registerWebhook(context: RequestContext) {
    const tracker = PerformanceTracker.start('registerWebhook');

    try {
      // Validate input
      const validatedData = IntegrationValidator.webhookRegistration.parse(context.body);

      // Check if webhook with same URL already exists
      const existingWebhook = await this.prisma.webhook.findUnique({
        where: { url: validatedData.url }
      });

      if (existingWebhook) {
        return {
          success: false,
          error: 'Webhook with this URL already exists',
          statusCode: 409
        };
      }

      // Create webhook
      const webhook = await this.prisma.webhook.create({
        data: {
          name: validatedData.name,
          url: validatedData.url,
          events: validatedData.events,
          secret: validatedData.secret,
          isActive: validatedData.isActive
        }
      });

      // Invalidate webhooks cache
      await redisCache.delete('integrations:webhooks');

      tracker.stop();

      return {
        success: true,
        data: webhook,
        message: 'Webhook registered successfully'
      };
    } catch (error) {
      this.logger.error('Webhook registration failed', { error });
      
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
   * Connect to an external service
   */
  async connectExternalService(context: RequestContext) {
    const tracker = PerformanceTracker.start('connectExternalService');

    try {
      // Validate input
      const validatedData = IntegrationValidator.externalServiceConnection.parse(context.body);

      // Check if service connection already exists
      const existingConnection = await this.prisma.externalServiceConnection.findUnique({
        where: { 
          serviceName_connectionType: { 
            serviceName: validatedData.serviceName, 
            connectionType: validatedData.connectionType 
          } 
        }
      });

      if (existingConnection) {
        return {
          success: false,
          error: 'Service connection already exists',
          statusCode: 409
        };
      }

      // Create service connection
      const connection = await this.prisma.externalServiceConnection.create({
        data: {
          serviceName: validatedData.serviceName,
          connectionType: validatedData.connectionType,
          credentials: JSON.stringify(validatedData.credentials),
          scopes: validatedData.scopes,
          isActive: validatedData.isActive
        }
      });

      // Invalidate service connections cache
      await redisCache.delete(`integrations:${validatedData.serviceName}`);

      tracker.stop();

      return {
        success: true,
        data: connection,
        message: 'External service connected successfully'
      };
    } catch (error) {
      this.logger.error('External service connection failed', { error });
      
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
   * Configure sync between services
   */
  async configureSyncIntegration(context: RequestContext) {
    const tracker = PerformanceTracker.start('configureSyncIntegration');

    try {
      // Validate input
      const validatedData = IntegrationValidator.syncConfiguration.parse(context.body);

      // Check if sync configuration already exists
      const existingSync = await this.prisma.syncConfiguration.findFirst({
        where: {
          sourceService: validatedData.sourceService,
          targetService: validatedData.targetService
        }
      });

      if (existingSync) {
        return {
          success: false,
          error: 'Sync configuration already exists',
          statusCode: 409
        };
      }

      // Create sync configuration
      const syncConfig = await this.prisma.syncConfiguration.create({
        data: {
          sourceService: validatedData.sourceService,
          targetService: validatedData.targetService,
          syncType: validatedData.syncType,
          frequency: validatedData.frequency,
          mappings: JSON.stringify(validatedData.mappings),
          filters: validatedData.filters ? JSON.stringify(validatedData.filters) : undefined,
          isActive: validatedData.isActive
        }
      });

      // Invalidate sync configurations cache
      await redisCache.delete('integrations:sync-configs');

      tracker.stop();

      return {
        success: true,
        data: syncConfig,
        message: 'Sync configuration created successfully'
      };
    } catch (error) {
      this.logger.error('Sync configuration failed', { error });
      
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
   * Execute external API request
   */
  async executeExternalApiRequest(context: RequestContext) {
    const tracker = PerformanceTracker.start('executeExternalApiRequest');

    try {
      // Validate input
      const validatedData = IntegrationValidator.externalApiRequest.parse(context.body);

      // Perform API request
      const response = await axios({
        method: validatedData.method,
        url: validatedData.url,
        headers: validatedData.headers,
        params: validatedData.queryParams,
        data: validatedData.body,
        timeout: validatedData.timeout
      });

      tracker.stop();

      return {
        success: true,
        data: {
          status: response.status,
          headers: response.headers,
          data: response.data
        },
        message: 'External API request completed successfully'
      };
    } catch (error) {
      this.logger.error('External API request failed', { error });
      
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: 'Validation failed',
          details: error.errors,
          statusCode: 400
        };
      }

      if (axios.isAxiosError(error)) {
        return {
          success: false,
          error: 'External API request failed',
          details: {
            status: error.response?.status,
            data: error.response?.data
          },
          statusCode: error.response?.status || 500
        };
      }

      throw error;
    }
  }

  /**
   * Get webhook events with filtering
   */
  async getWebhookEvents(context: RequestContext) {
    const tracker = PerformanceTracker.start('getWebhookEvents');

    try {
      // Validate query parameters
      const validatedQuery = IntegrationValidator.webhookEventQuery.parse(context.query);

      // Generate cache key
      const cacheKey = `integrations:webhook-events:${JSON.stringify(validatedQuery)}`;

      // Use cached fetch to optimize performance
      const events = await redisCache.cachedFetch(
        cacheKey,
        async () => {
          // Construct dynamic query
          const query: Record<string, any> = {};

          if (validatedQuery.serviceName) query.serviceName = validatedQuery.serviceName;
          if (validatedQuery.eventType) query.eventType = validatedQuery.eventType;
          if (validatedQuery.status) query.status = validatedQuery.status;
          if (validatedQuery.startDate) query.createdAt = { gte: new Date(validatedQuery.startDate) };
          if (validatedQuery.endDate) {
            query.createdAt = query.createdAt || {};
            query.createdAt.lte = new Date(validatedQuery.endDate);
          }

          return this.prisma.webhookEvent.findMany({
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
        data: events,
        meta: {
          page: validatedQuery.page,
          limit: validatedQuery.limit,
          total: await this.prisma.webhookEvent.count({ where: query })
        }
      };
    } catch (error) {
      this.logger.error('Failed to retrieve webhook events', { error });
      
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
   * Bulk process webhook events
   */
  async bulkProcessWebhookEvents(context: RequestContext) {
    const tracker = PerformanceTracker.start('bulkProcessWebhookEvents');

    try {
      // Validate input
      const validatedData = IntegrationValidator.bulkWebhookEventAction.parse(context.body);

      let result;
      switch (validatedData.action) {
        case 'reprocess':
          result = await this.prisma.webhookEvent.updateMany({
            where: { id: { in: validatedData.eventIds } },
            data: { status: 'pending' }
          });
          break;
        case 'ignore':
          result = await this.prisma.webhookEvent.updateMany({
            where: { id: { in: validatedData.eventIds } },
            data: { status: 'ignored' }
          });
          break;
        case 'retry':
          // Implement retry logic with exponential backoff
          result = await this.prisma.webhookEvent.updateMany({
            where: { id: { in: validatedData.eventIds } },
            data: { 
              status: 'pending',
              retryCount: { increment: 1 }
            }
          });
          break;
        default:
          throw new Error('Unsupported bulk action');
      }

      // Invalidate webhook events cache
      await redisCache.delete('integrations:webhook-events');

      tracker.stop();

      return {
        success: true,
        data: {
          affectedCount: result.count
        },
        message: `Bulk ${validatedData.action} action completed successfully`
      };
    } catch (error) {
      this.logger.error('Bulk webhook event processing failed', { error });
      
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
}