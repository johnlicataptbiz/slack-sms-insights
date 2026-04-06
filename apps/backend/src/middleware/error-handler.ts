import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

/**
 * Centralized error handling middleware
 */
export function errorHandlerMiddleware(
  err: Error, 
  req: Request, 
  res: Response, 
  next: NextFunction
) {
  // Log the error for internal tracking
  console.error('Unhandled Error:', err);

  // Handle specific error types
  if (err instanceof ZodError) {
    // Validation error
    return res.status(400).json({
      error: 'Validation Failed',
      details: err.errors.map(e => ({
        path: e.path.join('.'),
        message: e.message
      }))
    });
  }

  if (err instanceof PrismaClientKnownRequestError) {
    // Prisma-specific error handling
    switch (err.code) {
      case 'P2002':
        return res.status(409).json({
          error: 'Unique Constraint Violation',
          details: 'A record with these details already exists'
        });
      case 'P2025':
        return res.status(404).json({
          error: 'Record Not Found',
          details: 'The requested resource could not be found'
        });
      default:
        // Generic database error
        return res.status(500).json({
          error: 'Database Error',
          details: err.message
        });
    }
  }

  // Generic error handler
  res.status(500).json({
    error: 'Internal Server Error',
    details: process.env.NODE_ENV === 'production' 
      ? 'An unexpected error occurred' 
      : err.message
  });
}

// Alias used by src/app.ts
export const errorHandler = errorHandlerMiddleware;