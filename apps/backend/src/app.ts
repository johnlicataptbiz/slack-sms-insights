import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';

// Import controllers
import { HealthController } from './controllers/health.controller.js';
import { AlowareController } from './controllers/aloware.controller.js';
import { AuthController } from './controllers/auth.controller.js';

// Import middleware
import { errorHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';

// Import services
import { connectPrisma } from './lib/prisma.js';

export class App {
  private app: express.Application;
  private port: number;

  constructor(port: number = 3000) {
    this.app = express();
    this.port = port;
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet());

    // CORS
    this.app.use(cors({
      origin: process.env.NODE_ENV === 'production'
        ? process.env.FRONTEND_URL
        : ['http://localhost:3000', 'http://localhost:5173'],
      credentials: true
    }));

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(json({ limit: '10mb' }));
    this.app.use(urlencoded({ extended: true }));

    // Request logging
    this.app.use(requestLogger);
  }

  private initializeRoutes(): void {
    const router = express.Router();

    // Health check
    router.get('/health', async (req, res) => {
      const healthController = new HealthController(console);
      const context = {
        req,
        res,
        logger: console,
        params: {},
        query: {},
        body: undefined
      };
      try {
        await healthController.execute(context);
      } catch (error) {
        res.status(500).json({ error: 'Health check failed' });
      }
    });

    // Auth endpoints
    const authController = new AuthController(console);
    router.get('/auth/verify', async (req, res) => {
      const context = {
        req,
        res,
        logger: console,
        params: {},
        query: {},
        body: undefined
      };
      try {
        await authController.verify(context);
      } catch (error) {
        console.error('Auth verify error:', error);
        res.status(500).json({ error: 'Auth verification failed' });
      }
    });

    router.post('/auth/login', async (req, res) => {
      const context = {
        req,
        res,
        logger: console,
        params: {},
        query: {},
        body: req.body
      };
      try {
        await authController.login(context);
      } catch (error) {
        console.error('Auth login error:', error);
        res.status(500).json({ error: 'Login failed' });
      }
    });

    // API routes
    this.app.use('/api', router);

    // Webhook routes (will be migrated from legacy)
    this.app.use('/webhooks', router);
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Attempt database connection (don't fail if unavailable during migration)
      try {
        await connectPrisma();
        console.log('✅ Database connection established');
      } catch (dbError) {
        console.log('⚠️ Database connection deferred (expected during migration)');
      }

      // Start server
      this.app.listen(this.port, () => {
        console.log(`🚀 Consolidated backend server running on port ${this.port}`);
        console.log(`📊 Health check available at http://localhost:${this.port}/api/health`);
        console.log(`🔄 Migration status: P0 Complete - Ready for schema unification`);
      });
    } catch (error) {
      console.error('Failed to start server:', error);
      process.exit(1);
    }
  }

  public getApp(): express.Application {
    return this.app;
  }
}

// For development
if (import.meta.url === `file://${process.argv[1]}`) {
  const port = parseInt(process.env.PORT || '3001', 10);
  const app = new App(port);
  app.start().catch(console.error);
}