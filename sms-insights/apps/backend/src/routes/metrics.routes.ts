import express from 'express';
import { MetricsController } from '../controllers/metrics.controller';
import { CacheMiddleware } from '../middleware/cache-middleware';
import { createQueryParserMiddleware } from '../middleware/query-parser';
import { MetricsValidator } from '../validators/metrics-validator';
import { authMiddleware, roleMiddleware } from '../middleware/auth-middleware';

export function createMetricsRoutes(logger: any) {
  const router = express.Router();
  const controller = new MetricsController(logger);

  // GET SMS performance metrics (requires authentication)
  router.get(
    '/sms-performance', 
    authMiddleware,
    roleMiddleware(['admin', 'manager']),
    createQueryParserMiddleware(MetricsValidator.smsPerformanceQuery),
    CacheMiddleware.cache({ 
      ttl: 3600,  // 1 hour cache
      keyPrefix: 'metrics:sms-performance:' 
    }),
    async (req, res) => {
      try {
        const result = await controller.getSmsPerformanceMetrics({ 
          req, 
          res, 
          query: req.parsedQuery, 
          logger 
        });

        res.json(result);
      } catch (error) {
        logger.error('SMS performance metrics route error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // GET conversation metrics (requires authentication)
  router.get(
    '/conversations', 
    authMiddleware,
    roleMiddleware(['admin', 'manager']),
    createQueryParserMiddleware(MetricsValidator.conversationMetricsQuery),
    CacheMiddleware.cache({ 
      ttl: 3600,  // 1 hour cache
      keyPrefix: 'metrics:conversations:' 
    }),
    async (req, res) => {
      try {
        const result = await controller.getConversationMetrics({ 
          req, 
          res, 
          query: req.parsedQuery, 
          logger 
        });

        res.json(result);
      } catch (error) {
        logger.error('Conversation metrics route error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // GET lead conversion metrics (requires authentication)
  router.get(
    '/lead-conversion', 
    authMiddleware,
    roleMiddleware(['admin', 'manager']),
    createQueryParserMiddleware(MetricsValidator.leadConversionQuery),
    CacheMiddleware.cache({ 
      ttl: 3600,  // 1 hour cache
      keyPrefix: 'metrics:lead-conversion:' 
    }),
    async (req, res) => {
      try {
        const result = await controller.getLeadConversionMetrics({ 
          req, 
          res, 
          query: req.parsedQuery, 
          logger 
        });

        res.json(result);
      } catch (error) {
        logger.error('Lead conversion metrics route error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // GET performance KPIs (requires authentication)
  router.get(
    '/kpis', 
    authMiddleware,
    roleMiddleware(['admin', 'manager']),
    createQueryParserMiddleware(MetricsValidator.kpiQuery),
    CacheMiddleware.cache({ 
      ttl: 3600,  // 1 hour cache
      keyPrefix: 'metrics:kpis:' 
    }),
    async (req, res) => {
      try {
        const result = await controller.getPerformanceKPIs({ 
          req, 
          res, 
          query: req.parsedQuery, 
          logger 
        });

        res.json(result);
      } catch (error) {
        logger.error('Performance KPIs route error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // GET sequence performance metrics (requires authentication)
  router.get(
    '/sequence-performance', 
    authMiddleware,
    roleMiddleware(['admin', 'manager']),
    createQueryParserMiddleware(MetricsValidator.sequencePerformanceQuery),
    CacheMiddleware.cache({ 
      ttl: 3600,  // 1 hour cache
      keyPrefix: 'metrics:sequence-performance:' 
    }),
    async (req, res) => {
      try {
        const result = await controller.getSequencePerformanceMetrics({ 
          req, 
          res, 
          query: req.parsedQuery, 
          logger 
        });

        res.json(result);
      } catch (error) {
        logger.error('Sequence performance metrics route error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // POST export metrics data (requires authentication)
  router.post(
    '/export', 
    authMiddleware,
    roleMiddleware(['admin', 'manager']),
    createQueryParserMiddleware(MetricsValidator.metricsExportQuery),
    async (req, res) => {
      try {
        const result = await controller.exportMetricsData({ 
          req, 
          res, 
          query: req.parsedQuery, 
          logger 
        });

        res.json(result);
      } catch (error) {
        logger.error('Metrics export route error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  return router;
}