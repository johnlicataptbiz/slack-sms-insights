import type { Logger } from '@slack/bolt';
import { getBookedCallAttributionSources } from './booked-calls.js';
import { getPrismaClient } from './prisma.js';

const getPrisma = () => getPrismaClient();

const normalizePhoneKey = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const mapSetterFromBucket = (bucket: 'jack' | 'brandon' | 'selfBooked'): string => {
  if (bucket === 'jack') return 'Jack Licata';
  if (bucket === 'brandon') return 'Brandon Erwin';
  return 'Self Booked';
};

const mapSetterHint = (bucket: 'jack' | 'brandon' | 'selfBooked'): string | null => {
  if (bucket === 'jack') return 'jack';
  if (bucket === 'brandon') return 'brandon';
  return null;
};

export type RefreshBookedCallAttributionResult = {
  processed: number;
  upserted: number;
  matchedConversations: number;
};

export const refreshBookedCallAttribution = async (
  params: { from: Date; to: Date; channelId?: string },
  logger?: Pick<Logger, 'info' | 'warn' | 'error'>,
): Promise<RefreshBookedCallAttributionResult> => {
  const prisma = getPrisma();
  const sources = await getBookedCallAttributionSources({
    from: params.from,
    to: params.to,
    channelId: params.channelId,
  });

  const phoneKeys = Array.from(
    new Set(
      sources
        .map((source) => normalizePhoneKey(source.contactPhone))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const conversationRows =
    phoneKeys.length === 0
      ? []
      : await prisma.$queryRawUnsafe<
          Array<{
            id: string;
            contact_phone: string | null;
            last_touch_at: Date | null;
          }>
        >(
          `
          SELECT id, contact_phone, last_touch_at
          FROM conversations
          WHERE contact_phone IS NOT NULL
            AND RIGHT(regexp_replace(contact_phone, '\\D', '', 'g'), 10) = ANY($1::text[])
          `,
          phoneKeys,
        );

  const byPhone = new Map<string, Array<{ id: string; lastTouchAtMs: number | null }>>();
  for (const row of conversationRows) {
    const key = normalizePhoneKey(row.contact_phone);
    if (!key) continue;
    const list = byPhone.get(key) || [];
    list.push({
      id: row.id,
      lastTouchAtMs: row.last_touch_at ? row.last_touch_at.getTime() : null,
    });
    byPhone.set(key, list);
  }

  let upserted = 0;
  let matchedConversations = 0;

  for (const source of sources) {
    const bookingTs = new Date(source.eventTs).getTime();
    const phoneKey = normalizePhoneKey(source.contactPhone);
    const candidates = phoneKey ? byPhone.get(phoneKey) || [] : [];
    let conversationId: string | null = null;
    let conversationMatchSeconds: number | null = null;

    if (candidates.length > 0 && Number.isFinite(bookingTs)) {
      const scored = candidates
        .map((candidate) => {
          if (!Number.isFinite(candidate.lastTouchAtMs || NaN)) {
            return { id: candidate.id, delta: Number.POSITIVE_INFINITY };
          }
          const delta = Math.abs((candidate.lastTouchAtMs || 0) - bookingTs);
          return { id: candidate.id, delta };
        })
        .sort((a, b) => a.delta - b.delta);
      conversationId = scored[0]?.id || null;
      conversationMatchSeconds =
        scored.length > 0 && Number.isFinite(scored[0].delta)
          ? Math.round(scored[0].delta / 1000)
          : null;
    }

    await prisma.booked_call_attribution.upsert({
      where: { booked_call_id: source.bookedCallId },
      create: {
        booked_call_id: source.bookedCallId,
        booked_event_ts: new Date(source.eventTs),
        booked_text: source.text || null,
        canonical_booking: true,
        mapping_method: 'reaction_bucket_v2',
        match_confidence: source.bucket === 'selfBooked' ? 0.7 : 0.95,
        conversation_id: conversationId,
        conversation_match_seconds: conversationMatchSeconds,
        setter_hint: mapSetterHint(source.bucket),
        setter_final: mapSetterFromBucket(source.bucket),
        closer_final: null,
        first_conversion: source.firstConversion || null,
        source_bucket: source.bucket === 'selfBooked' ? 'self_booked' : 'setter_attributed',
        hubspot_contact_id: null,
        lead_score: null,
        lead_score_source: null,
        mapper_version: 'v2.reaction-bucket',
      },
      update: {
        booked_event_ts: new Date(source.eventTs),
        booked_text: source.text || null,
        canonical_booking: true,
        mapping_method: 'reaction_bucket_v2',
        match_confidence: source.bucket === 'selfBooked' ? 0.7 : 0.95,
        conversation_id: conversationId,
        conversation_match_seconds: conversationMatchSeconds,
        setter_hint: mapSetterHint(source.bucket),
        setter_final: mapSetterFromBucket(source.bucket),
        first_conversion: source.firstConversion || null,
        source_bucket: source.bucket === 'selfBooked' ? 'self_booked' : 'setter_attributed',
        mapper_version: 'v2.reaction-bucket',
      },
    });

    upserted += 1;
    if (conversationId) matchedConversations += 1;
  }

  logger?.info?.('booked-call-attribution: refreshed', {
    from: params.from.toISOString(),
    to: params.to.toISOString(),
    processed: sources.length,
    upserted,
    matchedConversations,
  });

  return {
    processed: sources.length,
    upserted,
    matchedConversations,
  };
};

