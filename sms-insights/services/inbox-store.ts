import type { Logger } from '@slack/bolt';
import type { Pool } from 'pg';
import { getPool } from './db.js';
import type { CoachingInterest, EmploymentStatus, InboxContactProfileRow, RevenueMixCategory } from './inbox-contact-profiles.js';

export type CadenceStatus = 'idle' | 'podcast_sent' | 'call_offered' | 'nurture_pool';

export type ConversationStateRow = {
  conversation_id: string;
  qualification_full_or_part_time: EmploymentStatus;
  qualification_niche: string | null;
  qualification_revenue_mix: RevenueMixCategory;
  qualification_coaching_interest: CoachingInterest;
  qualification_progress_step: number;
  escalation_level: 1 | 2 | 3 | 4;
  escalation_reason: string | null;
  escalation_overridden: boolean;
  last_podcast_sent_at: string | null;
  next_followup_due_at: string | null;
  cadence_status: CadenceStatus;
  created_at: string;
  updated_at: string;
};

export type SendAttemptStatus = 'blocked' | 'queued' | 'sent' | 'failed';

export type SendAttemptRow = {
  id: string;
  conversation_id: string;
  message_body: string;
  sender_identity: string | null;
  line_id: string | null;
  from_number: string | null;
  allowlist_decision: boolean;
  dnc_decision: boolean;
  idempotency_key: string | null;
  status: SendAttemptStatus;
  retry_count: number;
  request_payload: unknown | null;
  response_payload: unknown | null;
  error_message: string | null;
  created_at: string;
};

export type DraftSuggestionRow = {
  id: string;
  conversation_id: string;
  prompt_snapshot_hash: string;
  retrieved_exemplar_ids: unknown | null;
  generated_text: string;
  lint_score: number;
  structural_score: number;
  lint_issues: unknown | null;
  accepted: boolean;
  edited: boolean;
  send_linked_event_id: string | null;
  raw: unknown | null;
  created_at: string;
  updated_at: string;
};

export type ConversionExampleRow = {
  id: string;
  source_outbound_event_id: string;
  booked_call_label: string | null;
  closed_won_label: string | null;
  escalation_level: 1 | 2 | 3 | 4;
  structure_signature: string | null;
  qualifier_snapshot: unknown | null;
  channel_marker: string;
  created_at: string;
};

export type InboxConversationListRow = {
  id: string;
  contact_key: string;
  contact_id: string | null;
  contact_phone: string | null;
  current_rep_id: string | null;
  status: 'open' | 'closed' | 'dnc';
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_touch_at: string | null;
  unreplied_inbound_count: number;
  next_followup_due_at: string | null;
  created_at: string;
  updated_at: string;
  profile_name: string | null;
  profile_phone: string | null;
  profile_email: string | null;
  profile_timezone: string | null;
  profile_niche: string | null;
  profile_revenue_mix_category: RevenueMixCategory | null;
  profile_employment_status: EmploymentStatus | null;
  profile_coaching_interest: CoachingInterest | null;
  profile_dnc: boolean | null;
  state_escalation_level: number | null;
  state_cadence_status: CadenceStatus | null;
  state_next_followup_due_at: string | null;
  open_needs_reply_count: number;
  needs_reply_due_at: string | null;
  last_message_body: string | null;
  last_message_direction: 'inbound' | 'outbound' | 'unknown' | null;
  last_message_at: string | null;
};

export type InboxMessageRow = {
  id: string;
  conversation_id: string | null;
  event_ts: string;
  direction: 'inbound' | 'outbound' | 'unknown';
  body: string | null;
  sequence: string | null;
  line: string | null;
  aloware_user: string | null;
  slack_channel_id: string;
  slack_message_ts: string;
};

export type InboxConversationDetail = {
  conversation: InboxConversationListRow;
  profile: InboxContactProfileRow | null;
  state: ConversationStateRow;
  messages: InboxMessageRow[];
  drafts: DraftSuggestionRow[];
  mondayTrail: Array<{
    boardId: string;
    itemId: string;
    itemName: string | null;
    stage: string | null;
    callDate: string | null;
    disposition: string | null;
    isBooked: boolean;
    updatedAt: string;
  }>;
};

