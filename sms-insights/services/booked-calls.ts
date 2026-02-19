import type { Logger } from '@slack/bolt';
import { listBookedCallsInRange } from './booked-calls-store.js';

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

const dayKey = (ts: string): string | null => {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const hasReaction = (reactions: Array<{ reaction_name: string }>, name: string): boolean => {
  const target = name.trim().toLowerCase();
  return reactions.some((r) => (r.reaction_name || '').trim().toLowerCase() === target);
};

export const getBookedCallsSummary = async (
  params: { from: Date; to: Date; channelId?: string },
  _logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<BookedCallsSummary> => {
  const fromIso = params.from.toISOString();
  const toIso = params.to.toISOString();

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

  for (const c of calls) {
    if (!looksLikeBookedCall(c.text)) continue;

    const day = dayKey(c.event_ts);
    if (!day) continue;

    // Attribution rules:
    // - :jack: reaction => Jack
    // - :me: reaction => Brandon
    // - else => self booked
    const reactions = c.reactions || [];
    const isJack = hasReaction(reactions, 'jack');
    const isBrandon = hasReaction(reactions, 'me');

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
