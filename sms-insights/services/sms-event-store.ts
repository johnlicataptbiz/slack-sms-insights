import type { Logger } from '@slack/bolt';
import type { Pool } from 'pg';
import { getPool } from './db.js';

export type SmsEventDirection = 'inbound' | 'outbound' | 'unknown';

export type NewSmsEvent = {
  slackTeamId: string;
  slackChannelId: string;
  slackMessageTs: string; // Slack message ts (string)
  eventTs: Date;
  direction: SmsEventDirection;
  contactId?: string | null;
  contactPhone?: string | null;
  contactName?: string | null;
  alowareUser?: string | null;
  body?: string | null;
  line?: string | null;
  sequence?: string | null;
  conversationId?: string | null;
  raw?: unknown | null;
};

export type SmsEventRow = {
  id: string;
  slack_team_id: string;
  slack_channel_id: string;
  slack_message_ts: string;
  event_ts: string;
  direction: SmsEventDirection;
  contact_id: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  aloware_user: string | null;
  body: string | null;
  line: string | null;
  sequence: string | null;
  conversation_id: string | null;
  raw: unknown | null;
  created_at: string;
};

const getDbOrThrow = (): Pool => {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool;
};

export const insertSmsEvent = async (
  event: NewSmsEvent,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SmsEventRow | null> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    // Idempotent insert: unique (slack_channel_id, slack_message_ts)
    const result = await client.query<SmsEventRow>(
      `
      INSERT INTO sms_events (
        slack_team_id,
        slack_channel_id,
        slack_message_ts,
        event_ts,
        direction,
        contact_id,
        contact_phone,
        contact_name,
        aloware_user,
        body,
        line,
        sequence,
        conversation_id,
        raw
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
      ON CONFLICT (slack_channel_id, slack_message_ts)
      DO UPDATE SET
        -- keep the first write as source of truth, but allow filling missing fields
        contact_id = COALESCE(sms_events.contact_id, EXCLUDED.contact_id),
        contact_phone = COALESCE(sms_events.contact_phone, EXCLUDED.contact_phone),
        contact_name = COALESCE(sms_events.contact_name, EXCLUDED.contact_name),
        aloware_user = COALESCE(sms_events.aloware_user, EXCLUDED.aloware_user),
        body = COALESCE(sms_events.body, EXCLUDED.body),
        line = COALESCE(sms_events.line, EXCLUDED.line),
        sequence = COALESCE(sms_events.sequence, EXCLUDED.sequence),
        conversation_id = COALESCE(sms_events.conversation_id, EXCLUDED.conversation_id),
        raw = COALESCE(sms_events.raw, EXCLUDED.raw)
      RETURNING *;
    `,
      [
        event.slackTeamId,
        event.slackChannelId,
        event.slackMessageTs,
        event.eventTs,
        event.direction,
        event.contactId ?? null,
        event.contactPhone ?? null,
        event.contactName ?? null,
        event.alowareUser ?? null,
        event.body ?? null,
        event.line ?? null,
        event.sequence ?? null,
        event.conversationId ?? null,
        event.raw ?? null,
      ],
    );

    return result.rows[0] ?? null;
  } catch (err) {
    logger?.error('insertSmsEvent failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const linkSmsEventToConversation = async (
  eventId: string,
  conversationId: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<void> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    await client.query(
      `
      UPDATE sms_events
      SET conversation_id = $2
      WHERE id = $1
        AND (conversation_id IS NULL OR conversation_id = $2);
      `,
      [eventId, conversationId],
    );
  } catch (err) {
    logger?.error('linkSmsEventToConversation failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const listWorkItemPreviewEventsByConversation = async (
  conversationId: string,
  limit: number,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<Array<Pick<SmsEventRow, 'direction' | 'body' | 'event_ts'>>> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    // We don't have conversation_id on sms_events yet; this is a placeholder for later.
    // For now, callers should use conversation.contact_id/contact_phone to query events.
    logger?.debug?.('listWorkItemPreviewEventsByConversation called but not implemented', { conversationId, limit });
    return [];
  } finally {
    client.release();
  }
};
