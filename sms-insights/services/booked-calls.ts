import type { Logger } from '@slack/bolt';
import { listBookedCallsInRange } from './booked-calls-store.js';
import { getPool } from './db.js';
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
  slackChannelId: string;
  slackMessageTs: string;
  text: string | null;
};

export type BookedCallSmsReplyLink = {
  hasPriorReply: boolean;
  latestReplyAt: string | null;
  reason: 'matched_reply_before_booking' | 'no_contact_phone' | 'no_reply_before_booking' | 'invalid_booking_timestamp';
};

const ATTRIBUTION_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const normalizePhoneKey = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length < 10) return null;
  return digits.slice(-10);
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
  const value = (match?.[1] || '').trim();
  return value.length > 0 ? value : null;
};

const fallbackFromRaw = (raw: unknown): string => {
  if (!raw || typeof raw !== 'object') return '';
  const typed = raw as { attachments?: Array<{ fallback?: string }> };
  const first = Array.isArray(typed.attachments) ? typed.attachments[0] : null;
  if (!first) return '';
  return String(first.fallback || '');
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
    const rep = parseFallbackField(fallback, 'Rep');
    const line = parseFallbackField(fallback, 'Line');
    const contactName = parseFallbackField(fallback, 'Name');
    const contactPhone = parseFallbackField(fallback, 'Phone');

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
      eventTs: c.event_ts,
      bucket,
      firstConversion,
      rep,
      line,
      contactName,
      contactPhone,
      slackChannelId: c.slack_channel_id,
      slackMessageTs: c.slack_message_ts,
      text: c.text,
    });
  }

  return normalized;
};

export const getBookedCallSmsReplyLinks = async (
  calls: BookedCallAttributionSource[],
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<Map<string, BookedCallSmsReplyLink>> => {
  const results = new Map<string, BookedCallSmsReplyLink>();
  if (calls.length === 0) return results;

  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  const normalizedCalls = calls.map((call) => {
    const key = bookedCallSourceKey(call);
    const phoneKey = normalizePhoneKey(call.contactPhone);
    const bookingTs = new Date(call.eventTs).getTime();
    return {
      key,
      phoneKey,
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
  const inboundByPhone = new Map<string, number[]>();

  if (phoneKeys.length > 0) {
    try {
      const { rows } = await pool.query<{ phone_key: string; event_ts: string }>(
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
        [phoneKeys, fromIso, toIso],
      );

      for (const row of rows) {
        const key = row.phone_key;
        const ts = new Date(row.event_ts).getTime();
        if (!key || !Number.isFinite(ts)) continue;
        const list = inboundByPhone.get(key) || [];
        list.push(ts);
        inboundByPhone.set(key, list);
      }
    } catch (error) {
      logger?.error?.('Failed to compute booked-call SMS reply links', error);
      throw error;
    }
  }

  for (const call of normalizedCalls) {
    if (!Number.isFinite(call.bookingTs)) {
      results.set(call.key, {
        hasPriorReply: false,
        latestReplyAt: null,
        reason: 'invalid_booking_timestamp',
      });
      continue;
    }

    if (!call.phoneKey) {
      results.set(call.key, {
        hasPriorReply: false,
        latestReplyAt: null,
        reason: 'no_contact_phone',
      });
      continue;
    }

    const replyCandidates = inboundByPhone.get(call.phoneKey) || [];
    const latestReplyTs = findLatestAtOrBefore(replyCandidates, call.bookingTs);
    if (!latestReplyTs || latestReplyTs < call.bookingTs - ATTRIBUTION_WINDOW_MS) {
      results.set(call.key, {
        hasPriorReply: false,
        latestReplyAt: null,
        reason: 'no_reply_before_booking',
      });
      continue;
    }

    results.set(call.key, {
      hasPriorReply: true,
      latestReplyAt: new Date(latestReplyTs).toISOString(),
      reason: 'matched_reply_before_booking',
    });
  }

  return results;
};
