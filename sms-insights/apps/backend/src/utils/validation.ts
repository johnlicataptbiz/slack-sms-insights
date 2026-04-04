import { z } from 'zod';
import { ValidationError } from './errors.js';

export function validateData<T>(schema: z.ZodSchema<T>, data: unknown): T {
  try {
    return schema.parse(data);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errorMessages = error.issues.map((err: z.ZodIssue) => `${err.path.join('.')}: ${err.message}`);
      throw new ValidationError(`Validation failed: ${errorMessages.join(', ')}`);
    }
    throw new ValidationError('Validation failed');
  }
}

export function validateParams<T>(schema: z.ZodSchema<T>, params: Record<string, string>): T {
  return validateData(schema, params);
}

// Common validation schemas
export const paginationSchema = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(100).default(20),
});

export const dateRangeSchema = z.object({
  startDate: z.string().datetime(),
  endDate: z.string().datetime(),
});

export const idSchema = z.object({
  id: z.string().min(1),
});
