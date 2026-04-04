import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from '@slack/bolt';

export interface MiddlewareContext {
  req: IncomingMessage;
  res: ServerResponse;
  logger: Logger;
}

export type MiddlewareFunction = (context: MiddlewareContext, next: () => Promise<void>) => Promise<void>;

export class MiddlewareChain {
  private middlewares: MiddlewareFunction[] = [];

  use(middleware: MiddlewareFunction): this {
    this.middlewares.push(middleware);
    return this;
  }

  async execute(
    req: IncomingMessage,
    res: ServerResponse,
    logger: Logger,
    finalHandler: () => Promise<void>,
  ): Promise<void> {
    let index = 0;

    const next = async (): Promise<void> => {
      if (index < this.middlewares.length) {
        const middleware = this.middlewares[index++];
        const context: MiddlewareContext = { req, res, logger };
        await middleware(context, next);
      } else {
        await finalHandler();
      }
    };

    await next();
  }
}

// Request logging middleware
export const requestLoggingMiddleware: MiddlewareFunction = async (context, next) => {
  const { req, logger } = context;
  const startTime = Date.now();

  logger.info(`${req.method} ${req.url} - Request started`);

  await next();

  const duration = Date.now() - startTime;
  logger.info(`${req.method} ${req.url} - Request completed in ${duration}ms`);
};

// Security headers middleware
export const securityHeadersMiddleware: MiddlewareFunction = async (context, next) => {
  const { res } = context;

  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Content Security Policy for API routes
  if (context.req.url?.startsWith('/api/')) {
    res.setHeader('Content-Security-Policy', "default-src 'self'");
  }

  await next();
};

// CORS middleware
export const corsMiddleware: MiddlewareFunction = async (context, next) => {
  const { req, res } = context;

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.statusCode = 200;
    res.end();
    return;
  }

  // Set CORS headers for actual requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  await next();
};

// Error handling middleware
export const errorHandlingMiddleware = (
  errorHandler: (error: unknown, req: IncomingMessage, res: ServerResponse, logger: Logger) => Promise<void>,
): MiddlewareFunction => {
  return async (context, next) => {
    try {
      await next();
    } catch (error) {
      await errorHandler(error, context.req, context.res, context.logger);
    }
  };
};
