import type { Logger } from '@slack/bolt';
import { getBookedCallAttributionSources, getBookedCallSequenceFromSmsEvents } from './booked-calls.js';
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
  const attributionLogger = logger ? { ...logger, debug: logger.info } : undefined;
  const smsSequenceLookup = await getBookedCallSequenceFromSmsEvents(sources, attributionLogger);
  const existingRows =
    sources.length === 0
      ? []
      : await prisma.booked_call_attribution.findMany({
          where: {
            booked_call_id: { in: sources.map((source) => source.bookedCallId) },
          },
          select: {
            booked_call_id: true,
            conversation_id: true,
            conversation_match_seconds: true,
            first_conversion: true,
          },
        });
  const existingByBookedCallId = new Map(existingRows.map((row) => [row.booked_call_id, row]));

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
    const smsLookup = smsSequenceLookup.get(source.bookedCallId);
    const existing = existingByBookedCallId.get(source.bookedCallId);
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

    const resolvedConversationId = smsLookup?.conversationId || conversationId || existing?.conversation_id || null;
    const resolvedConversationMatchSeconds =
      smsLookup?.conversationId === resolvedConversationId
        ? 0
        : conversationMatchSeconds ?? existing?.conversation_match_seconds ?? null;
    const resolvedFirstConversion =
      source.firstConversion || smsLookup?.sequenceLabel || existing?.first_conversion || null;
    const mappingMethod =
      smsLookup?.sequenceLabel || smsLookup?.conversationId
        ? 'reaction_bucket_v2_sms_lookup'
        : 'reaction_bucket_v2';
    const mapperVersion =
      smsLookup?.sequenceLabel || smsLookup?.conversationId
        ? 'v2.reaction-bucket.sms-lookup'
        : 'v2.reaction-bucket';

    await prisma.booked_call_attribution.upsert({
      where: { booked_call_id: source.bookedCallId },
      create: {
        booked_call_id: source.bookedCallId,
        booked_event_ts: new Date(source.eventTs),
        booked_text: source.text || null,
        canonical_booking: true,
        mapping_method: mappingMethod,
        match_confidence: source.bucket === 'selfBooked' ? 0.7 : 0.95,
        conversation_id: resolvedConversationId,
        conversation_match_seconds: resolvedConversationMatchSeconds,
        setter_hint: mapSetterHint(source.bucket),
        setter_final: mapSetterFromBucket(source.bucket),
        closer_final: null,
        first_conversion: resolvedFirstConversion,
        source_bucket: source.bucket === 'selfBooked' ? 'self_booked' : 'setter_attributed',
        hubspot_contact_id: null,
        lead_score: null,
        lead_score_source: null,
        mapper_version: mapperVersion,
      },
      update: {
        booked_event_ts: new Date(source.eventTs),
        booked_text: source.text || null,
        canonical_booking: true,
        mapping_method: mappingMethod,
        match_confidence: source.bucket === 'selfBooked' ? 0.7 : 0.95,
        conversation_id: resolvedConversationId,
        conversation_match_seconds: resolvedConversationMatchSeconds,
        setter_hint: mapSetterHint(source.bucket),
        setter_final: mapSetterFromBucket(source.bucket),
        first_conversion: resolvedFirstConversion,
        source_bucket: source.bucket === 'selfBooked' ? 'self_booked' : 'setter_attributed',
        mapper_version: mapperVersion,
      },
    });

    upserted += 1;
    if (resolvedConversationId) matchedConversations += 1;
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
