import express from 'express';
import { IntegrationController } from '../controllers/integration.controller';
import { CacheMiddleware } from '../middleware/cache-middleware';
import { createQueryParserMiddleware } from '../middleware/query-parser';
import { IntegrationValidator } from '../validators/integration-validator';
import { authMiddleware, roleMiddleware } from '../middleware/auth-middleware';

export function createIntegrationRoutes(logger: any) {
  const router = express.Router();
  const controller = new IntegrationController(logger);

  // Webhook Management Routes
  // POST register webhook (requires admin role)
  router.post(
    '/webhooks',
    authMiddleware,
    roleMiddleware(['admin']),
    createQueryParserMiddleware(IntegrationValidator.webhookRegistration),
    async (req, res) => {
      try {
        const result = await controller.registerWebhook({ 
          req, 
          res, 
          body: req.parsedQuery, 
          logger 
        });

        res.status(result.statusCode || (result.success ? 201 : 400)).json(result);
      } catch (error) {
        logger.error('Webhook registration error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // GET webhook events (requires admin role)
  router.get(
    '/webhooks/events', 
    authMiddleware,
    roleMiddleware(['admin']),
    createQueryParserMiddleware(IntegrationValidator.webhookEventQuery),
    CacheMiddleware.cache({ 
      ttl: 3600,  // 1 hour cache
      keyPrefix: 'integrations:webhook-events:' 
    }),
    async (req, res) => {
      try {
        const result = await controller.getWebhookEvents({ 
          req, 
          res, 
          query: req.parsedQuery, 
          logger 
        });

        res.json(result);
      } catch (error) {
        logger.error('Webhook events retrieval error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // POST bulk webhook event processing (requires admin role)
  router.post(
    '/webhooks/events/bulk-action',
    authMiddleware,
    roleMiddleware(['admin']),
    createQueryParserMiddleware(IntegrationValidator.bulkWebhookEventAction),
    async (req, res) => {
      try {
        const result = await controller.bulkProcessWebhookEvents({ 
          req, 
          res, 
          body: req.parsedQuery, 
          logger 
        });

        res.json(result);
      } catch (error) {
        logger.error('Bulk webhook event processing error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // External Service Connection Routes
  // POST connect external service (requires admin role)
  router.post(
    '/services/connect',
    authMiddleware,
    roleMiddleware(['admin']),
    createQueryParserMiddleware(IntegrationValidator.externalServiceConnection),
    async (req, res) => {
      try {
        const result = await controller.connectExternalService({ 
          req, 
          res, 
          body: req.parsedQuery, 
          logger 
        });

        res.status(result.statusCode || (result.success ? 201 : 400)).json(result);
      } catch (error) {
        logger.error('External service connection error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // POST configure sync integration (requires admin role)
  router.post(
    '/sync/configure',
    authMiddleware,
    roleMiddleware(['admin']),
    createQueryParserMiddleware(IntegrationValidator.syncConfiguration),
    async (req, res) => {
      try {
        const result = await controller.configureSyncIntegration({ 
          req, 
          res, 
          body: req.parsedQuery, 
          logger 
        });

        res.status(result.statusCode || (result.success ? 201 : 400)).json(result);
      } catch (error) {
        logger.error('Sync configuration error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // POST execute external API request (requires admin role)
  router.post(
    '/api/request',
    authMiddleware,
    roleMiddleware(['admin']),
    createQueryParserMiddleware(IntegrationValidator.externalApiRequest),
    async (req, res) => {
      try {
        const result = await controller.executeExternalApiRequest({ 
          req, 
          res, 
          body: req.parsedQuery, 
          logger 
        });

        res.json(result);
      } catch (error) {
        logger.error('External API request error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  return router;
}