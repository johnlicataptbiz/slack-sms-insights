import type { Logger } from '@slack/bolt';
import type { ConversationRow } from './conversation-projector.js';
import { getPrismaClient } from './prisma.js';
import type { SmsEventRow } from './sms-event-store.js';

const getPrisma = () => getPrismaClient();

// No longer need getDbOrThrow as getPrisma handles error states or lazy initialization.

export const getConversationById = async (
  id: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<ConversationRow | null> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.conversation.findUnique({
      where: { id },
    });
    return result as unknown as ConversationRow | null;
  } catch (err) {
    logger?.error('getConversationById failed', err);
    throw err;
  }
};

export const listSmsEventsForConversation = async (
  conversation: Pick<ConversationRow, 'id' | 'contact_id' | 'contact_phone'>,
  limit: number,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<
  Array<Pick<SmsEventRow, 'id' | 'direction' | 'body' | 'event_ts' | 'slack_channel_id' | 'slack_message_ts'>>
> => {
  const prisma = getPrisma();
  try {
    const results = await prisma.sms_events.findMany({
      where: {
        OR: [
          { conversation_id: conversation.id },
          {
            conversation_id: null,
            OR: [
              conversation.contact_id ? { contact_id: conversation.contact_id } : {},
              (!conversation.contact_id && conversation.contact_phone) ? { contact_phone: conversation.contact_phone } : {},
            ].filter(obj => Object.keys(obj).length > 0) as any,
          },
        ],
      },
      orderBy: { event_ts: 'desc' },
      take: limit,
      select: {
        id: true,
        direction: true,
        body: true,
        event_ts: true,
        slack_channel_id: true,
        slack_message_ts: true,
      },
    });

    return results as unknown as Array<Pick<SmsEventRow, 'id' | 'direction' | 'body' | 'event_ts' | 'slack_channel_id' | 'slack_message_ts'>>;
  } catch (err) {
    logger?.error('listSmsEventsForConversation failed', err);
    throw err;
  }
};
