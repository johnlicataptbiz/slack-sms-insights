import type { Logger } from '@slack/bolt';
import type { Pool } from 'pg';
import type { ConversationRow } from './conversation-projector.js';
import { getPool } from './db.js';
import type { SmsEventRow } from './sms-event-store.js';

const getDbOrThrow = (): Pool => {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool;
};

export const getConversationById = async (
  id: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<ConversationRow | null> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query<ConversationRow>(
      `
      SELECT *
      FROM conversations
      WHERE id = $1
      LIMIT 1;
      `,
      [id],
    );
    return result.rows[0] ?? null;
  } catch (err) {
    logger?.error('getConversationById failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const listSmsEventsForConversation = async (
  conversation: Pick<ConversationRow, 'contact_id' | 'contact_phone'>,
  limit: number,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<
  Array<Pick<SmsEventRow, 'id' | 'direction' | 'body' | 'event_ts' | 'slack_channel_id' | 'slack_message_ts'>>
> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    // We don't have conversation_id on sms_events yet.
    // Prefer contact_id match when available; otherwise fall back to contact_phone.
    const result = await client.query<
      Pick<SmsEventRow, 'id' | 'direction' | 'body' | 'event_ts' | 'slack_channel_id' | 'slack_message_ts'>
    >(
      `
      SELECT id, direction, body, event_ts, slack_channel_id, slack_message_ts
      FROM sms_events
      WHERE
        ($1::text IS NOT NULL AND contact_id = $1::text)
        OR ($1::text IS NULL AND $2::text IS NOT NULL AND contact_phone = $2::text)
      ORDER BY event_ts DESC
      LIMIT $3;
      `,
      [conversation.contact_id ?? null, conversation.contact_phone ?? null, limit],
    );

    return result.rows;
  } catch (err) {
    logger?.error('listSmsEventsForConversation failed', err);
    throw err;
  } finally {
    client.release();
  }
};
