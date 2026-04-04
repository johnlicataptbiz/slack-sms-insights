import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from '@slack/bolt';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

export class ConflictError extends AppError {
  constructor(message = 'Conflict') {
    super(message, 409);
  }
}

export function isOperationalError(error: unknown): error is AppError {
  return error instanceof AppError && error.isOperational;
}

export async function handleError(
  error: unknown,
  req: IncomingMessage,
  res: ServerResponse,
  logger: Logger,
): Promise<void> {
  let statusCode = 500;
  let message = 'Internal server error';

  if (error instanceof AppError) {
    statusCode = error.statusCode;
    message = error.message;
  } else if (error instanceof Error) {
    message = error.message;
  }

  // Log the error
  logger.error('Request error:', {
    error: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
    url: req.url,
    method: req.method,
    statusCode,
  });

  // Don't leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const errorResponse = {
    success: false,
    error: message,
    ...(isDevelopment &&
      error instanceof Error && {
        stack: error.stack,
      }),
  };

  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'X-Content-Type-Options': 'nosniff',
  });

  res.end(JSON.stringify(errorResponse));
}

export function createErrorHandler(logger: Logger) {
  return (error: unknown, req: IncomingMessage, res: ServerResponse) => handleError(error, req, res, logger);
}
