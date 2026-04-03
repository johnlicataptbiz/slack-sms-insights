import { z } from 'zod';
import { BaseValidator } from './base-validator';

/**
 * Validation schemas for metrics and analytics endpoints
 */
export class MetricsValidator {
  /**
   * Base time range schema for metrics queries
   */
  static timeRangeQuery = z.object({
    ...BaseValidator.pagination().shape,
    startDate: z.string().datetime().optional(),
    endDate: z.string().datetime().optional(),
    interval: z.enum(['day', 'week', 'month', 'quarter', 'year']).optional().default('day')
  });

  /**
   * SMS performance metrics query schema
   */
  static smsPerformanceQuery = z.object({
    ...MetricsValidator.timeRangeQuery.shape,
    channel: z.enum(['sms', 'whatsapp', 'email']).optional(),
    campaignId: BaseValidator.id().optional(),
    teamId: BaseValidator.id().optional(),
    status: z.enum(['sent', 'delivered', 'read', 'replied']).optional()
  });

  /**
   * Conversation metrics query schema
   */
  static conversationMetricsQuery = z.object({
    ...MetricsValidator.timeRangeQuery.shape,
    type: z.enum(['inbound', 'outbound', 'internal']).optional(),
    status: z.enum(['active', 'resolved', 'archived']).optional(),
    assignedTo: BaseValidator.id().optional(),
    tags: z.array(z.string()).optional()
  });

  /**
   * Lead conversion metrics query schema
   */
  static leadConversionQuery = z.object({
    ...MetricsValidator.timeRangeQuery.shape,
    source: z.string().optional(),
    campaignId: BaseValidator.id().optional(),
    stage: z.enum(['lead', 'opportunity', 'customer']).optional()
  });

  /**
   * Performance KPI query schema
   */
  static kpiQuery = z.object({
    ...MetricsValidator.timeRangeQuery.shape,
    category: z.enum([
      'sales', 
      'marketing', 
      'customer_service', 
      'communication', 
      'productivity'
    ]).optional(),
    metric: z.string().optional()
  });

  /**
   * Sequence performance query schema
   */
  static sequencePerformanceQuery = z.object({
    ...MetricsValidator.timeRangeQuery.shape,
    sequenceId: BaseValidator.id().optional(),
    status: z.enum(['active', 'completed', 'dropped']).optional(),
    teamId: BaseValidator.id().optional()
  });

  /**
   * Export metrics data query schema
   */
  static metricsExportQuery = z.object({
    ...MetricsValidator.timeRangeQuery.shape,
    format: z.enum(['csv', 'xlsx', 'json']).optional().default('csv'),
    includeRawData: z.boolean().optional().default(false)
  });
}