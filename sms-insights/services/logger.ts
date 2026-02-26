/**
 * Structured logging service using pino
 * Provides namespaced loggers with consistent formatting
 */

import pino from 'pino';

// Logger configuration based on environment
const loggerConfig = {
  // Development: pretty print
  development: {
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'HH:MM:ss Z',
        ignore: 'pid,hostname',
      },
    },
    level: process.env.LOG_LEVEL || 'debug',
  },

  // Production: JSON format for log aggregation
  production: {
    level: process.env.LOG_LEVEL || 'info',
    formatters: {
      level: (label: string) => ({ level: label }),
    },
  },

  // Test: silent to reduce noise
  test: {
    level: 'silent',
  },
};

/**
 * Get the current environment's logger configuration
 */
function getLoggerConfig() {
  const env = (process.env.NODE_ENV || 'development').toLowerCase();

  if (env === 'test') return loggerConfig.test;
  if (env === 'production') return loggerConfig.production;
  return loggerConfig.development;
}

/**
 * Create the root logger instance
 */
const rootLogger = pino(getLoggerConfig());

/**
 * Create a namespaced logger for a specific module/service
 *
 * @example
 * const logger = createLogger('db');
 * logger.info('Connected to database');
 * // Output: [db] Connected to database
 */
export function createLogger(namespace: string) {
  return rootLogger.child({ namespace });
}

/**
 * Pre-configured loggers for common modules
 */
export const logger = {
  app: createLogger('app'),
  api: createLogger('api'),
  db: createLogger('db'),
  slack: createLogger('slack'),
  aloware: createLogger('aloware'),
  monday: createLogger('monday'),
  ai: createLogger('ai'),
};

/**
 * Log an error with full context for debugging
 *
 * @example
 * try {
 *   await riskyOperation();
 * } catch (error) {
 *   logError(logger.api, error, 'Failed to fetch runs', { userId: '123' });
 * }
 */
export function logError(log: pino.Logger, error: unknown, message: string, context?: Record<string, unknown>) {
  const errorInfo =
    error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          stack: error.stack,
        }
      : { raw: error };

  log.error(
    {
      ...context,
      error: errorInfo,
    },
    message,
  );
}

/**
 * Log a performance metric
 *
 * @example
 * const start = Date.now();
 * await operation();
 * logPerformance(logger.db, 'query', Date.now() - start, { table: 'daily_runs' });
 */
export function logPerformance(
  log: pino.Logger,
  operation: string,
  durationMs: number,
  context?: Record<string, unknown>,
) {
  log.debug(
    {
      ...context,
      operation,
      durationMs,
    },
    `Performance: ${operation} took ${durationMs}ms`,
  );
}

/**
 * Create a request logger with request ID for tracing
 *
 * @example
 * app.use((req, res, next) => {
 *   req.log = createRequestLogger(req);
 *   next();
 * });
 */
export function createRequestLogger(req: { method: string; url: string; headers: Record<string, string> }) {
  const requestId = req.headers['x-request-id'] || generateRequestId();

  return rootLogger.child({
    requestId,
    method: req.method,
    url: req.url,
  });
}

/**
 * Generate a unique request ID
 */
function generateRequestId(): string {
  return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// Export the root logger for direct use
export { rootLogger };
