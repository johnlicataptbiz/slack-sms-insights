import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
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
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      return res.status(400).json({
        success: false,
        error: 'Invalid request payload',
        details: result.error.flatten(),
      });
    }

    const data = result.data as { body: unknown; query: unknown; params: unknown };
    req.body = data.body;
    req.query = data.query as Request['query'];
    req.params = data.params as Request['params'];
    next();
  };
};
