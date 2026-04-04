import { z } from 'zod';
import { BaseValidator } from './base-validator';

/**
 * Validation schemas for integration-related endpoints
 */
export class IntegrationValidator {
  /**
   * Webhook registration schema
   */
  static webhookRegistration = z.object({
    name: BaseValidator.string({ 
      min: 2, 
      max: 100, 
      trim: true 
    }),
    url: z.string().url('Invalid webhook URL'),
    events: z.array(z.string()).min(1, 'At least one event type is required'),
    secret: BaseValidator.string({ 
      min: 10, 
      max: 100 
    }).optional(),
    isActive: z.boolean().optional().default(true)
  });

  /**
   * External service connection schema
   */
  static externalServiceConnection = z.object({
    serviceName: z.enum([
      'monday', 
      'slack', 
      'hubspot', 
      'aloware', 
      'firebase', 
      'stripe'
    ]),
    connectionType: z.enum(['oauth', 'api_key', 'jwt', 'basic_auth']),
    credentials: z.record(z.string(), z.string()),
    scopes: z.array(z.string()).optional(),
    isActive: z.boolean().optional().default(true)
  });

  /**
   * Sync configuration schema
   */
  static syncConfiguration = z.object({
    sourceService: z.string(),
    targetService: z.string(),
    syncType: z.enum(['full', 'incremental', 'real_time']),
    frequency: z.enum(['hourly', 'daily', 'weekly', 'monthly']).optional(),
    mappings: z.array(z.object({
      sourceField: z.string(),
      targetField: z.string()
    })).min(1, 'At least one field mapping is required'),
    filters: z.record(z.string(), z.any()).optional(),
    isActive: z.boolean().optional().default(true)
  });

  /**
   * Webhook event query schema
   */
  static webhookEventQuery = z.object({
    ...BaseValidator.pagination().shape,
    serviceName: z.string().optional(),
    eventType: z.string().optional(),
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    status: z.enum(['processed', 'failed', 'pending']).optional()
  });

  /**
   * External API request validation schema
   */
  static externalApiRequest = z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']),
    url: z.string().url('Invalid API URL'),
    headers: z.record(z.string(), z.string()).optional(),
    queryParams: z.record(z.string(), z.string()).optional(),
    body: z.any().optional(),
    timeout: z.number().int().positive().optional().default(10000)
  });

  /**
   * Bulk webhook event processing schema
   */
  static bulkWebhookEventAction = z.object({
    eventIds: z.array(BaseValidator.id()).min(1, 'At least one event ID is required'),
    action: z.enum(['reprocess', 'ignore', 'retry'])
  });

  /**
   * Webhook event retry configuration schema
   */
  static webhookEventRetryConfig = z.object({
    maxRetries: z.number().int().min(0).max(10).optional().default(3),
    backoffStrategy: z.enum(['linear', 'exponential']).optional().default('exponential'),
    initialDelayMs: z.number().int().positive().optional().default(1000)
  });
}