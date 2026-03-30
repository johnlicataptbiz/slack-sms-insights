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

import { z } from "zod";

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
  status: z.enum(["open", "closed", "dnc"]),
  last_touch_at: z.date().nullable(),
  last_inbound_at: z.date().nullable(),
  last_outbound_at: z.date().nullable(),
  unreplied_inbound_count: z.number().int().nonnegative(),
  created_at: z.date(),
  updated_at: z.date(),
});

export type ConversationListSelect = z.infer<
  typeof ConversationListSelectSchema
>;

/**
 * Full conversation details with all fields
 * Used for detail views and API responses
 */
export const ConversationDetailSelectSchema =
  ConversationListSelectSchema.extend({
    contact_id: z.string().nullable(),
    contact_phone: z.string().nullable(),
    next_followup_due_at: z.date().nullable(),
    first_engagement_at: z.date().nullable(),
    metadata_updated_at: z.date(),
  });

export type ConversationDetailSelect = z.infer<
  typeof ConversationDetailSelectSchema
>;

// ============================================================================
// SMS EVENT SCHEMAS
// ============================================================================

/**
 * Minimal SMS event for event streams and timelines
 * Optimized for high-volume list rendering
 */
export const SmsEventListSelectSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  contact_id: z.string().nullable(),
  contact_phone: z.string().nullable(),
  normalized_phone: z.string().nullable(),
  direction: z.enum(["inbound", "outbound", "unknown"]),
  body: z.string().min(1, "SMS body cannot be empty after Phase 2 backfill"),
  event_ts: z.date(),
  sequence_id: z.string().nullable(),
  created_at: z.date(),
  recorded_at: z.date(),
});

export type SmsEventListSelect = z.infer<typeof SmsEventListSelectSchema>;

/**
 * Full SMS event details with all metadata
 * Used for detailed event inspection and analytics
 */
export const SmsEventDetailSelectSchema = SmsEventListSelectSchema.extend({
  event_role: z.string().nullable(),
  event_type: z.string().nullable(),
  last_modified_at: z.date(),
  // Additional fields if needed from Phase 3
});

export type SmsEventDetailSelect = z.infer<typeof SmsEventDetailSelectSchema>;

// ============================================================================
// INBOX CONTACT PROFILE SCHEMAS
// ============================================================================

/**
 * Contact profile for inbox and lead source filtering
 * Optimized for dashboard views and contact pipeline
 */
export const InboxContactProfileSelectSchema = z.object({
  id: z.string().uuid(),
  contact_key: z.string(),
  lead_source: z.string().nullable(),
  text_authorized: z.boolean().nullable(),
  is_blocked: z.boolean().nullable(),
  last_engagement_at: z.date().nullable(),
  engagement_score: z.number().nullable(),
  created_at: z.date(),
  discovered_at: z.date(),
  profile_synced_at: z.date().nullable(),
  profile_updated_at: z.date(),
});

export type InboxContactProfileSelect = z.infer<
  typeof InboxContactProfileSelectSchema
>;

// ============================================================================
// SEND ATTEMPT SCHEMAS
// ============================================================================

/**
 * Send attempt for message history and delivery tracking
 */
export const SendAttemptSelectSchema = z.object({
  id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  status: z.enum([
    "blocked",
    "pending",
    "sent",
    "failed",
    "throttled",
    "delivered",
    "errored",
  ]),
  message_body: z.string(),
  sender_identity: z.string().nullable(),
  from_number: z.string().nullable(),
  retry_count: z.number().int().nonnegative(),
  error_message: z.string().nullable(),
  created_at: z.date(),
});

export type SendAttemptSelect = z.infer<typeof SendAttemptSelectSchema>;

// ============================================================================
// REPRESENTATIVE SCHEMAS
// ============================================================================

/**
 * Rep profile for assignment and dashboard views
 * Minimal fields for list rendering
 */
export const RepresentativeSelectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  email: z.string().email().nullable(),
  is_active: z.boolean().default(true),
  created_at: z.date(),
  updated_at: z.date(),
});

export type RepresentativeSelect = z.infer<typeof RepresentativeSelectSchema>;

// ============================================================================
// AGGREGATION RESULT SCHEMAS
// ============================================================================

/**
 * Daily rep summary for analytics and reporting
 * Result of groupBy/aggregate queries
 */
export const RepDailySummarySchema = z.object({
  day: z.date(),
  rep_id: z.string().uuid(),
  sms_sent_count: z.number().int().nonnegative(),
  sms_delivered_count: z.number().int().nonnegative(),
  conversations_active: z.number().int().nonnegative(),
  avg_response_time_seconds: z.number().nonnegative().nullable(),
  created_at: z.date(),
});

export type RepDailySummary = z.infer<typeof RepDailySummarySchema>;

