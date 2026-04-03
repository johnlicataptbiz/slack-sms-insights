import express from 'express';
import { AdminController } from '../controllers/admin.controller';
import { CacheMiddleware } from '../middleware/cache-middleware';
import { createQueryParserMiddleware } from '../middleware/query-parser';
import { AdminValidator } from '../validators/admin-validator';
import { authMiddleware, roleMiddleware } from '../middleware/auth-middleware';

export function createAdminRoutes(logger: any) {
  const router = express.Router();
  const controller = new AdminController(logger);

  // User Management Routes
  // GET list of users (requires admin role)
  router.get(
    '/users', 
    authMiddleware,
    roleMiddleware(['admin']),
    createQueryParserMiddleware(AdminValidator.userManagementQuery),
    CacheMiddleware.cache({ 
      ttl: 3600,  // 1 hour cache
      keyPrefix: 'admin:users:' 
    }),
    async (req, res) => {
      try {
        const result = await controller.getUserList({ 
          req, 
          res, 
          query: req.parsedQuery, 
          logger 
        });

        res.json(result);
      } catch (error) {
        logger.error('User list retrieval error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // POST create user (requires admin role)
  router.post(
    '/users',
    authMiddleware,
    roleMiddleware(['admin']),
    createQueryParserMiddleware(AdminValidator.createUser),
    async (req, res) => {
      try {
        const result = await controller.createUser({ 
          req, 
          res, 
          body: req.parsedQuery, 
          logger 
        });

        res.status(result.statusCode || (result.success ? 201 : 400)).json(result);
      } catch (error) {
        logger.error('User creation error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // PATCH update user (requires admin role)
  router.patch(
    '/users/:id',
    authMiddleware,
    roleMiddleware(['admin']),
    createQueryParserMiddleware(AdminValidator.updateUser),
    async (req, res) => {
      try {
        const result = await controller.updateUser({ 
          req, 
          res, 
          body: {
            ...req.parsedQuery,
            id: req.params.id
          }, 
          logger 
        });

        res.json(result);
      } catch (error) {
        logger.error('User update error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // POST bulk user actions (requires admin role)
  router.post(
    '/users/bulk-action',
    authMiddleware,
    roleMiddleware(['admin']),
    createQueryParserMiddleware(AdminValidator.bulkAction),
    async (req, res) => {
      try {
        const result = await controller.bulkUserAction({ 
          req, 
          res, 
          body: req.parsedQuery, 
          logger 
        });

        res.json(result);
      } catch (error) {
        logger.error('Bulk user action error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // System Configuration Routes
  // GET system configuration (requires admin role)
  router.get(
    '/system-config', 
    authMiddleware,
    roleMiddleware(['admin']),
    createQueryParserMiddleware(AdminValidator.systemConfigQuery),
    CacheMiddleware.cache({ 
      ttl: 3600,  // 1 hour cache
      keyPrefix: 'admin:system-config:' 
    }),
    async (req, res) => {
      try {
        const result = await controller.getSystemConfig({ 
          req, 
          res, 
          query: req.parsedQuery, 
          logger 
        });

        res.json(result);
      } catch (error) {
        logger.error('System configuration retrieval error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // PATCH update system configuration (requires admin role)
  router.patch(
    '/system-config',
    authMiddleware,
    roleMiddleware(['admin']),
    createQueryParserMiddleware(AdminValidator.updateSystemConfig),
    async (req, res) => {
      try {
        const result = await controller.updateSystemConfig({ 
          req, 
          res, 
          body: req.parsedQuery, 
          logger 
        });

        res.json(result);
      } catch (error) {
        logger.error('System configuration update error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // Audit Log Routes
  // GET audit logs (requires admin role)
  router.get(
    '/audit-logs', 
    authMiddleware,
    roleMiddleware(['admin']),
    createQueryParserMiddleware(AdminValidator.auditLogQuery),
    CacheMiddleware.cache({ 
      ttl: 3600,  // 1 hour cache
      keyPrefix: 'admin:audit-logs:' 
    }),
    async (req, res) => {
      try {
        const result = await controller.getAuditLogs({ 
          req, 
          res, 
          query: req.parsedQuery, 
          logger 
        });

        res.json(result);
      } catch (error) {
        logger.error('Audit logs retrieval error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  return router;
}