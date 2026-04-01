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

export const validateRequest = (_schema: ZodSchema) => {
  return (_req: Request, _res: Response, next: NextFunction) => {
    // Zod validation implementation
    next();
  };
};
