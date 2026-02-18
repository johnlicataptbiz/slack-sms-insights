import type { Logger } from '@slack/bolt';
import type { Pool } from 'pg';
import { getPool } from './db.js';
import type { SmsEventDirection, SmsEventRow } from './sms-event-store.js';

export type ConversationRow = {
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
};

const getDbOrThrow = (): Pool => {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool;
};

const normalizeDigits = (value: string): string => value.replace(/\D/g, '');

export const computeContactKey = (event: Pick<SmsEventRow, 'contact_id' | 'contact_phone'>): string | null => {
  if (event.contact_id) return `contact:${event.contact_id}`;
  if (event.contact_phone) return `phone:${normalizeDigits(event.contact_phone)}`;
  return null;
};

const isInbound = (direction: SmsEventDirection): boolean => direction === 'inbound';
const isOutbound = (direction: SmsEventDirection): boolean => direction === 'outbound';

export const upsertConversationFromEvent = async (
  event: SmsEventRow,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<ConversationRow | null> => {
  const contactKey = computeContactKey(event);
  if (!contactKey) {
    logger?.warn('Skipping conversation upsert: missing contact_id and contact_phone', {
      slack_channel_id: event.slack_channel_id,
      slack_message_ts: event.slack_message_ts,
    });
    return null;
  }

  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const eventTs = new Date(event.event_ts);

    const lastInboundAt = isInbound(event.direction) ? eventTs : null;
    const lastOutboundAt = isOutbound(event.direction) ? eventTs : null;
    const lastTouchAt = eventTs;

    // unreplied_inbound_count logic:
    // - inbound increments
    // - outbound resets to 0 (simple, deterministic, good enough for v1)
    const unrepliedDelta = isInbound(event.direction) ? 1 : 0;
    const shouldResetUnreplied = isOutbound(event.direction);

    const result = await client.query<ConversationRow>(
      `
      INSERT INTO conversations (
        contact_key,
        contact_id,
        contact_phone,
        last_inbound_at,
        last_outbound_at,
        last_touch_at,
        unreplied_inbound_count,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7, now())
      ON CONFLICT (contact_key)
      DO UPDATE SET
        contact_id = COALESCE(conversations.contact_id, EXCLUDED.contact_id),
        contact_phone = COALESCE(conversations.contact_phone, EXCLUDED.contact_phone),
        last_inbound_at = GREATEST(conversations.last_inbound_at, EXCLUDED.last_inbound_at),
        last_outbound_at = GREATEST(conversations.last_outbound_at, EXCLUDED.last_outbound_at),
        last_touch_at = GREATEST(conversations.last_touch_at, EXCLUDED.last_touch_at),
        unreplied_inbound_count = CASE
          WHEN $8 THEN 0
          ELSE conversations.unreplied_inbound_count + $9
        END,
        updated_at = now()
      RETURNING *;
    `,
      [
        contactKey,
        event.contact_id,
        event.contact_phone ? normalizeDigits(event.contact_phone) : null,
        lastInboundAt,
        lastOutboundAt,
        lastTouchAt,
        isInbound(event.direction) ? 1 : 0,
        shouldResetUnreplied,
        unrepliedDelta,
      ],
    );

    return result.rows[0] ?? null;
  } catch (err) {
    logger?.error('upsertConversationFromEvent failed', err);
    throw err;
  } finally {
    client.release();
  }
};
