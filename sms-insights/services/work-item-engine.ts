import type { Logger } from '@slack/bolt';
import type { ConversationRow } from './conversation-projector.js';
import { getPrismaClient } from './prisma.js';
import { publishRealtimeEvent } from './realtime.js';
import type { SmsEventRow } from './sms-event-store.js';

const getPrisma = () => getPrismaClient();

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

// No longer need getDbOrThrow as getPrisma handles error states or lazy initialization.

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
  const prisma = getPrisma();
  try {
    const dueAt = computeNeedsReplyDueAt(new Date(inboundEvent.event_ts));
    const severity = computeSeverity(inboundEvent);

    // Ensure only one open needs_reply per conversation.
    // We can use updateMany to try to update an existing open item.
    // Note: for returning the updated row, updateMany doesn't help. 
    // We'll use a transaction to find and update/create.
    
    return await prisma.$transaction(async (tx) => {
      const existing = await tx.work_items.findFirst({
        where: {
          type: 'needs_reply',
          conversation_id: conversation.id,
          resolved_at: null,
        },
      });

      if (existing) {
        const updated = await tx.work_items.update({
          where: { id: existing.id },
          data: {
            rep_id: existing.rep_id || conversation.current_rep_id,
            severity: (severity === 'high' || existing.severity === 'high') ? 'high' : 'med',
            due_at: existing.due_at < dueAt ? existing.due_at : dueAt,
          },
        });
        return updated as unknown as WorkItemRow;
      }

      const inserted = await tx.work_items.create({
        data: {
          type: 'needs_reply',
          conversation_id: conversation.id,
          rep_id: conversation.current_rep_id,
          severity: severity,
          due_at: dueAt,
          source_event_id: inboundEvent.id,
        },
      });

      if (inserted) {
        publishRealtimeEvent({ type: 'work_item_created', id: inserted.id, ts: new Date().toISOString() }, logger);
      }
      return inserted as unknown as WorkItemRow;
    });
  } catch (err) {
    logger?.error('upsertNeedsReplyWorkItem failed', err);
    throw err;
  }
};

export const resolveNeedsReplyOnOutbound = async (
  conversationId: string,
  outboundEvent: SmsEventRow,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<number> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.work_items.updateMany({
      where: {
        type: 'needs_reply',
        conversation_id: conversationId,
        resolved_at: null,
        created_at: { lte: new Date(outboundEvent.event_ts) },
      },
      data: {
        resolved_at: new Date(),
        resolution: 'replied',
      },
    });

    const count = result.count;
    if (count > 0) {
      publishRealtimeEvent({ type: 'work_item_resolved', id: conversationId, ts: new Date().toISOString() }, logger);
    }
    return count;
  } catch (err) {
    logger?.error('resolveNeedsReplyOnOutbound failed', err);
    throw err;
  }
};
