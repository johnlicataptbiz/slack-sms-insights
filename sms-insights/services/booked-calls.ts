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

export const getBookedCallsSummary = async (
  params: { from: Date; to: Date; channelId?: string; timeZone?: string },
  _logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<BookedCallsSummary> => {
  const fromIso = params.from.toISOString();
  const toIso = params.to.toISOString();
  const timeZone = (params.timeZone || '').trim() || DEFAULT_BUSINESS_TIMEZONE;

  const calls = await listBookedCallsInRange({ from: params.from, to: params.to, channelId: params.channelId });

  const trendMap = new Map<string, BookedCallsTrendPoint>();

  const bump = (day: string, bucket: 'jack' | 'brandon' | 'selfBooked') => {
    const point = trendMap.get(day) || { day, booked: 0, jack: 0, brandon: 0, selfBooked: 0 };
    point.booked += 1;
    point[bucket] += 1;
    trendMap.set(day, point);
  };

  const looksLikeBookedCall = (text: string | null): boolean => {
    const t = (text || '').toLowerCase();
    if (!t) return false;
    // Heuristic: HubSpot booked-call posts usually contain a booking signal.
    // This filters out random chatter in #bookedcalls.
    return t.includes('call booked') || t.includes('booked') || t.includes('appointment') || t.includes('scheduled');
  };

  const looksLikeManualOneOff = (text: string | null): boolean => {
    const t = (text || '').toLowerCase();
    if (!t) return false;
    // Allow "automation" (e.g. "Automation didn't fire") or "set" (e.g. "Set 2/8") for manual reports
    return t.includes('automation') || t.includes('set');
  };

  const jackId = process.env.ALOWARE_WATCHER_JACK_USER_ID;
  const brandonId = process.env.ALOWARE_WATCHER_BRANDON_USER_ID;

  for (const c of calls) {
    const reactions = c.reactions || [];
    const isJack = hasReaction(reactions, 'jack', jackId);
    const isBrandon = hasReaction(reactions, 'me', brandonId);
    const hasAttribution = isJack || isBrandon;

    let isValid = false;
    if (hasAttribution) {
      // If attributed, allow standard keywords OR manual one-off keywords
      isValid = looksLikeBookedCall(c.text) || looksLikeManualOneOff(c.text);
    } else {
      // If not attributed, only allow standard keywords (strict) to avoid counting chatter as self-booked
      isValid = looksLikeBookedCall(c.text);
    }

    if (!isValid) continue;

    const day = dayKeyInTimeZone(c.event_ts, timeZone);
    if (!day) continue;

    if (isJack) bump(day, 'jack');
    else if (isBrandon) bump(day, 'brandon');
    else bump(day, 'selfBooked');
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
