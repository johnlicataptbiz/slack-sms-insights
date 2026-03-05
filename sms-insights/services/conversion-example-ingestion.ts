/**
 * Live conversion-example ingestion.
 *
 * Every time an inbound SMS arrives we look back at the most recent outbound
 * message sent to that contact (within 48 h) and record it as a conversion
 * example — i.e. "this outbound message got a reply".
 *
 * This keeps the `conversion_examples` table growing continuously from real
 * conversations rather than relying on periodic backfill scripts.
 */

import type { Logger } from '@slack/bolt';
import { getPrismaClient } from './prisma.js';
import { upsertConversionExample } from './inbox-store.js';
import type { SmsEventRow } from './sms-event-store.js';

const getPrisma = () => getPrismaClient();
// ... (rest of classification patterns same as before)

// ─── Structure Signature Classification ──────────────────────────────────────
// Mirrors the patterns used in the backfill script so new examples are
// labelled consistently with the existing 1,520 training rows.

const QUESTION_RE = /\?/;

const CTA_RES = [
  /what (day|time|days|times|weekday|morning|afternoon|evening)/i,
  /am or pm/i,
  /when (works|would work|are you)/i,
  /does .{0,20} work for you/i,
  /let me know (when|if|what)/i,
  /reach out/i,
  /circle back/i,
  /follow.?up/i,
  /set (something|a call|a time|it) up/i,
  /lock (you|it|something) in/i,
  /book (a|the|your)/i,
  /schedule (a|the|your)/i,
  /hop on a call/i,
  /jump on a call/i,
  /get you (set up|on the calendar|scheduled)/i,
];

const PITCH_RES = [
  /strategy call/i,
  /free call/i,
  /discovery call/i,
  /we (help|work with|specialize)/i,
  /our (program|training|coaching|clients|residency)/i,
  /strong fit/i,
  /great fit/i,
  /perfect fit/i,
  /exactly what we/i,
  /this is exactly/i,
  /9 out of 10/i,
  /83%/i,
  /within 6 months/i,
  /not something we offer everyone/i,
  /specialized/i,
  /strong alignment/i,
];

const classifyStructure = (body: string): string => {
  if (!body || body.length < 20) return 'simple';

  const hasQuestion = QUESTION_RE.test(body);
  const hasCTA = CTA_RES.some((re) => re.test(body));
  const hasPitch = PITCH_RES.some((re) => re.test(body));

  // Short messages with no CTA/pitch signals → simple
  if (body.length < 80 && !hasCTA && !hasPitch) return 'simple';

  if (hasQuestion && hasCTA && hasPitch) return 'Q-CTA-P';
  if (hasQuestion && hasPitch) return 'Q-P';
  if (hasQuestion && hasCTA) return 'Q-CTA';
  if (hasCTA && hasPitch) return 'CTA-P';
  if (hasQuestion) return 'Q';
  if (hasCTA) return 'CTA';
  if (hasPitch) return 'P';
  return 'simple';
};

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Called after every inbound SMS event is ingested.
 * Finds the most recent outbound message in the same conversation (≤ 48 h ago)
 * and upserts it as a conversion example labelled "got_reply".
 *
 * This is intentionally fire-and-forget — callers should `void` the promise
 * and catch errors themselves so a failure here never blocks ingestion.
 */
export const maybeRecordConversionExample = async (
  inboundEvent: SmsEventRow,
  conversationId: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<void> => {
  // Only trigger on inbound messages with meaningful content
  if (inboundEvent.direction !== 'inbound') return;
  if (!inboundEvent.body || inboundEvent.body.trim().length < 5) return;

  const prisma = getPrisma();

  try {
    // ── Find the most recent qualifying outbound message ──────────────────
    const fortyEightHoursAgo = new Date(inboundEvent.event_ts.getTime() - 48 * 60 * 60 * 1000);

    const outbound = await prisma.sms_events.findFirst({
      where: {
        conversation_id: conversationId,
        direction: 'outbound',
        body: {
          not: null,
          // Prisma doesn't have a direct LENGTH filter in where, so we might need a raw query or just fetch and filter.
          // But actually, we can use a raw query if we really want the length check in DB.
          // Given it's a small check, let's use a raw query or just accept we fetch it.
        },
        event_ts: {
          lt: inboundEvent.event_ts,
          gt: fortyEightHoursAgo,
        },
      },
      orderBy: { event_ts: 'desc' },
    });

    if (!outbound || !outbound.body || outbound.body.length < 30) return;

    // ── Get escalation level from conversation state (default 1) ─────────
    const state = await prisma.conversation_state.findUnique({
      where: { conversation_id: conversationId },
      select: { escalation_level: true },
    });
    const escalationLevel = Math.max(1, Math.min(4, state?.escalation_level ?? 1)) as 1 | 2 | 3 | 4;

    // ── Classify message structure ────────────────────────────────────────
    const structureSignature = classifyStructure(outbound.body ?? '');
    const channelMarker = outbound.sequence?.trim() || 'manual';

    // ── Upsert the conversion example ─────────────────────────────────────
    await upsertConversionExample(
      {
        sourceOutboundEventId: outbound.id,
        bookedCallLabel: channelMarker,
        escalationLevel,
        structureSignature,
        channelMarker,
      },
      logger,
    );

    logger?.debug?.('[conversion-ingestion] Recorded got_reply example', {
      outboundEventId: outbound.id,
      channelMarker,
      structureSignature,
      escalationLevel,
    });
  } catch (err) {
    // Non-fatal — never let this break the main ingestion pipeline
    logger?.warn?.('[conversion-ingestion] Failed to record conversion example (non-fatal):', err);
  }
};
