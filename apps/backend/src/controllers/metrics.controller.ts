import { BaseController } from './base.controller';
import { MetricsValidator } from '../validators/metrics-validator';
import { redisCache } from '../utils/redis-cache';
import { PerformanceTracker } from '../utils/performance-tracker';
import { z } from 'zod';

/**
 * Controller for managing metrics and analytics operations
 */
export class MetricsController extends BaseController {
  /**
   * Get SMS performance metrics
   */
  async getSmsPerformanceMetrics(context: RequestContext) {
    const tracker = PerformanceTracker.start('getSmsPerformanceMetrics');

    try {
      // Validate query parameters
      const validatedQuery = MetricsValidator.smsPerformanceQuery.parse(context.query);

      // Generate cache key
      const cacheKey = `metrics:sms-performance:${JSON.stringify(validatedQuery)}`;

      // Use cached fetch to optimize performance
      const metrics = await redisCache.cachedFetch(
        cacheKey,
        async () => {
          // Construct dynamic query
          const query: Record<string, any> = {};

          if (validatedQuery.startDate) query.createdAt = { gte: new Date(validatedQuery.startDate) };
          if (validatedQuery.endDate) {
            query.createdAt = query.createdAt || {};
            query.createdAt.lte = new Date(validatedQuery.endDate);
          }
          if (validatedQuery.channel) query.channel = validatedQuery.channel;
          if (validatedQuery.campaignId) query.campaignId = validatedQuery.campaignId;
          if (validatedQuery.teamId) query.teamId = validatedQuery.teamId;
          if (validatedQuery.status) query.status = validatedQuery.status;

          // Perform aggregation based on interval
          const groupBy = this.getGroupByClause(validatedQuery.interval);

          return this.prisma.$queryRaw`
            SELECT 
              ${groupBy} as period,
              COUNT(*) as total_messages,
              COUNT(CASE WHEN status = 'sent' THEN 1 END) as sent_count,
              COUNT(CASE WHEN status = 'delivered' THEN 1 END) as delivered_count,
              COUNT(CASE WHEN status = 'read' THEN 1 END) as read_count,
              COUNT(CASE WHEN status = 'replied' THEN 1 END) as replied_count,
              AVG(CASE WHEN status = 'replied' THEN EXTRACT(EPOCH FROM (replied_at - created_at)) ELSE NULL END) as avg_response_time
            FROM sms_events
            WHERE 1=1 
            ${query.createdAt ? this.prisma.sql`AND created_at BETWEEN ${query.createdAt.gte} AND ${query.createdAt.lte}` : this.prisma.sql``}
            ${query.channel ? this.prisma.sql`AND channel = ${query.channel}` : this.prisma.sql``}
            ${query.campaignId ? this.prisma.sql`AND campaign_id = ${query.campaignId}` : this.prisma.sql``}
            ${query.teamId ? this.prisma.sql`AND team_id = ${query.teamId}` : this.prisma.sql``}
            ${query.status ? this.prisma.sql`AND status = ${query.status}` : this.prisma.sql``}
            GROUP BY period
            ORDER BY period
            LIMIT ${validatedQuery.limit}
            OFFSET ${(validatedQuery.page - 1) * validatedQuery.limit}
          `;
        },
        3600 // 1 hour cache
      );

      tracker.stop();

      return {
        success: true,
        data: metrics,
        meta: {
          page: validatedQuery.page,
          limit: validatedQuery.limit,
          interval: validatedQuery.interval
        }
      };
    } catch (error) {
      this.logger.error('Failed to retrieve SMS performance metrics', { error });
      
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
   * Get conversation metrics
   */
  async getConversationMetrics(context: RequestContext) {
    const tracker = PerformanceTracker.start('getConversationMetrics');

    try {
      // Validate query parameters
      const validatedQuery = MetricsValidator.conversationMetricsQuery.parse(context.query);

      // Generate cache key
      const cacheKey = `metrics:conversations:${JSON.stringify(validatedQuery)}`;

      // Use cached fetch to optimize performance
      const metrics = await redisCache.cachedFetch(
        cacheKey,
        async () => {
          // Construct dynamic query
          const query: Record<string, any> = {};

          if (validatedQuery.startDate) query.createdAt = { gte: new Date(validatedQuery.startDate) };
          if (validatedQuery.endDate) {
            query.createdAt = query.createdAt || {};
            query.createdAt.lte = new Date(validatedQuery.endDate);
          }
          if (validatedQuery.type) query.type = validatedQuery.type;
          if (validatedQuery.status) query.status = validatedQuery.status;
          if (validatedQuery.assignedTo) query.assignedTo = validatedQuery.assignedTo;
          if (validatedQuery.tags) query.tags = { hasSome: validatedQuery.tags };

          // Perform aggregation based on interval
          const groupBy = this.getGroupByClause(validatedQuery.interval);

          return this.prisma.$queryRaw`
            SELECT 
              ${groupBy} as period,
              COUNT(*) as total_conversations,
              COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
              COUNT(CASE WHEN status = 'resolved' THEN 1 END) as resolved_count,
              COUNT(CASE WHEN status = 'archived' THEN 1 END) as archived_count,
              AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))) as avg_resolution_time
            FROM conversations
            WHERE 1=1 
            ${query.createdAt ? this.prisma.sql`AND created_at BETWEEN ${query.createdAt.gte} AND ${query.createdAt.lte}` : this.prisma.sql``}
            ${query.type ? this.prisma.sql`AND type = ${query.type}` : this.prisma.sql``}
            ${query.status ? this.prisma.sql`AND status = ${query.status}` : this.prisma.sql``}
            ${query.assignedTo ? this.prisma.sql`AND assigned_to = ${query.assignedTo}` : this.prisma.sql``}
            ${query.tags ? this.prisma.sql`AND tags && ARRAY[${query.tags.join(',')}]` : this.prisma.sql``}
            GROUP BY period
            ORDER BY period
            LIMIT ${validatedQuery.limit}
            OFFSET ${(validatedQuery.page - 1) * validatedQuery.limit}
          `;
        },
        3600 // 1 hour cache
      );

      tracker.stop();

      return {
        success: true,
        data: metrics,
        meta: {
          page: validatedQuery.page,
          limit: validatedQuery.limit,
          interval: validatedQuery.interval
        }
      };
    } catch (error) {
      this.logger.error('Failed to retrieve conversation metrics', { error });
      
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
   * Get lead conversion metrics
   */
  async getLeadConversionMetrics(context: RequestContext) {
    const tracker = PerformanceTracker.start('getLeadConversionMetrics');

    try {
      // Validate query parameters
      const validatedQuery = MetricsValidator.leadConversionQuery.parse(context.query);

      // Generate cache key
      const cacheKey = `metrics:lead-conversion:${JSON.stringify(validatedQuery)}`;

      // Use cached fetch to optimize performance
      const metrics = await redisCache.cachedFetch(
        cacheKey,
        async () => {
          // Construct dynamic query
          const query: Record<string, any> = {};

          if (validatedQuery.startDate) query.createdAt = { gte: new Date(validatedQuery.startDate) };
          if (validatedQuery.endDate) {
            query.createdAt = query.createdAt || {};
            query.createdAt.lte = new Date(validatedQuery.endDate);
          }
          if (validatedQuery.source) query.source = validatedQuery.source;
          if (validatedQuery.campaignId) query.campaignId = validatedQuery.campaignId;
          if (validatedQuery.stage) query.stage = validatedQuery.stage;

          // Perform aggregation based on interval
          const groupBy = this.getGroupByClause(validatedQuery.interval);

          return this.prisma.$queryRaw`
            SELECT 
              ${groupBy} as period,
              COUNT(*) as total_leads,
              COUNT(CASE WHEN stage = 'lead' THEN 1 END) as lead_count,
              COUNT(CASE WHEN stage = 'opportunity' THEN 1 END) as opportunity_count,
              COUNT(CASE WHEN stage = 'customer' THEN 1 END) as customer_count,
              (COUNT(CASE WHEN stage = 'customer' THEN 1 END) * 100.0 / NULLIF(COUNT(*), 0)) as conversion_rate
            FROM leads
            WHERE 1=1 
            ${query.createdAt ? this.prisma.sql`AND created_at BETWEEN ${query.createdAt.gte} AND ${query.createdAt.lte}` : this.prisma.sql``}
            ${query.source ? this.prisma.sql`AND source = ${query.source}` : this.prisma.sql``}
            ${query.campaignId ? this.prisma.sql`AND campaign_id = ${query.campaignId}` : this.prisma.sql``}
            ${query.stage ? this.prisma.sql`AND stage = ${query.stage}` : this.prisma.sql``}
            GROUP BY period
            ORDER BY period
            LIMIT ${validatedQuery.limit}
            OFFSET ${(validatedQuery.page - 1) * validatedQuery.limit}
          `;
        },
        3600 // 1 hour cache
      );

      tracker.stop();

      return {
        success: true,
        data: metrics,
        meta: {
          page: validatedQuery.page,
          limit: validatedQuery.limit,
          interval: validatedQuery.interval
        }
      };
    } catch (error) {
      this.logger.error('Failed to retrieve lead conversion metrics', { error });
      
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
   * Get performance KPIs
   */
  async getPerformanceKPIs(context: RequestContext) {
    const tracker = PerformanceTracker.start('getPerformanceKPIs');

    try {
      // Validate query parameters
      const validatedQuery = MetricsValidator.kpiQuery.parse(context.query);

      // Generate cache key
      const cacheKey = `metrics:kpis:${JSON.stringify(validatedQuery)}`;

      // Use cached fetch to optimize performance
      const kpis = await redisCache.cachedFetch(
        cacheKey,
        async () => {
          // Construct dynamic query
          const query: Record<string, any> = {};

          if (validatedQuery.startDate) query.createdAt = { gte: new Date(validatedQuery.startDate) };
          if (validatedQuery.endDate) {
            query.createdAt = query.createdAt || {};
            query.createdAt.lte = new Date(validatedQuery.endDate);
          }
          if (validatedQuery.category) query.category = validatedQuery.category;
          if (validatedQuery.metric) query.metric = validatedQuery.metric;

          // Perform aggregation based on interval
          const groupBy = this.getGroupByClause(validatedQuery.interval);

          return this.prisma.$queryRaw`
            SELECT 
              ${groupBy} as period,
              category,
              metric,
              AVG(value) as avg_value,
              MAX(value) as max_value,
              MIN(value) as min_value
            FROM performance_kpis
            WHERE 1=1 
            ${query.createdAt ? this.prisma.sql`AND created_at BETWEEN ${query.createdAt.gte} AND ${query.createdAt.lte}` : this.prisma.sql``}
            ${query.category ? this.prisma.sql`AND category = ${query.category}` : this.prisma.sql``}
            ${query.metric ? this.prisma.sql`AND metric = ${query.metric}` : this.prisma.sql``}
            GROUP BY period, category, metric
            ORDER BY period
            LIMIT ${validatedQuery.limit}
            OFFSET ${(validatedQuery.page - 1) * validatedQuery.limit}
          `;
        },
        3600 // 1 hour cache
      );

      tracker.stop();

      return {
        success: true,
        data: kpis,
        meta: {
          page: validatedQuery.page,
          limit: validatedQuery.limit,
          interval: validatedQuery.interval
        }
      };
    } catch (error) {
      this.logger.error('Failed to retrieve performance KPIs', { error });
      
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
   * Get sequence performance metrics
   */
  async getSequencePerformanceMetrics(context: RequestContext) {
    const tracker = PerformanceTracker.start('getSequencePerformanceMetrics');

    try {
      // Validate query parameters
      const validatedQuery = MetricsValidator.sequencePerformanceQuery.parse(context.query);

      // Generate cache key
      const cacheKey = `metrics:sequence-performance:${JSON.stringify(validatedQuery)}`;

      // Use cached fetch to optimize performance
      const metrics = await redisCache.cachedFetch(
        cacheKey,
        async () => {
          // Construct dynamic query
          const query: Record<string, any> = {};

          if (validatedQuery.startDate) query.createdAt = { gte: new Date(validatedQuery.startDate) };
          if (validatedQuery.endDate) {
            query.createdAt = query.createdAt || {};
            query.createdAt.lte = new Date(validatedQuery.endDate);
          }
          if (validatedQuery.sequenceId) query.sequenceId = validatedQuery.sequenceId;
          if (validatedQuery.status) query.status = validatedQuery.status;
          if (validatedQuery.teamId) query.teamId = validatedQuery.teamId;

          // Perform aggregation based on interval
          const groupBy = this.getGroupByClause(validatedQuery.interval);

          return this.prisma.$queryRaw`
            SELECT 
              ${groupBy} as period,
              COUNT(*) as total_sequences,
              COUNT(CASE WHEN status = 'active' THEN 1 END) as active_count,
              COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_count,
              COUNT(CASE WHEN status = 'dropped' THEN 1 END) as dropped_count,
              AVG(EXTRACT(EPOCH FROM (completed_at - created_at))) as avg_sequence_duration
            FROM sequence_registry
            WHERE 1=1 
            ${query.createdAt ? this.prisma.sql`AND created_at BETWEEN ${query.createdAt.gte} AND ${query.createdAt.lte}` : this.prisma.sql``}
            ${query.sequenceId ? this.prisma.sql`AND sequence_id = ${query.sequenceId}` : this.prisma.sql``}
            ${query.status ? this.prisma.sql`AND status = ${query.status}` : this.prisma.sql``}
            ${query.teamId ? this.prisma.sql`AND team_id = ${query.teamId}` : this.prisma.sql``}
            GROUP BY period
            ORDER BY period
            LIMIT ${validatedQuery.limit}
            OFFSET ${(validatedQuery.page - 1) * validatedQuery.limit}
          `;
        },
        3600 // 1 hour cache
      );

      tracker.stop();

      return {
        success: true,
        data: metrics,
        meta: {
          page: validatedQuery.page,
          limit: validatedQuery.limit,
          interval: validatedQuery.interval
        }
      };
    } catch (error) {
      this.logger.error('Failed to retrieve sequence performance metrics', { error });
      
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
   * Export metrics data
   */
  async exportMetricsData(context: RequestContext) {
    const tracker = PerformanceTracker.start('exportMetricsData');

    try {
      // Validate query parameters
      const validatedQuery = MetricsValidator.metricsExportQuery.parse(context.query);

      // Determine export method based on format
      const exportMethod = this.getExportMethod(validatedQuery.format);

      // Fetch metrics data
      const metrics = await this.getMetricsForExport(validatedQuery);

      // Generate export file
      const exportFile = await exportMethod(metrics, validatedQuery);

      tracker.stop();

      return {
        success: true,
        data: {
          file: exportFile,
          format: validatedQuery.format
        },
        message: 'Metrics exported successfully'
      };
    } catch (error) {
      this.logger.error('Failed to export metrics data', { error });
      
      if (error instanceof z.ZodError) {
        return {
          success: false,
          error: 'Invalid export parameters',
          details: error.errors,
          statusCode: 400
        };
      }

      throw error;
    }
  }

  /**
   * Helper method to get group by clause based on interval
   */
  private getGroupByClause(interval: string): string {
    switch (interval) {
      case 'day':
        return 'DATE_TRUNC(\'day\', created_at)';
      case 'week':
        return 'DATE_TRUNC(\'week\', created_at)';
      case 'month':
        return 'DATE_TRUNC(\'month\', created_at)';
      case 'quarter':
        return 'DATE_TRUNC(\'quarter\', created_at)';
      case 'year':
        return 'DATE_TRUNC(\'year\', created_at)';
      default:
        return 'DATE_TRUNC(\'day\', created_at)';
    }
  }

  /**
   * Helper method to get export method based on format
   */
  private getExportMethod(format: string) {
    // Placeholder for export methods
    // In a real implementation, you would import libraries like csv-writer or xlsx
    switch (format) {
      case 'csv':
        return async (data: any[], query: any) => {
          // Implement CSV export logic
          return 'path/to/exported/metrics.csv';
        };
      case 'xlsx':
        return async (data: any[], query: any) => {
          // Implement XLSX export logic
          return 'path/to/exported/metrics.xlsx';
        };
      case 'json':
        return async (data: any[], query: any) => {
          // Implement JSON export logic
          return 'path/to/exported/metrics.json';
        };
      default:
        throw new Error('Unsupported export format');
    }
  }

  /**
   * Helper method to fetch metrics data for export
   */
  private async getMetricsForExport(query: any) {
    // Implement logic to fetch metrics data based on query parameters
    // This would be similar to the individual metrics methods, but without pagination
    return [];
  }
}