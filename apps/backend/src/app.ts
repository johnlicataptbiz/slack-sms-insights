import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import { AuthController } from "./controllers/auth.controller.js";
import { HealthController } from "./controllers/health.controller.js";
import { connectPrisma } from "./lib/prisma.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requestLogger } from "./middleware/request-logger.js";
import { securityMiddleware } from "./middleware/security.js";
import {
  authMiddleware,
  roleMiddleware,
} from "./middleware/auth-middleware.js";
import v2Router from "./routes/v2.routes.js";
import alowareRouter from "./webhooks/aloware.js";
import { createAuthRoutes } from "./routes/auth.routes.js";
import { createConversationRoutes } from "./routes/conversation.routes.js";
import { createMetricsRoutes } from "./routes/metrics.routes.js";
import jwt from "jsonwebtoken";

export class App {
  public app: express.Application;
  public readonly logger: Console;
  private port: number;

  constructor(port = 3001, logger = console) {
    this.app = express();
    this.logger = logger;
    this.port = port;
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    this.app.use(helmet());
    this.app.use(
      cors({
        origin:
          process.env.NODE_ENV === "production"
            ? process.env.FRONTEND_URL
            : ["http://localhost:3000", "http://localhost:5173"],
        credentials: true,
      }),
    );
    this.app.use(compression());
    this.app.use(express.json({ limit: "1mb" }));
    this.app.use(express.urlencoded({ extended: true }));
    this.app.use(requestLogger as express.RequestHandler);
  }

  private initializeRoutes(): void {
    const router = express.Router();

    // Apply rate limiting to auth endpoints
    const authLimiter = securityMiddleware[1] as express.RequestHandler;
    router.use("/auth", authLimiter);

    // Health check
    router.get("/health", async (req, res) => {
      const controller = new HealthController(this.logger);
      const context = {
        req,
        res,
        logger: this.logger,
        params: {},
        query: {},
        body: undefined,
      };
      try {
        await controller.execute(context);
      } catch (error) {
        this.logger.error("Health check failed:", error);
        res.status(500).json({ error: "Health check failed" });
      }
    });

    // Auth routes
    const authController = new AuthController(this.logger);
    // Auth token verification — validates JWT and returns user info
    router.get("/auth/verify", authMiddleware, async (req, res) => {
      res.json({
        success: true,
        data: req.user,
      });
    });

    router.post("/auth/login", async (req, res) => {
      const context = {
        req,
        res,
        logger: this.logger,
        params: {},
        query: {},
        body: req.body,
      };
      try {
        const result = await authController.login(context);
        if (result) {
          res.status(result.statusCode || 200).json(result);
        }
      } catch (error) {
        this.logger.error("Auth login error:", error);
        res.status(500).json({ error: "Login failed" });
      }
    });

    // V2 routes (requires authentication)
    router.use("/v2", authMiddleware, v2Router);

    // Business domain routes
    router.use(
      "/conversations",
      authMiddleware,
      createConversationRoutes(this.logger),
    );
    router.use("/metrics", authMiddleware, createMetricsRoutes(this.logger));
    router.use("/auth", createAuthRoutes(this.logger));

    this.app.use("/api", router);

    // Webhooks (separate from /api to avoid auth/rate-limiting meant for humans)
    this.app.use("/webhooks/aloware", alowareRouter);
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      try {
        await connectPrisma();
        this.logger.log("✅ Database connection established");
      } catch (dbError) {
        this.logger.warn(
          "⚠️ Database connection deferred (expected during migration)",
        );
      }

      this.app.listen(this.port, () => {
        this.logger.log(`🚀 Server running on port ${this.port}`);
        this.logger.log(`📊 Health: http://localhost:${this.port}/api/health`);
      });
    } catch (error) {
      this.logger.error("Failed to start server:", error);
      process.exit(1);
    }
  }

  public getApp(): express.Application {
    return this.app;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number.parseInt(process.env.PORT || "3001", 10);
  const app = new App(port);
  app.start().catch(console.error);
}
