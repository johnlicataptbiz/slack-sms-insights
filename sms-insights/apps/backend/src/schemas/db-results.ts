/**
 * Database Result Validation Schemas
 *
 * These Zod schemas provide runtime validation for all database query results.
 * They ensure type safety, catch schema drift early, and provide clear error messages.
 *
 * Usage:
 *   const conversation = await ConversationSelectSchema.parseAsync(dbResult);
 *
 * Benefits:
 * - 100% runtime type safety (not just compile-time)
 * - Catches NULL values that shouldn't be NULL
 * - Prevents API responses with unexpected fields
 * - Clear error logging when validation fails
 */

import { z } from 'zod';

// ============================================================================
// CONVERSATION SCHEMAS
// ============================================================================

/**
 * Minimal conversation select for list views (dashboard, inbox)
 * Excludes large/unnecessary fields to reduce payload
 */
export const ConversationListSelectSchema = z.object({
  id: z.string().uuid(),
  contactKey: z.string(),
  current_rep_id: z.string().nullable(),
  status: z.enum(['open', 'closed', 'dnc']),
  last_touch_at: z.date().nullable(),
  last_inbound_at: z.date().nullable(),
  last_outbound_at: z.date().nullable(),
  unreplied_inbound_count: z.number().int().nonnegative(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type ConversationListSelect = z.infer<typeof ConversationListSelectSchema>;

/**
 * Full conversation details with all fields
 * Used for detail views and API responses
 */
export const ConversationDetailSelectSchema = ConversationListSelectSchema.extend({
  contact_id: z.string().nullable(),
  contact_phone: z.string().nullable(),
  next_followup_due_at: z.date().nullable(),
  first_engagement_at: z.date().nullable(),
});

export type ConversationDetailSelect = z.infer<typeof ConversationDetailSelectSchema>;

// ============================================================================
// SMS EVENT SCHEMAS
// ============================================================================

export const SmsEventListSelectSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid().nullable(),
  event_ts: z.date(),
  direction: z.enum(['inbound', 'outbound', 'unknown']),
  body: z.string().nullable(),
  sequence: z.string().nullable(),
  line: z.string().nullable(),
  aloware_user: z.string().nullable(),
  slack_channel_id: z.string(),
  slack_message_ts: z.string(),
});

export type SmsEventListSelect = z.infer<typeof SmsEventListSelectSchema>;

// ============================================================================
// INBOX CONTACT PROFILE SCHEMAS
// ============================================================================

export const InboxContactProfileSelectSchema = z.object({
  contact_key: z.string(),
  name: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  timezone: z.string().nullable(),
  niche: z.string().nullable(),
  revenue_mix_category: z.string().nullable(),
  employment_status: z.string().nullable(),
  coaching_interest: z.string().nullable(),
  dnc: z.boolean().nullable(),
});

export type InboxContactProfileSelect = z.infer<typeof InboxContactProfileSelectSchema>;

// ============================================================================
// SEND ATTEMPT SCHEMAS
// ============================================================================

export const SendAttemptSelectSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  message_body: z.string(),
  sender_identity: z.string().nullable(),
  line_id: z.string().nullable(),
  from_number: z.string().nullable(),
  allowlist_decision: z.boolean(),
  dnc_decision: z.boolean(),
  idempotency_key: z.string().nullable(),
  status: z.enum(['blocked', 'queued', 'sent', 'failed']),
  retry_count: z.number().int().nonnegative(),
  request_payload: z.any().nullable(),
  response_payload: z.any().nullable(),
  error_message: z.string().nullable(),
  created_at: z.date(),
});

export type SendAttemptSelect = z.infer<typeof SendAttemptSelectSchema>;

// ============================================================================
// VALIDATION HELPERS
// ============================================================================

/**
 * Parse and validate a single result
 * Returns validated value or throws on failure
 */
export async function validateResult<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context = 'database result',
): Promise<T> {
  try {
    return await schema.parseAsync(data);
  } catch (error) {
    const errorMessage = error instanceof z.ZodError ? error.issues : String(error);
    console.error(`Validation failed for ${context}:`, {
      error: errorMessage,
      data: JSON.stringify(data),
    });
    throw new Error(`Invalid database result: ${context}`);
  }
}

/**
 * Parse and validate a batch of results
 * Returns validated array or throws on first failure
 */
export async function validateBatch<T>(
  schema: z.ZodSchema<T>,
  items: unknown[],
  context = 'database results',
): Promise<T[]> {
  return Promise.all(items.map((item, idx) => validateResult(schema, item, `${context}[${idx}]`)));
}

// ============================================================================
// ARRAY SCHEMAS (for .findMany results)
// ============================================================================

export const ConversationListArraySchema = z.array(ConversationListSelectSchema);
export type ConversationListArray = z.infer<typeof ConversationListArraySchema>;

export const SmsEventListArraySchema = z.array(SmsEventListSelectSchema);
export type SmsEventListArray = z.infer<typeof SmsEventListArraySchema>;

export const InboxContactProfileArraySchema = z.array(InboxContactProfileSelectSchema);
export type InboxContactProfileArray = z.infer<typeof InboxContactProfileArraySchema>;

export const SendAttemptArraySchema = z.array(SendAttemptSelectSchema);
export type SendAttemptArray = z.infer<typeof SendAttemptArraySchema>;

// ============================================================================
// SELECT PATTERN SCHEMAS (Phase 3 Optimization)
// ============================================================================

/**
 * Optimized SELECT pattern for conversation detail views
 * Reduces payload from ~50-100 fields to ~15 fields
 */