const getDbOrThrow = (): Pool => {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool;
};

export const getConversationState = async (
  conversationId: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<ConversationStateRow | null> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query<ConversationStateRow>(
      `
      SELECT *
      FROM conversation_state
      WHERE conversation_id = $1
      LIMIT 1;
      `,
      [conversationId],
    );

    return result.rows[0] ?? null;
  } catch (err) {
    logger?.error('getConversationState failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const ensureConversationState = async (
  conversationId: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<ConversationStateRow> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query<ConversationStateRow>(
      `
      INSERT INTO conversation_state (conversation_id)
      VALUES ($1)
      ON CONFLICT (conversation_id)
      DO UPDATE SET updated_at = NOW()
      RETURNING *;
      `,
      [conversationId],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to ensure conversation state');
    }
    return row;
  } catch (err) {
    logger?.error('ensureConversationState failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export type UpdateConversationStateInput = {
  fullOrPartTime?: EmploymentStatus;
  niche?: string | null;
  revenueMix?: RevenueMixCategory;
  coachingInterest?: CoachingInterest;
  progressStep?: number;
  escalationLevel?: 1 | 2 | 3 | 4;
  escalationReason?: string | null;
  escalationOverridden?: boolean;
  lastPodcastSentAt?: string | null;
  nextFollowupDueAt?: string | null;
  cadenceStatus?: CadenceStatus;
};

export const updateConversationState = async (
  conversationId: string,
  input: UpdateConversationStateInput,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<ConversationStateRow> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();

  try {
    await client.query(
      `
      INSERT INTO conversation_state (conversation_id)
      VALUES ($1)
      ON CONFLICT (conversation_id) DO NOTHING;
      `,
      [conversationId],
    );

    const result = await client.query<ConversationStateRow>(
      `
      UPDATE conversation_state
      SET
        qualification_full_or_part_time = COALESCE($2::text, qualification_full_or_part_time),
        qualification_niche = CASE
          WHEN $3::text IS NULL THEN qualification_niche
          ELSE $3::text
        END,
        qualification_revenue_mix = COALESCE($4::text, qualification_revenue_mix),
        qualification_coaching_interest = COALESCE($5::text, qualification_coaching_interest),
        qualification_progress_step = COALESCE($6::integer, qualification_progress_step),
        escalation_level = COALESCE($7::integer, escalation_level),
        escalation_reason = CASE
          WHEN $8::text IS NULL THEN escalation_reason
          ELSE $8::text
        END,
        escalation_overridden = COALESCE($9::boolean, escalation_overridden),
        last_podcast_sent_at = CASE
          WHEN $10::timestamptz IS NULL THEN last_podcast_sent_at
          ELSE $10::timestamptz
        END,
        next_followup_due_at = CASE
          WHEN $11::timestamptz IS NULL THEN next_followup_due_at
          ELSE $11::timestamptz
        END,
        cadence_status = COALESCE($12::text, cadence_status),
        updated_at = NOW()
      WHERE conversation_id = $1
      RETURNING *;
      `,
      [
        conversationId,
        input.fullOrPartTime ?? null,
        input.niche ?? null,
        input.revenueMix ?? null,
        input.coachingInterest ?? null,
        Number.isFinite(input.progressStep as number) ? input.progressStep : null,
        input.escalationLevel ?? null,
        input.escalationReason ?? null,
        typeof input.escalationOverridden === 'boolean' ? input.escalationOverridden : null,
        input.lastPodcastSentAt ?? null,
        input.nextFollowupDueAt ?? null,
        input.cadenceStatus ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to update conversation state');
    }

    return row;
  } catch (err) {
    logger?.error('updateConversationState failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export type ListInboxConversationsParams = {
  limit: number;
  offset: number;
  status?: 'open' | 'closed' | 'dnc';
  repId?: string;
  needsReplyOnly?: boolean;
  search?: string;
};

export const listInboxConversations = async (
  params: ListInboxConversationsParams,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<InboxConversationListRow[]> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const where: string[] = [];
    const values: Array<string | number | boolean> = [];
    let index = 1;

    if (params.status) {
      where.push(`c.status = $${index++}`);
      values.push(params.status);
    }
    if (params.repId) {
      where.push(`c.current_rep_id = $${index++}`);
      values.push(params.repId);
    }
    if (params.needsReplyOnly) {
      where.push('COALESCE(open_items.open_needs_reply_count, 0) > 0');
    }
    if (params.search && params.search.trim().length > 0) {
      where.push(`(
        COALESCE(p.name, '') ILIKE $${index}
        OR COALESCE(p.phone, '') ILIKE $${index}
        OR COALESCE(c.contact_phone, '') ILIKE $${index}
        OR COALESCE(c.contact_key, '') ILIKE $${index}
      )`);
      values.push(`%${params.search.trim()}%`);
      index += 1;
    }

    const limit = Math.max(1, Math.min(params.limit, 200));
    const offset = Math.max(0, params.offset);

    values.push(limit);
    const limitPlaceholder = `$${index++}`;
    values.push(offset);
    const offsetPlaceholder = `$${index++}`;

    const sql = `
      WITH open_items AS (
        SELECT
          conversation_id,
          COUNT(*) FILTER (WHERE type = 'needs_reply' AND resolved_at IS NULL) AS open_needs_reply_count,
          MIN(due_at) FILTER (WHERE type = 'needs_reply' AND resolved_at IS NULL) AS needs_reply_due_at
        FROM work_items
        GROUP BY conversation_id
      ),
      latest_message AS (
        SELECT DISTINCT ON (conversation_id)
          conversation_id,
          body,
          direction,
          event_ts
        FROM sms_events
        WHERE conversation_id IS NOT NULL
        ORDER BY conversation_id, event_ts DESC
      )
      SELECT
        c.id,
        c.contact_key,
        c.contact_id,
        c.contact_phone,
        c.current_rep_id,
        c.status,
        c.last_inbound_at,
        c.last_outbound_at,
        c.last_touch_at,
        c.unreplied_inbound_count,
        c.next_followup_due_at,
        c.created_at,
        c.updated_at,
        p.name AS profile_name,
        p.phone AS profile_phone,
        p.email AS profile_email,
        p.timezone AS profile_timezone,
        p.niche AS profile_niche,
        p.revenue_mix_category AS profile_revenue_mix_category,
        p.employment_status AS profile_employment_status,
        p.coaching_interest AS profile_coaching_interest,
        p.dnc AS profile_dnc,
        s.escalation_level AS state_escalation_level,
        s.cadence_status AS state_cadence_status,
        s.next_followup_due_at AS state_next_followup_due_at,
        COALESCE(open_items.open_needs_reply_count, 0)::integer AS open_needs_reply_count,
        open_items.needs_reply_due_at,
        latest_message.body AS last_message_body,
        latest_message.direction AS last_message_direction,
        latest_message.event_ts AS last_message_at
      FROM conversations c
      LEFT JOIN inbox_contact_profiles p
        ON p.contact_key = c.contact_key
      LEFT JOIN conversation_state s
        ON s.conversation_id = c.id
      LEFT JOIN open_items
        ON open_items.conversation_id = c.id
      LEFT JOIN latest_message
        ON latest_message.conversation_id = c.id
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY
        CASE WHEN COALESCE(open_items.open_needs_reply_count, 0) > 0 THEN 0 ELSE 1 END ASC,
        c.last_touch_at DESC NULLS LAST,
        c.updated_at DESC
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder};
    `;

    const result = await client.query<InboxConversationListRow>(sql, values);
    return result.rows;
  } catch (err) {
    logger?.error('listInboxConversations failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const getInboxConversationById = async (
  conversationId: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<InboxConversationListRow | null> => {
  const rows = await listInboxConversations({ limit: 1, offset: 0, search: undefined }, logger);
  const direct = rows.find((row) => row.id === conversationId);
  if (direct) return direct;

  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query<InboxConversationListRow>(
      `
      WITH open_items AS (
        SELECT
          conversation_id,
          COUNT(*) FILTER (WHERE type = 'needs_reply' AND resolved_at IS NULL) AS open_needs_reply_count,
          MIN(due_at) FILTER (WHERE type = 'needs_reply' AND resolved_at IS NULL) AS needs_reply_due_at
        FROM work_items
        GROUP BY conversation_id
      ),
      latest_message AS (
        SELECT DISTINCT ON (conversation_id)
          conversation_id,
          body,
          direction,
          event_ts
        FROM sms_events
        WHERE conversation_id IS NOT NULL
        ORDER BY conversation_id, event_ts DESC
      )
      SELECT
        c.id,
        c.contact_key,
        c.contact_id,
        c.contact_phone,
        c.current_rep_id,
        c.status,
        c.last_inbound_at,
        c.last_outbound_at,
        c.last_touch_at,
        c.unreplied_inbound_count,
        c.next_followup_due_at,
        c.created_at,
        c.updated_at,
        p.name AS profile_name,
        p.phone AS profile_phone,
        p.email AS profile_email,
        p.timezone AS profile_timezone,
        p.niche AS profile_niche,
        p.revenue_mix_category AS profile_revenue_mix_category,
        p.employment_status AS profile_employment_status,
        p.coaching_interest AS profile_coaching_interest,
        p.dnc AS profile_dnc,
        s.escalation_level AS state_escalation_level,
        s.cadence_status AS state_cadence_status,
        s.next_followup_due_at AS state_next_followup_due_at,
        COALESCE(open_items.open_needs_reply_count, 0)::integer AS open_needs_reply_count,
        open_items.needs_reply_due_at,
        latest_message.body AS last_message_body,
        latest_message.direction AS last_message_direction,
        latest_message.event_ts AS last_message_at
      FROM conversations c
      LEFT JOIN inbox_contact_profiles p
        ON p.contact_key = c.contact_key
      LEFT JOIN conversation_state s
        ON s.conversation_id = c.id
      LEFT JOIN open_items
        ON open_items.conversation_id = c.id
      LEFT JOIN latest_message
        ON latest_message.conversation_id = c.id
      WHERE c.id = $1
      LIMIT 1;
      `,
      [conversationId],
    );

    return result.rows[0] ?? null;
  } catch (err) {
    logger?.error('getInboxConversationById failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const listMessagesForConversation = async (
  conversationId: string,
  limit: number,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<InboxMessageRow[]> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query<InboxMessageRow>(
      `
      SELECT
        id,
        conversation_id,
        event_ts,
        direction,
        body,
        sequence,
        line,
        aloware_user,
        slack_channel_id,
        slack_message_ts
      FROM sms_events
      WHERE conversation_id = $1
      ORDER BY event_ts ASC
      LIMIT $2;
      `,
      [conversationId, Math.max(1, Math.min(limit, 500))],
    );

    return result.rows;
  } catch (err) {
    logger?.error('listMessagesForConversation failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const listMondayTrailForContactKey = async (
  contactKey: string,
  limit: number,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<InboxConversationDetail['mondayTrail']> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query<{
      board_id: string;
      item_id: string;
      item_name: string | null;
      stage: string | null;
      call_date: string | null;
      disposition: string | null;
      is_booked: boolean;
      updated_at: string;
    }>(
      `
      SELECT
        board_id,
        item_id,
        item_name,
        stage,
        call_date,
        disposition,
        is_booked,
        updated_at
      FROM monday_call_snapshots
      WHERE contact_key = $1
      ORDER BY updated_at DESC
      LIMIT $2;
      `,
      [contactKey, Math.max(1, Math.min(limit, 50))],
    );

    return result.rows.map((row) => ({
      boardId: row.board_id,
      itemId: row.item_id,
      itemName: row.item_name,
      stage: row.stage,
      callDate: row.call_date,
      disposition: row.disposition,
      isBooked: row.is_booked,
      updatedAt: row.updated_at,
    }));
  } catch (err) {
    logger?.error('listMondayTrailForContactKey failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export type InsertSendAttemptInput = {
  conversationId: string;
  messageBody: string;
  senderIdentity?: string | null;
  lineId?: string | null;
  fromNumber?: string | null;
  allowlistDecision: boolean;
  dncDecision: boolean;
  idempotencyKey?: string | null;
  status: SendAttemptStatus;
  requestPayload?: unknown | null;
  responsePayload?: unknown | null;
  retryCount?: number;
  errorMessage?: string | null;
};

export const insertSendAttempt = async (
  input: InsertSendAttemptInput,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SendAttemptRow> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query<SendAttemptRow>(
      `
      INSERT INTO send_attempts (
        conversation_id,
        message_body,
        sender_identity,
        line_id,
        from_number,
        allowlist_decision,
        dnc_decision,
        idempotency_key,
        status,
        retry_count,
        request_payload,
        response_payload,
        error_message
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (conversation_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
      DO UPDATE SET
        response_payload = COALESCE(EXCLUDED.response_payload, send_attempts.response_payload),
        status = EXCLUDED.status,
        retry_count = GREATEST(send_attempts.retry_count, EXCLUDED.retry_count),
        error_message = COALESCE(EXCLUDED.error_message, send_attempts.error_message)
      RETURNING *;
      `,
      [
        input.conversationId,
        input.messageBody,
        input.senderIdentity ?? null,
        input.lineId ?? null,
        input.fromNumber ?? null,
        input.allowlistDecision,
        input.dncDecision,
        input.idempotencyKey ?? null,
        input.status,
        input.retryCount ?? 0,
        input.requestPayload ?? null,
        input.responsePayload ?? null,
        input.errorMessage ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to insert send attempt');
    }
    return row;
  } catch (err) {
    logger?.error('insertSendAttempt failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const getSendAttemptByIdempotency = async (
  conversationId: string,
  idempotencyKey: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SendAttemptRow | null> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query<SendAttemptRow>(
      `
      SELECT *
      FROM send_attempts
      WHERE conversation_id = $1
        AND idempotency_key = $2
      LIMIT 1;
      `,
      [conversationId, idempotencyKey],
    );
    return result.rows[0] ?? null;
  } catch (err) {
    logger?.error('getSendAttemptByIdempotency failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export type InsertDraftSuggestionInput = {
  conversationId: string;
  promptSnapshotHash: string;
  retrievedExemplarIds?: string[];
  generatedText: string;
  lintScore: number;
  structuralScore: number;
  lintIssues?: string[];
  raw?: unknown;
};

export const insertDraftSuggestion = async (
  input: InsertDraftSuggestionInput,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<DraftSuggestionRow> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query<DraftSuggestionRow>(
      `
      INSERT INTO draft_suggestions (
        conversation_id,
        prompt_snapshot_hash,
        retrieved_exemplar_ids,
        generated_text,
        lint_score,
        structural_score,
        lint_issues,
        raw
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING *;
      `,
      [
        input.conversationId,
        input.promptSnapshotHash,
        input.retrievedExemplarIds ? JSON.stringify(input.retrievedExemplarIds) : null,
        input.generatedText,
        input.lintScore,
        input.structuralScore,
        input.lintIssues ? JSON.stringify(input.lintIssues) : null,
        input.raw ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to insert draft suggestion');
    }
    return row;
  } catch (err) {
    logger?.error('insertDraftSuggestion failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const listDraftSuggestionsForConversation = async (
  conversationId: string,
  limit: number,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<DraftSuggestionRow[]> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query<DraftSuggestionRow>(
      `
      SELECT *
      FROM draft_suggestions
      WHERE conversation_id = $1
      ORDER BY created_at DESC
      LIMIT $2;
      `,
      [conversationId, Math.max(1, Math.min(limit, 50))],
    );
    return result.rows;
  } catch (err) {
    logger?.error('listDraftSuggestionsForConversation failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const updateDraftSuggestionFeedback = async (
  draftId: string,
  params: {
    accepted?: boolean;
    edited?: boolean;
    sendLinkedEventId?: string | null;
  },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<DraftSuggestionRow | null> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query<DraftSuggestionRow>(
      `
      UPDATE draft_suggestions
      SET
        accepted = COALESCE($2::boolean, accepted),
        edited = COALESCE($3::boolean, edited),
        send_linked_event_id = COALESCE($4::uuid, send_linked_event_id),
        updated_at = NOW()
      WHERE id = $1
      RETURNING *;
      `,
      [
        draftId,
        typeof params.accepted === 'boolean' ? params.accepted : null,
        typeof params.edited === 'boolean' ? params.edited : null,
        params.sendLinkedEventId ?? null,
      ],
    );

    return result.rows[0] ?? null;
  } catch (err) {
    logger?.error('updateDraftSuggestionFeedback failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export type UpsertConversionExampleInput = {
  sourceOutboundEventId: string;
  bookedCallLabel?: string | null;
  closedWonLabel?: string | null;
  escalationLevel: 1 | 2 | 3 | 4;
  structureSignature?: string | null;
  qualifierSnapshot?: unknown;
  channelMarker?: string;
};

export const upsertConversionExample = async (
  input: UpsertConversionExampleInput,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<ConversionExampleRow> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query<ConversionExampleRow>(
      `
      INSERT INTO conversion_examples (
        source_outbound_event_id,
        booked_call_label,
        closed_won_label,
        escalation_level,
        structure_signature,
        qualifier_snapshot,
        channel_marker
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (source_outbound_event_id)
      DO UPDATE SET
        booked_call_label = COALESCE(EXCLUDED.booked_call_label, conversion_examples.booked_call_label),
        closed_won_label = COALESCE(EXCLUDED.closed_won_label, conversion_examples.closed_won_label),
        escalation_level = EXCLUDED.escalation_level,
        structure_signature = COALESCE(EXCLUDED.structure_signature, conversion_examples.structure_signature),
        qualifier_snapshot = COALESCE(EXCLUDED.qualifier_snapshot, conversion_examples.qualifier_snapshot),
        channel_marker = COALESCE(EXCLUDED.channel_marker, conversion_examples.channel_marker)
      RETURNING *;
      `,
      [
        input.sourceOutboundEventId,
        input.bookedCallLabel ?? null,
        input.closedWonLabel ?? null,
        input.escalationLevel,
        input.structureSignature ?? null,
        input.qualifierSnapshot ?? null,
        input.channelMarker || 'sms',
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to upsert conversion example');
    }
    return row;
  } catch (err) {
    logger?.error('upsertConversionExample failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const listConversionExamples = async (
  params: {
    escalationLevel?: 1 | 2 | 3 | 4;
    bookedCallLabel?: string;
    limit: number;
  },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<Array<ConversionExampleRow & { outbound_body: string | null }>> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const where: string[] = [];
    const values: Array<string | number> = [];
    let i = 1;

    if (params.escalationLevel) {
      where.push(`ce.escalation_level = $${i++}`);
      values.push(params.escalationLevel);
    }
    if (params.bookedCallLabel) {
      where.push(`ce.booked_call_label = $${i++}`);
      values.push(params.bookedCallLabel);
    }

    values.push(Math.max(1, Math.min(params.limit, 50)));
    const limitPlaceholder = `$${i++}`;

    const result = await client.query<ConversionExampleRow & { outbound_body: string | null }>(
      `
      SELECT
        ce.*,
        e.body AS outbound_body
      FROM conversion_examples ce
      LEFT JOIN sms_events e
        ON e.id = ce.source_outbound_event_id
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ce.created_at DESC
      LIMIT ${limitPlaceholder};
      `,
      values,
    );

    return result.rows;
  } catch (err) {
    logger?.error('listConversionExamples failed', err);
    throw err;
  } finally {
    client.release();
  }
};
