import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import type { NextFunction, Request, Response } from 'express';
import { z } from 'zod';

export const securityMiddleware = [
  helmet(),
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
  }),
];

type ZodSchema = z.ZodSchema;
export const validateRequest = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid request payload',
        details: result.error.flatten(),
      });
      return;
    }
    req.body = result.data;
    next();
  };
};
