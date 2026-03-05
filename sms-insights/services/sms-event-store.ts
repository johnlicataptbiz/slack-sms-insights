import type { Logger } from '@slack/bolt';
import { getPrismaClient } from './prisma.js';

const getPrisma = () => getPrismaClient();

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
  conversation_id: string | null;
  raw: unknown | null;
  created_at: Date;
};

// No longer need getDbOrThrow as getPrisma handles error states or lazy initialization.

export const insertSmsEvent = async (
  event: NewSmsEvent,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SmsEventRow | null> => {
  const prisma = getPrisma();

  try {
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
      body: event.body ?? null,
      line: event.line ?? null,
      sequence: event.sequence ?? null,
      conversation_id: event.conversationId ?? null,
      raw: (event.raw as any) ?? null,
    };

    const result = await prisma.sms_events.upsert({
      where: {
        slack_channel_id_slack_message_ts: {
          slack_channel_id: event.slackChannelId,
          slack_message_ts: event.slackMessageTs,
        },
      },
      create: data,
      update: {
        contact_id: data.contact_id,
        contact_phone: data.contact_phone,
        contact_name: data.contact_name,
        aloware_user: data.aloware_user,
        body: data.body,
        line: data.line,
        sequence: data.sequence,
        conversation_id: data.conversation_id,
        raw: data.raw,
      },
    });

    return result as unknown as SmsEventRow;
  } catch (err) {
    logger?.error('insertSmsEvent failed', err);
    throw err;
  }
};

export const linkSmsEventToConversation = async (
  eventId: string,
  conversationId: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<void> => {
  const prisma = getPrisma();

  try {
    await prisma.sms_events.updateMany({
      where: {
        id: eventId,
        OR: [
          { conversation_id: null },
          { conversation_id: conversationId },
        ],
      },
      data: {
        conversation_id: conversationId,
      },
    });
  } catch (err) {
    logger?.error('linkSmsEventToConversation failed', err);
    throw err;
  }
};

export const listWorkItemPreviewEventsByConversation = async (
  conversationId: string,
  limit: number,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<Array<Pick<SmsEventRow, 'direction' | 'body' | 'event_ts'>>> => {
  const prisma = getPrisma();

  try {
    const results = await prisma.sms_events.findMany({
      where: { conversation_id: conversationId },
      orderBy: { event_ts: 'desc' },
      take: limit,
      select: {
        direction: true,
        body: true,
        event_ts: true,
      },
    });
    return results as unknown as Array<Pick<SmsEventRow, 'direction' | 'body' | 'event_ts'>>;
  } catch (err) {
    logger?.error('listWorkItemPreviewEventsByConversation failed', err);
    return [];
  }
};
