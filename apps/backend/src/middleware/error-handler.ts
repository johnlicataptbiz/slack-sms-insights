import type { Logger } from '@slack/bolt';
import type { NextFunction, Request, Response } from 'express';

interface ErrorResponse {
  success: false;
  error: string;
  message: string;
  stack?: string;
}

export const errorHandler = (error: Error, req: Request, res: Response, next: NextFunction): void => {
  const statusCode = res.statusCode !== 200 ? res.statusCode : 500;
  const errorResponse: ErrorResponse = {
    success: false,
    error: error.name || 'InternalServerError',
    message: error.message || 'An unexpected error occurred',
  };

  // Include stack trace in development
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = error.stack;
  }

  console.error('Error:', {
    message: error.message,
    stack: error.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
  });

  res.status(statusCode).json(errorResponse);
};
