/**
 * Input validation schemas using Zod
 * Provides type-safe validation for all API endpoints
 */

import { z } from 'zod';

// ==========================================
// Common Schemas
// ==========================================

/**
 * UUID validation
 */
export const uuidSchema = z.string().uuid();

/**
 * Slack channel ID (starts with C)
 */
export const channelIdSchema = z.string().regex(/^C[A-Z0-9]{8,}$/, 'Invalid Slack channel ID');

/**
 * Date string in ISO format
 */
export const isoDateSchema = z.string().datetime();

/**
 * Pagination parameters
 */
export const paginationSchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
});

// ==========================================
// API Route Schemas
// ==========================================

/**
 * GET /api/runs query parameters
 */
export const listRunsSchema = z.object({
  daysBack: z.coerce.number().min(1).max(90).default(7),
  channelId: channelIdSchema.optional(),
  limit: z.coerce.number().min(1).max(100).default(50),
  offset: z.coerce.number().min(0).default(0),
  raw: z.boolean().default(false),
});

/**
 * GET /api/runs/:id path parameters
 */
export const getRunSchema = z.object({
  id: uuidSchema,
});

/**
 * POST /api/runs request body
 */
export const createRunSchema = z.object({
  timestamp: isoDateSchema,
  channelId: channelIdSchema,
  channelName: z.string().min(1).max(100).nullable(),
  reportType: z.enum(['daily', 'manual', 'test']),
  status: z.enum(['success', 'error']),
  errorMessage: z.string().max(10000).nullable(),
  summaryText: z.string().min(1).max(500),
  fullReport: z.string().min(1).max(100000),
  durationMs: z.coerce.number().min(0).max(300000), // Max 5 minutes
});

/**
 * GET /api/sales-metrics query parameters
 */
export const salesMetricsSchema = z.object({
  range: z.enum(['1d', '7d', '30d', '90d']).default('7d'),
});

/**
 * GET /api/work-items query parameters
 */
export const listWorkItemsSchema = z.object({
  status: z.enum(['needs_reply', 'waiting', 'closed']).optional(),
  ...paginationSchema.shape,
});

/**
 * GET /api/work-items query parameters (v2 with additional filters)
 */
export const workItemsQuerySchema = z.object({
  type: z.enum(['needs_reply', 'waiting', 'closed', 'ALL']).optional(),
  repId: z.string().min(1).max(50).optional(),
  severity: z.enum(['low', 'med', 'high']).optional(),
  overdueOnly: z.boolean().default(false),
  dueBefore: z.union([z.string().datetime(), z.undefined()]).optional(),
  limit: z.coerce.number().min(1).max(200).default(50),
  offset: z.coerce.number().min(0).default(0),
  cursor: z.union([z.string().min(1).max(1000), z.undefined()]).optional(),
});

// ==========================================
// Type Exports
// ==========================================

export type ListRunsInput = z.infer<typeof listRunsSchema>;
export type GetRunInput = z.infer<typeof getRunSchema>;
export type CreateRunInput = z.infer<typeof createRunSchema>;
export type SalesMetricsInput = z.infer<typeof salesMetricsSchema>;
export type ListWorkItemsInput = z.infer<typeof listWorkItemsSchema>;
export type WorkItemsQueryInput = z.infer<typeof workItemsQuerySchema>;

// ==========================================
// Validation Helpers
// ==========================================

/**
 * Validate request query parameters
 * 
 * @example
 * const result = validateQuery(listRunsSchema, req.query);
 * if (!result.success) {
 *   return res.status(400).json({ error: 'Invalid input', details: result.error });
 * }
 * const { daysBack, channelId } = result.data;
 */
export function validateQuery<T extends z.ZodTypeAny>(
  schema: T,
  query: unknown
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError['issues'] } {
  const result = schema.safeParse(query);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  return { success: false, error: result.error.issues };
}

/**
 * Validate request body
 * 
 * @example
 * const result = validateBody(createRunSchema, req.body);
 * if (!result.success) {
 *   return res.status(400).json({ error: 'Invalid input', details: result.error });
 * }
 */
export function validateBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError['issues'] } {
  const result = schema.safeParse(body);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  return { success: false, error: result.error.issues };
}

/**
 * Validate path parameters
 */
export function validateParams<T extends z.ZodTypeAny>(
  schema: T,
  params: unknown
): { success: true; data: z.infer<T> } | { success: false; error: z.ZodError['issues'] } {
  const result = schema.safeParse(params);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  return { success: false, error: result.error.issues };
}

// ==========================================
// Error Formatting
// ==========================================

/**
 * Format Zod validation errors for API response
 */
export function formatValidationErrors(errors: z.ZodError['issues']): Array<{
  field: string;
  message: string;
  code: string;
}> {
  return errors.map((issue: z.ZodIssue) => ({
    field: issue.path.join('.'),
    message: issue.message,
    code: issue.code,
  }));
}

/**
 * Create a user-friendly error message from validation errors
 */
export function createErrorMessage(errors: z.ZodError['issues']): string {
  if (errors.length === 0) return 'Invalid input';
  if (errors.length === 1) return errors[0].message;
  
  const fields = errors.map((e: z.ZodIssue) => e.path.join('.')).filter(Boolean);
  if (fields.length > 0) {
    return `Invalid input for: ${fields.join(', ')}`;
  }
  
  return 'Multiple validation errors occurred';
}
