import type { Logger } from '@slack/bolt';
import { maybeRecordConversionExample } from './conversion-example-ingestion.js';
import { syncQualificationFromConversationText } from './qualification-sync.js';
import { publishRealtimeEvent } from './realtime.js';
import type { SmsEventDirection, SmsEventRow } from './sms-event-store.js';
import { linkSmsEventToConversation } from './sms-event-store.js';
import { getPrismaClient } from './prisma.js';

export type ConversationRow = {
  id: string;
  contact_key: string;
  contact_id: string | null;
  contact_phone: string | null;
  current_rep_id: string | null;
  status: 'open' | 'closed' | 'dnc';
  last_inbound_at: Date | null;
  last_outbound_at: Date | null;
  last_touch_at: Date | null;
  unreplied_inbound_count: number;
  next_followup_due_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

const getPrisma = () => getPrismaClient();

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

  const prisma = getPrisma();
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

    const results = await prisma.$queryRawUnsafe<ConversationRow[]>(
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
      contactKey,
      event.contact_id,
      event.contact_phone ? normalizeDigits(event.contact_phone) : null,
      lastInboundAt,
      lastOutboundAt,
      lastTouchAt,
      isInbound(event.direction) ? 1 : 0,
      shouldResetUnreplied,
      unrepliedDelta,
    );

    const row = results[0] ?? null;
    if (row) {
      await linkSmsEventToConversation(event.id, row.id, logger);

      // ── Live conversion-example ingestion ──────────────────────────────
      // When an inbound reply arrives, record the outbound message that
      // preceded it as a "got_reply" conversion example so the training
      // corpus grows continuously from real conversations.
      if (event.direction === 'inbound') {
        void maybeRecordConversionExample(event, row.id, logger).catch((err) => {
          logger?.warn?.('[projector] Conversion example recording failed (non-fatal):', err);
        });
      }

      void syncQualificationFromConversationText(
        {
          conversationId: row.id,
          contactKey: row.contact_key,
          contactId: row.contact_id,
          triggerDirection: event.direction,
        },
        logger,
      ).catch((error) => {
        logger?.warn?.('Auto qualification sync failed during ingestion', {
          conversationId: row.id,
          error: error instanceof Error ? error.message : String(error),
        });
      });
      publishRealtimeEvent({ type: 'conversation_updated', id: row.id, ts: new Date().toISOString() }, logger);
    }
    return row;
  } catch (err) {
    logger?.error('upsertConversationFromEvent failed', err);
    throw err;
  }
};
