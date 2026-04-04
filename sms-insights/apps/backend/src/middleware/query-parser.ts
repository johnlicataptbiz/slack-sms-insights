import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/**
 * Middleware for parsing and validating query parameters
 * @param schema Zod schema for query validation
 * @returns Middleware function
 */
export function createQueryParserMiddleware(schema: z.ZodObject<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    try {
      // Parse and validate query parameters
      const parsedQuery = schema.parse(req.query);
      
      // Attach parsed and validated query to request
      req.parsedQuery = parsedQuery;
      
      next();
    } catch (error) {
      // Handle validation errors
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: 'Invalid query parameters',
          details: error.errors
        });
      }
      
      // Handle other unexpected errors
      next(error);
    }
  };
}

/**
 * Utility function to create default query parameter schemas
 */
export function createDefaultQuerySchema() {
  return z.object({
    page: z.coerce.number().int().positive().optional().default(1),
    limit: z.coerce.number().int().positive().optional().default(10),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional().default('desc')
  });
}