/**
 * Contact source distribution for pipeline analysis
 * Result of groupBy query
 */
export const SourceDistributionSchema = z.object({
  lead_source: z.string().nullable(),
  contact_count: z.number().int().nonnegative(),
  engaged_count: z.number().int().nonnegative(),
  blocked_count: z.number().int().nonnegative(),
});

export type SourceDistribution = z.infer<typeof SourceDistributionSchema>;

// ============================================================================
// VALIDATION UTILITIES
// ============================================================================

/**
 * Parse and validate a single result
 * Logs detailed error info if validation fails
 */
export async function validateResult<T>(
  schema: z.ZodSchema<T>,
  data: unknown,
  context: string = "database result",
): Promise<T> {
  try {
    return await schema.parseAsync(data);
  } catch (error) {
    console.error(`Validation failed for ${context}:`, {
      error: error instanceof z.ZodError ? error.errors : String(error),
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
  context: string = "database results",
): Promise<T[]> {
  return Promise.all(
    items.map((item, idx) =>
      validateResult(schema, item, `${context}[${idx}]`),
    ),
  );
}

// ============================================================================
// ARRAY SCHEMAS (for .findMany results)
// ============================================================================

export const ConversationListArraySchema = z.array(
  ConversationListSelectSchema,
);
export type ConversationListArray = z.infer<typeof ConversationListArraySchema>;

export const SmsEventListArraySchema = z.array(SmsEventListSelectSchema);
export type SmsEventListArray = z.infer<typeof SmsEventListArraySchema>;

export const InboxContactProfileArraySchema = z.array(
  InboxContactProfileSelectSchema,
);
export type InboxContactProfileArray = z.infer<
  typeof InboxContactProfileArraySchema
>;

export const SendAttemptArraySchema = z.array(SendAttemptSelectSchema);
export type SendAttemptArray = z.infer<typeof SendAttemptArraySchema>;

// ============================================================================
// SELECT PATTERN SCHEMAS (Phase 3 Optimization)
// ============================================================================

/**
 * Optimized SELECT pattern for conversation detail views
 * Reduces payload from ~50-100 fields to ~15 fields
 */
export const ConversationDetailSelectPattern = {
  id: true,
  contactKey: true,
  status: true,
  last_touch_at: true,
  conversation_notes: {
    select: {
      id: true,
      author: true,
      text: true,
      created_at: true,
    },
  },
  draft_suggestions: {
    select: {
      id: true,
      suggestion: true,
      created_at: true,
    },
  },
  sms_events: {
    select: {
      id: true,
      direction: true,
      body: true,
      event_ts: true,
    },
    orderBy: { event_ts: "desc" },
    take: 10,
  },
  send_attempts: {
    select: {
      id: true,
      status: true,
      created_at: true,
    },
    where: { status: { in: ["failed", "blocked"] } },
  },
} as const;

/**
 * Zod schema for validating conversation SELECT patterns
 */
export const ConversationSelectSchema = z.object({
  id: z.boolean().optional(),
  contactKey: z.boolean().optional(),
  status: z.boolean().optional(),
  last_touch_at: z.boolean().optional(),
  conversation_notes: z
    .object({
      select: z.record(z.boolean()),
    })
    .optional(),
  sms_events: z
    .object({
      select: z.record(z.boolean()),
      orderBy: z.record(z.enum(["asc", "desc"])).optional(),
      take: z.number().optional(),
    })
    .optional(),
  send_attempts: z
    .object({
      select: z.record(z.boolean()),
      where: z.record(z.any()).optional(),
    })
    .optional(),
});

/**
 * Optimized SELECT pattern for SMS events list
 */
export const SmsEventsListSelectPattern = {
  id: true,
  direction: true,
  body: true,
  event_ts: true,
  contact_id: true,
  normalized_phone: true,
} as const;

/**
 * Batch query patterns for concurrent operations
 */
export const BatchQueryPatterns = {
  /**
   * Fetch multiple conversations with optimized selects
   */
  conversationsWithRecentActivity: (conversationIds: string[]) => ({
    where: { id: { in: conversationIds } },
    select: {
      id: true,
      contactKey: true,
      status: true,
      last_touch_at: true,
      sms_events: {
        select: {
          id: true,
          direction: true,
          event_ts: true,
        },
        orderBy: { event_ts: "desc" },
        take: 5,
      },
    },
  }),

  /**
   * Fetch send attempts for multiple conversations
   */
  sendAttemptsForConversations: (conversationIds: string[]) => ({
    where: {
      conversation_id: { in: conversationIds },
      status: { in: ["failed", "blocked", "queued"] },
    },
    select: {
      id: true,
      conversation_id: true,
      status: true,
      created_at: true,
      error_message: true,
    },
    orderBy: { created_at: "desc" },
  }),
} as const;
