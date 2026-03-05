import type { Logger } from '@slack/bolt';
import { listBookedCallsInRange } from './booked-calls-store.js';
import { getPrismaClient } from './prisma.js';
import { DEFAULT_BUSINESS_TIMEZONE, dayKeyInTimeZone } from './time-range.js';

export type BookedCallsTrendPoint = {
  day: string; // YYYY-MM-DD
  booked: number;
  jack: number;
  brandon: number;
  selfBooked: number;
};

export type BookedCallsSummary = {
  timeRange: { from: string; to: string };
  totals: {
    booked: number;
    jack: number;
    brandon: number;
    selfBooked: number;
  };
  trendByDay: BookedCallsTrendPoint[];
};

export type BookedCallAttributionBucket = 'jack' | 'brandon' | 'selfBooked';

export type BookedCallAttributionSource = {
  bookedCallId: string;
  eventTs: string;
  bucket: BookedCallAttributionBucket;
  firstConversion: string | null;
  rep: string | null;
  line: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  slackChannelId: string;
  slackMessageTs: string;
  text: string | null;
};

export type BookedCallSmsReplyLink = {
  hasPriorReply: boolean;
  latestReplyAt: string | null;
  reason: 'matched_reply_before_booking' | 'no_contact_phone' | 'no_reply_before_booking' | 'invalid_booking_timestamp';
};

type NormalizedBookedCallLookup = {
  key: string;
  phoneKey: string | null;
  contactNameKey: string | null;
  bookingTs: number;
};

const ATTRIBUTION_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const normalizePhoneKey = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length < 10) return null;
  return digits.slice(-10);
};

export const normalizeContactNameKey = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
};

export const bookedCallSourceKey = (
  source: Pick<BookedCallAttributionSource, 'slackChannelId' | 'slackMessageTs'>,
): string => `${source.slackChannelId}::${source.slackMessageTs}`;

