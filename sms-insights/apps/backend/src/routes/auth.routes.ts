import express from 'express';
import { AuthController } from '../controllers/auth.controller';
import { CacheMiddleware } from '../middleware/cache-middleware';
import { createQueryParserMiddleware } from '../middleware/query-parser';
import { AuthValidator } from '../validators/auth-validator';
import { authMiddleware } from '../middleware/auth-middleware';

export function createAuthRoutes(logger: any) {
  const router = express.Router();
  const controller = new AuthController(logger);

  // POST login
  router.post(
    '/login',
    createQueryParserMiddleware(AuthValidator.login),
    async (req, res) => {
      try {
        const result = await controller.login({ 
          req, 
          res, 
          body: req.parsedQuery, 
          logger 
        });

        res.status(result.statusCode || (result.success ? 200 : 400)).json(result);
      } catch (error) {
        logger.error('Login route error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // POST register
  router.post(
    '/register',
    createQueryParserMiddleware(AuthValidator.register),
    async (req, res) => {
      try {
        const result = await controller.register({ 
          req, 
          res, 
          body: req.parsedQuery, 
          logger 
        });

        res.status(result.statusCode || (result.success ? 201 : 400)).json(result);
      } catch (error) {
        logger.error('Registration route error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // POST password reset request
  router.post(
    '/reset-password',
    createQueryParserMiddleware(AuthValidator.passwordResetRequest),
    async (req, res) => {
      try {
        const result = await controller.requestPasswordReset({ 
          req, 
          res, 
          body: req.parsedQuery, 
          logger 
        });

        res.status(result.statusCode || (result.success ? 200 : 400)).json(result);
      } catch (error) {
        logger.error('Password reset request route error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // POST confirm password reset
  router.post(
    '/reset-password/confirm',
    createQueryParserMiddleware(AuthValidator.passwordResetConfirm),
    async (req, res) => {
      try {
        const result = await controller.confirmPasswordReset({ 
          req, 
          res, 
          body: req.parsedQuery, 
          logger 
        });

        res.status(result.statusCode || (result.success ? 200 : 400)).json(result);
      } catch (error) {
        logger.error('Password reset confirmation route error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  // GET user sessions (requires authentication)
  router.get(
    '/sessions',
    authMiddleware,
    createQueryParserMiddleware(AuthValidator.sessionQuery),
    CacheMiddleware.cache({ 
      ttl: 3600,  // 1 hour cache
      keyPrefix: 'user:sessions:' 
    }),
    async (req, res) => {
      try {
        const result = await controller.getUserSessions({ 
          req, 
          res, 
          query: req.parsedQuery, 
          logger 
        });

        res.json(result);
      } catch (error) {
        logger.error('User sessions route error', { error });
        res.status(500).json({ 
          success: false, 
          error: 'Internal server error' 
        });
      }
    }
  );

  return router;
}