import type { Logger } from '@slack/bolt';
import { listBookedCallsInRange } from './booked-calls-store.js';
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
  eventTs: string;
  bucket: BookedCallAttributionBucket;
  firstConversion: string | null;
  text: string | null;
};

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
}): Promise<BookedCallAttributionSource[]> => {
  const calls = await listBookedCallsInRange({ from: params.from, to: params.to, channelId: params.channelId });
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
    const bucket: BookedCallAttributionBucket = isJack ? 'jack' : isBrandon ? 'brandon' : 'selfBooked';

    normalized.push({
      eventTs: c.event_ts,
      bucket,
      firstConversion,
      text: c.text,
    });
  }

  return normalized;
};
