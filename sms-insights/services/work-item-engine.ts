import type { Logger } from '@slack/bolt';
import type { Pool } from 'pg';
import type { ConversationRow } from './conversation-projector.js';
import { getPool } from './db.js';
import type { SmsEventRow } from './sms-event-store.js';

export type WorkItemType = 'needs_reply' | 'sla_breach' | 'hot_lead' | 'unowned' | 'followup_due';
export type WorkItemSeverity = 'low' | 'med' | 'high';

export type WorkItemRow = {
  id: string;
  type: WorkItemType;
  conversation_id: string;
  rep_id: string | null;
  severity: WorkItemSeverity;
  created_at: string;
  due_at: string;
  resolved_at: string | null;
  resolution: string | null;
  source_event_id: string | null;
};

const getDbOrThrow = (): Pool => {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool;
};

const computeNeedsReplyDueAt = (eventTs: Date): Date => {
  // v1: simple SLA. Later: business hours + segmentation.
  const SLA_MINUTES = 5;
  return new Date(eventTs.getTime() + SLA_MINUTES * 60_000);
};

const computeSeverity = (event: SmsEventRow): WorkItemSeverity => {
  // v1 heuristic: treat unknown sequence/line as med; can be upgraded later.
  if (event.sequence && /hot|urgent|high/i.test(event.sequence)) return 'high';
  return 'med';
};

export const upsertNeedsReplyWorkItem = async (
  conversation: ConversationRow,
  inboundEvent: SmsEventRow,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<WorkItemRow | null> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const dueAt = computeNeedsReplyDueAt(new Date(inboundEvent.event_ts));
    const severity = computeSeverity(inboundEvent);

    // Ensure only one open needs_reply per conversation.
    // NOTE: We don't have a partial unique index yet, so we do:
    // 1) try update existing open item
    // 2) if none updated, insert a new one
    const update = await client.query<WorkItemRow>(
      `
      UPDATE work_items
      SET
        rep_id = COALESCE(work_items.rep_id, $2),
        severity = GREATEST(work_items.severity, $3),
        due_at = LEAST(work_items.due_at, $4)
      WHERE
        type = 'needs_reply'
        AND conversation_id = $1
        AND resolved_at IS NULL
      RETURNING *;
    `,
      [conversation.id, conversation.current_rep_id, severity, dueAt],
    );

    if (update.rows[0]) return update.rows[0];

    const insert = await client.query<WorkItemRow>(
      `
      INSERT INTO work_items (
        type,
        conversation_id,
        rep_id,
        severity,
        due_at,
        source_event_id
      )
      VALUES ($1,$2,$3,$4,$5,$6)
      RETURNING *;
    `,
      ['needs_reply', conversation.id, conversation.current_rep_id, severity, dueAt, inboundEvent.id],
    );

    return insert.rows[0] ?? null;
  } catch (err) {
    logger?.error('upsertNeedsReplyWorkItem failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const resolveNeedsReplyOnOutbound = async (
  conversationId: string,
  outboundEvent: SmsEventRow,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<number> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query(
      `
      UPDATE work_items
      SET resolved_at = now(), resolution = 'replied'
      WHERE
        type = 'needs_reply'
        AND conversation_id = $1
        AND resolved_at IS NULL
        AND created_at <= $2;
    `,
      [conversationId, outboundEvent.event_ts],
    );

    return result.rowCount ?? 0;
  } catch (err) {
    logger?.error('resolveNeedsReplyOnOutbound failed', err);
    throw err;
  } finally {
    client.release();
  }
};
