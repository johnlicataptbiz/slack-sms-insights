import type { Prisma } from '@prisma/client';
import type { Logger } from '@slack/bolt';
import { getPrismaClient } from './prisma.js';
import { resolveSequenceId } from './sequence-registry.js';

const getPrisma = () => getPrismaClient();

const toNullableJson = (value: unknown): Prisma.InputJsonValue | null => {
  if (value == null) return null;
  return value as Prisma.InputJsonValue;
};


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
  event_ts: Date;
  direction: SmsEventDirection;
  contact_id: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  aloware_user: string | null;
  body: string | null;
  line: string | null;
  sequence: string | null;
  sequence_id?: string | null;
  conversation_id: string | null;
  raw: unknown | null;
  created_at: Date;
};

export const insertSmsEvent = async (
  event: NewSmsEvent,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SmsEventRow | null> => {
  const prisma = getPrisma();

  try {
    const sequenceId = await resolveSequenceId(event.sequence, prisma);
    const data = {
      slack_team_id: event.slackTeamId,
      slack_channel_id: event.slackChannelId,
      slack_message_ts: event.slackMessageTs,
      event_ts: event.eventTs,
      direction: event.direction,
      contact_id: event.contactId ?? null,
      contact_phone: event.contactPhone ?? null,
      contact_name: event.contactName ?? null,
      aloware_user: event.alowareUser ?? null,
      body: (() => {
  try {
    if (typeof event.body === 'string') return event.body;
    if (event.body == null) return null;
    return JSON.stringify(event.body);
  } catch (e) {
    logger?.warn?.('sms-event-store: body serialization failed', { error: String(e), sample: String(event.body ?? '').slice(0, 100) });
    return '';
  }
})(),
      line: event.line ?? null,
      sequence: event.sequence ?? null,
      sequence_id: sequenceId,
      conversation_id: event.conversationId ?? null,
      raw: toNullableJson(event.raw),
    };

    const rows = await prisma.$queryRawUnsafe<SmsEventRow[]>(
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
        sequence_id,
        raw
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb
      )
      ON CONFLICT (slack_channel_id, slack_message_ts)
      DO UPDATE SET
        contact_id = EXCLUDED.contact_id,
        contact_phone = EXCLUDED.contact_phone,
        contact_name = EXCLUDED.contact_name,
        aloware_user = EXCLUDED.aloware_user,
        body = EXCLUDED.body,
        line = EXCLUDED.line,
        sequence = EXCLUDED.sequence,
        sequence_id = EXCLUDED.sequence_id,
        raw = EXCLUDED.raw
      RETURNING *
      `,
      data.slack_team_id,
      data.slack_channel_id,
      data.slack_message_ts,
      data.event_ts,
      data.direction,
      data.contact_id,
      data.contact_phone,
      data.contact_name,
      data.aloware_user,
      data.body,
      data.line,
      data.sequence,
      data.sequence_id,
      data.raw ? JSON.stringify(data.raw) : null,
    );

    return rows[0] ?? null;
  } catch (err) {
    logger?.error('insertSmsEvent failed', err);
    throw err;
  }
};

// Removed conversation_id field - not in schema
export const linkSmsEventToConversation = async (
  eventId: string,
  conversationId: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<void> => {
  logger?.warn('linkSmsEventToConversation disabled - conversation_id field removed from schema');
};


export const listWorkItemPreviewEventsByConversation = async (
  conversationId: string,
  limit: number,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<Array<Pick<SmsEventRow, 'direction' | 'body' | 'event_ts'>>> => {
  const prisma = getPrisma();

  try {
// Fixed: schema lacks conversation_id, event_ts, direction - use raw query
    const results = await prisma.$queryRawUnsafe<Array<{ direction: string; body: string | null; event_ts: string }>>(
      `
      SELECT direction, body, created_at AS event_ts
      FROM sms_events
      WHERE slack_channel_id = $1
      ORDER BY created_at DESC
      LIMIT $2
      `,
      conversationId,
      limit,
    );

    return results as unknown as Array<Pick<SmsEventRow, 'direction' | 'body' | 'event_ts'>>;
  } catch (err) {
    logger?.error('listWorkItemPreviewEventsByConversation failed', err);
    return [];
  }
};