const findLatestAtOrBefore = (values: number[], upperBoundMs: number): number | null => {
  if (values.length === 0) return null;
  let left = 0;
  let right = values.length - 1;
  let answer = -1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const value = values[mid];
    if (value <= upperBoundMs) {
      answer = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  if (answer < 0) return null;
  return values[answer] ?? null;
};

const parseGraceSeconds = (): number => {
  const raw = Number.parseInt(process.env.BOOKED_CALL_ATTRIBUTION_GRACE_SECONDS || '300', 10);
  if (!Number.isFinite(raw) || raw < 0) return 300;
  return raw;
};

const BOOKED_CALL_ATTRIBUTION_GRACE_SECONDS = parseGraceSeconds();

const hasReaction = (
  reactions: Array<{ reaction_name: string; users: unknown }>,
  name: string,
  userId?: string,
): boolean => {
  const target = name.trim().toLowerCase();
  return reactions.some((r) => {
    if ((r.reaction_name || '').trim().toLowerCase() !== target) return false;
    if (!userId) return true; // Fallback if no user ID configured
    return Array.isArray(r.users) && r.users.includes(userId);
  });
};

const parseFallbackField = (fallback: string, label: string): string | null => {
  if (!fallback) return null;
  const pattern = new RegExp(`\\*${label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\*:\\s*(.*)$`, 'im');
  const match = fallback.match(pattern);
  const value = (match?.[1] || '')
    .trim()
    .replace(/<mailto:[^|>]+\|([^>]+)>/gi, '$1')
    .replace(/<[^|>]+\|([^>]+)>/g, '$1');
  return value.length > 0 ? value : null;
};

const fallbackFromRaw = (raw: unknown): string => {
  if (!raw || typeof raw !== 'object') return '';
  const typed = raw as { attachments?: Array<{ fallback?: string }> };
  const first = Array.isArray(typed.attachments) ? typed.attachments[0] : null;
  if (!first) return '';
  return String(first.fallback || '');
};

const parseContactNameFromFallback = (fallback: string): string | null => {
  const explicit = parseFallbackField(fallback, 'Name') || parseFallbackField(fallback, 'Contact Name');
  if (explicit) return explicit;

  const first = parseFallbackField(fallback, 'First Name');
  const last = parseFallbackField(fallback, 'Last Name');
  const combined = [first, last]
    .filter((part): part is string => Boolean(part))
    .join(' ')
    .trim();
  return combined.length > 0 ? combined : null;
};

const parseContactPhoneFromFallback = (fallback: string): string | null => {
  return (
    parseFallbackField(fallback, 'Phone') ||
    parseFallbackField(fallback, 'Phone Number') ||
    parseFallbackField(fallback, 'Mobile Phone')
  );
};

export const resolveBookedCallSmsReplyLink = (
  call: NormalizedBookedCallLookup,
  lookups: { inboundByPhone: Map<string, number[]>; inboundByName: Map<string, number[]> },
): BookedCallSmsReplyLink => {
  if (!Number.isFinite(call.bookingTs)) {
    return {
      hasPriorReply: false,
      latestReplyAt: null,
      reason: 'invalid_booking_timestamp',
    };
  }

  let latestReplyTs: number | null = null;

  if (call.phoneKey) {
    const phoneCandidates = lookups.inboundByPhone.get(call.phoneKey) || [];
    latestReplyTs = findLatestAtOrBefore(phoneCandidates, call.bookingTs);
  }

  if ((!latestReplyTs || latestReplyTs < call.bookingTs - ATTRIBUTION_WINDOW_MS) && call.contactNameKey) {
    const nameCandidates = lookups.inboundByName.get(call.contactNameKey) || [];
    const nameMatch = findLatestAtOrBefore(nameCandidates, call.bookingTs);
    if (nameMatch && nameMatch >= call.bookingTs - ATTRIBUTION_WINDOW_MS) {
      latestReplyTs = nameMatch;
    }
  }

  if (!latestReplyTs || latestReplyTs < call.bookingTs - ATTRIBUTION_WINDOW_MS) {
    if (!call.phoneKey && !call.contactNameKey) {
      return {
        hasPriorReply: false,
        latestReplyAt: null,
        reason: 'no_contact_phone',
      };
    }
    return {
      hasPriorReply: false,
      latestReplyAt: null,
      reason: 'no_reply_before_booking',
    };
  }

  return {
    hasPriorReply: true,
    latestReplyAt: new Date(latestReplyTs).toISOString(),
    reason: 'matched_reply_before_booking',
  };
};

export const getBookedCallsSummary = async (
  params: { from: Date; to: Date; channelId?: string; timeZone?: string },
  _logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<BookedCallsSummary> => {
  const fromIso = params.from.toISOString();
  const toIso = params.to.toISOString();
  const timeZone = (params.timeZone || '').trim() || DEFAULT_BUSINESS_TIMEZONE;

  const calls = await getBookedCallAttributionSources({
    from: params.from,
    to: params.to,
    channelId: params.channelId,
  });

  const trendMap = new Map<string, BookedCallsTrendPoint>();

  const bump = (day: string, bucket: 'jack' | 'brandon' | 'selfBooked') => {
    const point = trendMap.get(day) || { day, booked: 0, jack: 0, brandon: 0, selfBooked: 0 };
    point.booked += 1;
    point[bucket] += 1;
    trendMap.set(day, point);
  };

  for (const c of calls) {
    const day = dayKeyInTimeZone(c.eventTs, timeZone);
    if (!day) continue;

    bump(day, c.bucket);
  }

  const trendByDay = [...trendMap.values()].sort((a, b) => a.day.localeCompare(b.day));
  const totals = trendByDay.reduce(
    (acc, d) => {
      acc.booked += d.booked;
      acc.jack += d.jack;
      acc.brandon += d.brandon;
      acc.selfBooked += d.selfBooked;
      return acc;
    },
    { booked: 0, jack: 0, brandon: 0, selfBooked: 0 },
  );

  return {
    timeRange: { from: fromIso, to: toIso },
    totals,
    trendByDay,
  };
};

export const getBookedCallAttributionSources = async (params: {
  from: Date;
  to: Date;
  channelId?: string;
  slackMessageTs?: string;
}): Promise<BookedCallAttributionSource[]> => {
  const calls = await listBookedCallsInRange({
    from: params.from,
    to: params.to,
    channelId: params.channelId,
    slackMessageTs: params.slackMessageTs,
  });
  const jackId = process.env.ALOWARE_WATCHER_JACK_USER_ID;
  const brandonId = process.env.ALOWARE_WATCHER_BRANDON_USER_ID;

  const looksLikeBookedCall = (text: string | null): boolean => {
    const t = (text || '').toLowerCase();
    if (!t) return false;
    return t.includes('call booked') || t.includes('booked') || t.includes('appointment') || t.includes('scheduled');
  };

  const looksLikeManualOneOff = (text: string | null): boolean => {
    const t = (text || '').toLowerCase();
    if (!t) return false;
    return t.includes('automation') || t.includes('set');
  };

  const normalized: BookedCallAttributionSource[] = [];

  for (const c of calls) {
    const reactions = c.reactions || [];
    const isJack = hasReaction(reactions, 'jack', jackId);
    const isBrandon = hasReaction(reactions, 'me', brandonId);
    const hasAttribution = isJack || isBrandon;

    const isValid = hasAttribution
      ? looksLikeBookedCall(c.text) || looksLikeManualOneOff(c.text)
      : looksLikeBookedCall(c.text);
    if (!isValid) continue;

    const fallback = fallbackFromRaw(c.raw);
    const firstConversion = parseFallbackField(fallback, 'First Conversion');
    const rep = parseFallbackField(fallback, 'Rep') || parseFallbackField(fallback, 'Contact owner');
    const line = parseFallbackField(fallback, 'Line');
    const contactName = parseContactNameFromFallback(fallback);
    const contactPhone = parseContactPhoneFromFallback(fallback);
    // parseFallbackField strips <mailto:email|email> → plain email address
    const contactEmail = parseFallbackField(fallback, 'Email')?.toLowerCase().trim() || null;

    if (!hasAttribution) {
      const eventMs = new Date(c.event_ts).getTime();
      if (Number.isFinite(eventMs)) {
        const ageSeconds = Math.max(0, (Date.now() - eventMs) / 1000);
        if (ageSeconds < BOOKED_CALL_ATTRIBUTION_GRACE_SECONDS) {
          // Grace period: wait for setter reaction before defaulting this to self-booked.
          continue;
        }
      }
    }

    const bucket: BookedCallAttributionBucket = isJack ? 'jack' : isBrandon ? 'brandon' : 'selfBooked';

    normalized.push({
      bookedCallId: c.id,
      eventTs: c.event_ts.toISOString(),
      bucket,
      firstConversion,
      rep,
      line,
      contactName,
      contactPhone,
      contactEmail,
      slackChannelId: c.slack_channel_id,
      slackMessageTs: c.slack_message_ts,
      text: c.text,
    });
  }

  return normalized;
};

export type BookedCallSmsSequenceLookup = {
  sequenceLabel: string;
  latestOutboundAt: string;
};

const SMS_SEQUENCE_LOOKBACK_DAYS = 30;

/**
 * For each BookedCallAttributionSource that has a contactPhone, queries sms_events
 * for the most recent outbound sequence sent to that phone within SMS_SEQUENCE_LOOKBACK_DAYS
 * before the booking timestamp.
 *
 * Returns Map<bookedCallId, BookedCallSmsSequenceLookup>.
 * Calls with no contactPhone or no matching outbound events are omitted from the map.
 */
export const getBookedCallSequenceFromSmsEvents = async (
  calls: BookedCallAttributionSource[],
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<Map<string, BookedCallSmsSequenceLookup>> => {
  const results = new Map<string, BookedCallSmsSequenceLookup>();
  if (calls.length === 0) return results;

  const prisma = getPrismaClient();

  type CallEntry = { bookedCallId: string; bookingTs: number };

  // Build phone key → entries (primary signal — direct phone match)
  const phoneKeyToEntries = new Map<string, CallEntry[]>();
  // Build email key → entries (secondary — email → inbox_contact_profiles → phone → sms_events)
  const emailKeyToEntries = new Map<string, CallEntry[]>();
  // Build contact name key → entries (last resort — name match, higher false-positive risk)
  const nameKeyToEntries = new Map<string, CallEntry[]>();

  for (const call of calls) {
    const bookingTs = new Date(call.eventTs).getTime();
    if (!Number.isFinite(bookingTs)) continue;

    const entry = { bookedCallId: call.bookedCallId, bookingTs };

    // Email is primary — always add to email map when available (email → profile → phone is most accurate).
    if (call.contactEmail) {
      const emailKey = call.contactEmail;
      const list = emailKeyToEntries.get(emailKey) || [];
      list.push(entry);
      emailKeyToEntries.set(emailKey, list);
    }

    // Phone is always added as a fallback (used when email lookup yields no result).
    const phoneKey = normalizePhoneKey(call.contactPhone);
    if (phoneKey) {
      const list = phoneKeyToEntries.get(phoneKey) || [];
      list.push(entry);
      phoneKeyToEntries.set(phoneKey, list);
    }

    // Name match only when neither email nor phone is available.
    if (!call.contactEmail && !phoneKey) {
      const nameKey = normalizeContactNameKey(call.contactName);
      if (nameKey) {
        const list = nameKeyToEntries.get(nameKey) || [];
        list.push(entry);
        nameKeyToEntries.set(nameKey, list);
      }
    }
  }

  if (phoneKeyToEntries.size === 0 && emailKeyToEntries.size === 0 && nameKeyToEntries.size === 0) return results;

  // Compute overall time range across all entries
  const allEntries = [
    ...[...phoneKeyToEntries.values()].flat(),
    ...[...emailKeyToEntries.values()].flat(),
    ...[...nameKeyToEntries.values()].flat(),
  ];
  const allBookingTs = allEntries.map((e) => e.bookingTs);
  const minBookingTs = Math.min(...allBookingTs);
  const maxBookingTs = Math.max(...allBookingTs);
  const lookbackMs = SMS_SEQUENCE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const fromIso = new Date(minBookingTs - lookbackMs).toISOString();
  const toIso = new Date(maxBookingTs).toISOString();

  // Helper: find the most recent outbound sequence within lookback window before bookingTs
  const resolveBest = (
    outbounds: Array<{ sequence: string; ts: number }>,
    bookingTs: number,
  ): { sequence: string; ts: number } | null => {
    let bestSequence: string | null = null;
    let bestTs = -1;
    for (const outbound of outbounds) {
      if (outbound.ts > bookingTs) continue;
      if (bookingTs - outbound.ts > lookbackMs) continue;
      if (outbound.ts > bestTs) {
        bestTs = outbound.ts;
        bestSequence = outbound.sequence;
      }
    }
    return bestSequence ? { sequence: bestSequence, ts: bestTs } : null;
  };

  try {
    // --- Email-based lookup (PRIMARY — email → inbox_contact_profiles → phone → sms_events) ---
    // Runs first so email-derived results take priority over direct phone match.
    if (emailKeyToEntries.size > 0) {
      const emailKeys = [...emailKeyToEntries.keys()];
      // Step 1: resolve email → phone via inbox_contact_profiles
      const profileRows = await prisma.$queryRawUnsafe<{ email_key: string; phone_key: string }[]>(
        `
        SELECT
          LOWER(TRIM(email)) AS email_key,
          RIGHT(regexp_replace(phone, '\\D', '', 'g'), 10) AS phone_key
        FROM inbox_contact_profiles
        WHERE email IS NOT NULL AND TRIM(email) != ''
          AND phone IS NOT NULL AND TRIM(phone) != ''
          AND LOWER(TRIM(email)) = ANY($1::text[])
        `,
        emailKeys,
      );

      const emailToPhoneKey = new Map<string, string>();
      for (const row of profileRows) {
        if (row.email_key && row.phone_key && row.phone_key.length === 10) {
          emailToPhoneKey.set(row.email_key, row.phone_key);
        }
      }

      const emailDerivedPhoneKeys = [...new Set([...emailToPhoneKey.values()])];
      if (emailDerivedPhoneKeys.length > 0) {
        // Step 2: phone → sms_events outbound sequence
        const rows = await prisma.$queryRawUnsafe<{ phone_key: string; sequence: string; event_ts: Date }[]>(
          `
          SELECT
            RIGHT(regexp_replace(contact_phone, '\\D', '', 'g'), 10) AS phone_key,
            TRIM(sequence) AS sequence,
            event_ts
          FROM sms_events
          WHERE direction = 'outbound'
            AND contact_phone IS NOT NULL
            AND sequence IS NOT NULL AND TRIM(sequence) != ''
            AND RIGHT(regexp_replace(contact_phone, '\\D', '', 'g'), 10) = ANY($1::text[])
            AND event_ts >= $2::timestamptz
            AND event_ts <= $3::timestamptz
          ORDER BY event_ts ASC
          `,
          emailDerivedPhoneKeys, fromIso, toIso,
        );
        const outboundByEmailPhone = new Map<string, Array<{ sequence: string; ts: number }>>();
        for (const row of rows) {
          const ts = new Date(row.event_ts).getTime();
          if (!row.phone_key || !row.sequence || !Number.isFinite(ts)) continue;
          const list = outboundByEmailPhone.get(row.phone_key) || [];
          list.push({ sequence: row.sequence, ts });
          outboundByEmailPhone.set(row.phone_key, list);
        }
        for (const [emailKey, entries] of emailKeyToEntries) {
          const phoneKey = emailToPhoneKey.get(emailKey);
          if (!phoneKey) continue;
          const outbounds = outboundByEmailPhone.get(phoneKey);
          if (!outbounds || outbounds.length === 0) continue;
          for (const { bookedCallId, bookingTs } of entries) {
            const best = resolveBest(outbounds, bookingTs);
            if (best) {
              results.set(bookedCallId, {
                sequenceLabel: best.sequence,
                latestOutboundAt: new Date(best.ts).toISOString(),
              });
            }
          }
        }
      }
    }

    // --- Phone-based lookup (FALLBACK — direct contactPhone → sms_events) ---
    // Runs second; skips calls already resolved by email lookup above.
    const outboundByPhone = new Map<string, Array<{ sequence: string; ts: number }>>();
    if (phoneKeyToEntries.size > 0) {
      const phoneKeys = [...phoneKeyToEntries.keys()];
      const rows = await prisma.$queryRawUnsafe<{ phone_key: string; sequence: string; event_ts: Date }[]>(
        `
        SELECT
          RIGHT(regexp_replace(contact_phone, '\\D', '', 'g'), 10) AS phone_key,
          TRIM(sequence) AS sequence,
          event_ts
        FROM sms_events
        WHERE direction = 'outbound'
          AND contact_phone IS NOT NULL
          AND sequence IS NOT NULL AND TRIM(sequence) != ''
          AND RIGHT(regexp_replace(contact_phone, '\\D', '', 'g'), 10) = ANY($1::text[])
          AND event_ts >= $2::timestamptz
          AND event_ts <= $3::timestamptz
        ORDER BY event_ts ASC
        `,
        phoneKeys, fromIso, toIso,
      );
      for (const row of rows) {
        const ts = new Date(row.event_ts).getTime();
        if (!row.phone_key || !row.sequence || !Number.isFinite(ts)) continue;
        const list = outboundByPhone.get(row.phone_key) || [];
        list.push({ sequence: row.sequence, ts });
        outboundByPhone.set(row.phone_key, list);
      }
      for (const [phoneKey, entries] of phoneKeyToEntries) {
        const outbounds = outboundByPhone.get(phoneKey);
        if (!outbounds || outbounds.length === 0) continue;
        for (const { bookedCallId, bookingTs } of entries) {
          if (results.has(bookedCallId)) continue; // email result already resolved — skip
          const best = resolveBest(outbounds, bookingTs);
          if (best) {
            results.set(bookedCallId, {
              sequenceLabel: best.sequence,
              latestOutboundAt: new Date(best.ts).toISOString(),
            });
          }
        }
      }
    }

    // --- Name-based lookup (last resort for calls without phone or email) ---
    const outboundByName = new Map<string, Array<{ sequence: string; ts: number }>>();
    if (nameKeyToEntries.size > 0) {
      const nameKeys = [...nameKeyToEntries.keys()];
      const rows = await prisma.$queryRawUnsafe<{ contact_name_key: string; sequence: string; event_ts: Date }[]>(
        `
        SELECT
          LOWER(regexp_replace(TRIM(contact_name), '\\s+', ' ', 'g')) AS contact_name_key,
          TRIM(sequence) AS sequence,
          event_ts
        FROM sms_events
        WHERE direction = 'outbound'
          AND contact_name IS NOT NULL
          AND sequence IS NOT NULL AND TRIM(sequence) != ''
          AND LOWER(regexp_replace(TRIM(contact_name), '\\s+', ' ', 'g')) = ANY($1::text[])
          AND event_ts >= $2::timestamptz
          AND event_ts <= $3::timestamptz
        ORDER BY event_ts ASC
        `,
        nameKeys, fromIso, toIso,
      );
      for (const row of rows) {
        const ts = new Date(row.event_ts).getTime();
        if (!row.contact_name_key || !row.sequence || !Number.isFinite(ts)) continue;
        const list = outboundByName.get(row.contact_name_key) || [];
        list.push({ sequence: row.sequence, ts });
        outboundByName.set(row.contact_name_key, list);
      }
      for (const [nameKey, entries] of nameKeyToEntries) {
        const outbounds = outboundByName.get(nameKey);
        if (!outbounds || outbounds.length === 0) continue;
        for (const { bookedCallId, bookingTs } of entries) {
          if (results.has(bookedCallId)) continue; // already resolved via phone
          const best = resolveBest(outbounds, bookingTs);
          if (best) {
            results.set(bookedCallId, {
              sequenceLabel: best.sequence,
              latestOutboundAt: new Date(best.ts).toISOString(),
            });
          }
        }
      }
    }
  } catch (error) {
    logger?.error?.('Failed to compute booked-call sequence from SMS events', error);
    throw error;
  }

  return results;
};

export const getBookedCallSmsReplyLinks = async (
  calls: BookedCallAttributionSource[],
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<Map<string, BookedCallSmsReplyLink>> => {
  const results = new Map<string, BookedCallSmsReplyLink>();
  if (calls.length === 0) return results;

  const prisma = getPrismaClient();

  const normalizedCalls = calls.map((call) => {
    const key = bookedCallSourceKey(call);
    const phoneKey = normalizePhoneKey(call.contactPhone);
    const contactNameKey = normalizeContactNameKey(call.contactName);
    const bookingTs = new Date(call.eventTs).getTime();
    return {
      key,
      phoneKey,
      contactNameKey,
      bookingTs,
    };
  });

  const validTimestamps = normalizedCalls.map((row) => row.bookingTs).filter((value) => Number.isFinite(value));
  if (validTimestamps.length === 0) {
    for (const row of normalizedCalls) {
      results.set(row.key, {
        hasPriorReply: false,
        latestReplyAt: null,
        reason: 'invalid_booking_timestamp',
      });
    }
    return results;
  }

  const minBookingTs = Math.min(...validTimestamps);
  const maxBookingTs = Math.max(...validTimestamps);
  const fromIso = new Date(minBookingTs - ATTRIBUTION_WINDOW_MS).toISOString();
  const toIso = new Date(maxBookingTs).toISOString();

  const phoneKeys = [
    ...new Set(normalizedCalls.map((row) => row.phoneKey).filter((value): value is string => Boolean(value))),
  ];
  const contactNameKeys = [
    ...new Set(normalizedCalls.map((row) => row.contactNameKey).filter((value): value is string => Boolean(value))),
  ];
  const inboundByPhone = new Map<string, number[]>();
  const inboundByName = new Map<string, number[]>();

  try {
    if (phoneKeys.length > 0) {
      const rows = await prisma.$queryRawUnsafe<{ phone_key: string; event_ts: Date }[]>(
        `
        SELECT
          RIGHT(regexp_replace(contact_phone, '\\D', '', 'g'), 10) AS phone_key,
          event_ts
        FROM sms_events
        WHERE direction = 'inbound'
          AND contact_phone IS NOT NULL
          AND RIGHT(regexp_replace(contact_phone, '\\D', '', 'g'), 10) = ANY($1::text[])
          AND event_ts >= $2::timestamptz
          AND event_ts <= $3::timestamptz
        ORDER BY event_ts ASC
        `,
        phoneKeys, fromIso, toIso,
      );

      for (const row of rows) {
        const key = row.phone_key;
        const ts = new Date(row.event_ts).getTime();
        if (!key || !Number.isFinite(ts)) continue;
        const list = inboundByPhone.get(key) || [];
        list.push(ts);
        inboundByPhone.set(key, list);
      }
    }

    if (contactNameKeys.length > 0) {
      const rows = await prisma.$queryRawUnsafe<{ contact_name_key: string; event_ts: Date }[]>(
        `
        SELECT
          LOWER(regexp_replace(TRIM(contact_name), '\\s+', ' ', 'g')) AS contact_name_key,
          event_ts
        FROM sms_events
        WHERE direction = 'inbound'
          AND contact_name IS NOT NULL
          AND LOWER(regexp_replace(TRIM(contact_name), '\\s+', ' ', 'g')) = ANY($1::text[])
          AND event_ts >= $2::timestamptz
          AND event_ts <= $3::timestamptz
        ORDER BY event_ts ASC
        `,
        contactNameKeys, fromIso, toIso,
      );

      for (const row of rows) {
        const key = row.contact_name_key;
        const ts = new Date(row.event_ts).getTime();
        if (!key || !Number.isFinite(ts)) continue;
        const list = inboundByName.get(key) || [];
        list.push(ts);
        inboundByName.set(key, list);
      }
    }
  } catch (error) {
    logger?.error?.('Failed to compute booked-call SMS reply links', error);
    throw error;
  }

  for (const call of normalizedCalls) {
    results.set(call.key, resolveBookedCallSmsReplyLink(call, { inboundByPhone, inboundByName }));
  }

  return results;
};
