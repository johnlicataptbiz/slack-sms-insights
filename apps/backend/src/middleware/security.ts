import rateLimit from 'express-rate-limit';
import helmet from 'helmet';

export const securityMiddleware = [
  helmet(),
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
  }),
];

import { z } from 'zod';
type ZodSchema = z.ZodSchema;
export const validateRequest = (schema: ZodSchema) => {
import type { NextFunction, Request, Response } from 'express';
  return (req: Request, res: Response, next: NextFunction) => {
    // Zod validation implementation
  };
};
