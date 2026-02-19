import type { Logger } from '@slack/bolt';
import { getPool } from './db.js';

export type SalesTrendPoint = {
  day: string; // YYYY-MM-DD
  messagesSent: number;
  manualMessagesSent: number;
  sequenceMessagesSent: number;

  repliesReceived: number;
  replyRatePct: number;

  manualRepliesReceived: number;
  manualReplyRatePct: number;

  sequenceRepliesReceived: number;
  sequenceReplyRatePct: number;

  booked: number;
  optOuts: number;
};

export type TopSequenceRow = {
  label: string;
  messagesSent: number;
  repliesReceived: number;
  replyRatePct: number;
  booked: number;
  optOuts: number;
};

export type RepLeaderboardRow = {
  repName: string;
  outboundConversations: number;
  booked: number;
  optOuts: number;
  replyRatePct: number | null;
};

export type SalesMetricsSummary = {
  timeRange: { from: string; to: string };
  totals: {
    messagesSent: number;
    manualMessagesSent: number;
    sequenceMessagesSent: number;

    repliesReceived: number;
    replyRatePct: number;

    manualRepliesReceived: number;
    manualReplyRatePct: number;

    sequenceRepliesReceived: number;
    sequenceReplyRatePct: number;

    booked: number;
    optOuts: number;
  };
  trendByDay: SalesTrendPoint[];
  topSequences: TopSequenceRow[];
  repLeaderboard: RepLeaderboardRow[];
};

type SequenceRow = {
  label: string;
  messagesSent: number;
  repliesReceived: number;
  booked: number;
  optOuts: number;
};

type RepRow = {
  repName: string;
  outboundConversations: number;
  booked: number;
  optOuts: number;
};

const DATE_PATTERN = /^Date:\s*(.+)$/im;
const REP_PATTERN = /^\*Rep:\s*(.+)\*/i;
const OUTBOUND_CONV_PATTERN = /- Outbound Conversations:\s*(\d+)/i;
const BOOKINGS_PATTERN = /- Book(?:ings?|ed):\s*(\d+)/i;
const OPT_OUTS_PATTERN = /- Opt[-\s]?Outs?:\s*(\d+)/i;

const SEQUENCE_LINE_PATTERN =
  /^-\s*(.+?):\s*sent\s+(\d+).*?(?:replies(?:\s+received)?|replied)\s+(\d+)\s*\(([0-9.]+)%[^)]*\).*?book(?:ings?|ed)\s+(\d+).*?opt[-\s]?outs?\s+(\d+)/i;

const normalizeDay = (dateStr: string): string | null => {
  const d = new Date(dateStr);
  if (!Number.isFinite(d.getTime())) return null;
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const parseDailySnapshot = (
  reportText: string,
): { day: string | null; sequences: SequenceRow[]; reps: RepRow[] } => {
  const dateMatch = reportText.match(DATE_PATTERN);
  const day = dateMatch?.[1] ? normalizeDay(dateMatch[1].trim()) : null;

  const lines = reportText.split('\n').map((l) => l.trim());
  const sequences: SequenceRow[] = [];
  const reps: RepRow[] = [];
  let currentRep: RepRow | null = null;

  for (const line of lines) {
    const repMatch = line.match(REP_PATTERN);
    if (repMatch) {
      currentRep = { repName: repMatch[1].trim(), outboundConversations: 0, booked: 0, optOuts: 0 };
      reps.push(currentRep);
      continue;
    }

    if (currentRep) {
      const outbound = line.match(OUTBOUND_CONV_PATTERN);
      if (outbound) {
        currentRep.outboundConversations = Number.parseInt(outbound[1] || '0', 10);
        continue;
      }
      const booked = line.match(BOOKINGS_PATTERN);
      if (booked) {
        currentRep.booked = Number.parseInt(booked[1] || '0', 10);
        continue;
      }
      const opt = line.match(OPT_OUTS_PATTERN);
      if (opt) {
        currentRep.optOuts = Number.parseInt(opt[1] || '0', 10);
        continue;
      }
    }

    const seq = line.match(SEQUENCE_LINE_PATTERN);
    if (seq) {
      sequences.push({
        label: (seq[1] || '').trim(),
        messagesSent: Number.parseInt(seq[2] || '0', 10),
        repliesReceived: Number.parseInt(seq[3] || '0', 10),
        booked: Number.parseInt(seq[5] || '0', 10),
        optOuts: Number.parseInt(seq[6] || '0', 10),
      });
    }
  }

  return { day, sequences, reps };
};

export const getSalesMetricsSummary = async (
  params: { from: Date; to: Date },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SalesMetricsSummary> => {
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  const fromIso = params.from.toISOString();
  const toIso = params.to.toISOString();

  // Attribution rules (v1):
  // - messagesSent: count outbound sms_events in range
  // - manual vs sequence: sequence is non-empty => sequence; else manual
  // - repliesReceived: unique contacts with >=1 inbound in range (max 1 reply per contact)
  // - booking attribution:
  //    * booking is detected from inbound/outbound content (same heuristics as aloware-analytics)
  //    * booking is credited to the day it was booked (event day)
  //    * booking is attributed to the latest outbound touch within 14 days before booking:
  //        - prefer latest sequenced touch; if none, attribute to manual
  // - optOuts: unique contacts with >=1 opt-out inbound in range (max 1 per contact)
  //
  // NOTE: This uses sms_events (not daily_runs text) so it can enforce unique-per-contact and 14-day attribution.
  const { rows } = await pool.query<{
    event_ts: string;
    direction: 'inbound' | 'outbound' | 'unknown';
    contact_id: string | null;
    contact_phone: string | null;
    aloware_user: string | null;
    sequence: string | null;
    body: string | null;
  }>(
    `
    SELECT event_ts, direction, contact_id, contact_phone, aloware_user, sequence, body
    FROM sms_events
    WHERE event_ts >= $1::timestamptz
      AND event_ts <= $2::timestamptz
      AND direction IN ('inbound','outbound')
    ORDER BY event_ts ASC
    `,
    [fromIso, toIso],
  );

  const normalizeDigits = (value: string): string => value.replace(/\D/g, '');
  const contactKeyFor = (row: { contact_id: string | null; contact_phone: string | null }): string | null => {
    if (row.contact_id) return `contact:${row.contact_id}`;
    if (row.contact_phone) return `phone:${normalizeDigits(row.contact_phone)}`;
    return null;
  };

  const BOOKED_CONFIRMATION_LINK_PATTERN = /(?:https?:\/\/)?vip\.physicaltherapybiz\.com\/call-booked(?:[/?#][^\s]*)?/i;
  const BOOKING_PATTERN =
    /\b(book|booking|appointment|schedule|scheduled|availability|available|wednesday|thursday|friday|monday|tuesday|saturday|sunday|\d{1,2}:\d{2}\s*(am|pm)|strategy call|call)\b/i;
  const CANCELLATION_PATTERN = /\b(cancel|cancellation|delete me off your list|remove me|unsubscribe|stop)\b/i;

  const isBookingEvent = (direction: string, body: string): boolean => {
    if (BOOKED_CONFIRMATION_LINK_PATTERN.test(body)) return true;
    // inbound booking intent counts as booking signal; outbound confirmation link counts too
    if (direction === 'inbound' && BOOKING_PATTERN.test(body) && !CANCELLATION_PATTERN.test(body)) return true;
    return false;
  };

  const isOptOutEvent = (direction: string, body: string): boolean => {
    return direction === 'inbound' && CANCELLATION_PATTERN.test(body);
  };

  const dayKey = (ts: string): string | null => {
    const d = new Date(ts);
    if (!Number.isFinite(d.getTime())) return null;
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  type EventRow = (typeof rows)[number] & { _contactKey: string; _day: string };
  const events: EventRow[] = [];
  for (const r of rows) {
    const key = contactKeyFor(r);
    const day = dayKey(r.event_ts);
    if (!key || !day) continue;
    events.push({ ...r, _contactKey: key, _day: day });
  }

  const ATTRIBUTION_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

  const eventsByContact = new Map<string, EventRow[]>();
  for (const e of events) {
    const list = eventsByContact.get(e._contactKey) || [];
    list.push(e);
    eventsByContact.set(e._contactKey, list);
  }
  for (const list of eventsByContact.values()) {
    list.sort((a, b) => new Date(a.event_ts).getTime() - new Date(b.event_ts).getTime());
  }

  const trendMap = new Map<string, SalesTrendPoint>();
  const seqMap = new Map<string, TopSequenceRow>();
  const repMap = new Map<string, RepLeaderboardRow>();

  const emptyPoint = (day: string): SalesTrendPoint => ({
    day,
    messagesSent: 0,
    manualMessagesSent: 0,
    sequenceMessagesSent: 0,

    repliesReceived: 0,
    replyRatePct: 0,

    manualRepliesReceived: 0,
    manualReplyRatePct: 0,

    sequenceRepliesReceived: 0,
    sequenceReplyRatePct: 0,

    booked: 0,
    optOuts: 0,
  });

  // Exclusion rule:
  // Exclude ALL manual outbound texts for 14 days after a sequence-triggered reply.
  // (User clarified: "Exclude all manual outbounds for 14 days after the sequence reply")
  const isManualOutboundExcluded = (contactEvents: EventRow[], outbound: EventRow): boolean => {
    if (outbound.direction !== 'outbound') return false;
    const isManual = (outbound.sequence || '').trim().length === 0;
    if (!isManual) return false;

    const outboundTs = new Date(outbound.event_ts).getTime();
    if (!Number.isFinite(outboundTs)) return false;

    // Find the most recent inbound at/before this outbound.
    // If that inbound is attributed to a sequenced outbound touch, exclude this manual outbound.
    let latestInbound: EventRow | undefined;
    for (const e of contactEvents) {
      const ts = new Date(e.event_ts).getTime();
      if (!Number.isFinite(ts)) continue;
      if (ts > outboundTs) break;
      if (e.direction === 'inbound') latestInbound = e;
    }
    if (!latestInbound) return false;

    const inboundTs = new Date(latestInbound.event_ts).getTime();
    if (!Number.isFinite(inboundTs)) return false;
    if (outboundTs - inboundTs > ATTRIBUTION_WINDOW_MS) return false;

    // Attribute that inbound to latest outbound within 14 days (prefer sequenced).
    let latestOutbound: EventRow | undefined;
    let latestSequencedOutbound: EventRow | undefined;
    for (const candidate of contactEvents) {
      if (candidate.direction !== 'outbound') continue;
      const candidateTs = new Date(candidate.event_ts).getTime();
      if (!Number.isFinite(candidateTs)) continue;
      if (candidateTs > inboundTs) break;
      if (inboundTs - candidateTs > ATTRIBUTION_WINDOW_MS) continue;

      latestOutbound = candidate;
      if ((candidate.sequence || '').trim().length > 0) latestSequencedOutbound = candidate;
    }

    const attributedTouch = latestSequencedOutbound || latestOutbound;
    if (!attributedTouch) return false;

    const inboundWasSequenceReply = (attributedTouch.sequence || '').trim().length > 0;
    return inboundWasSequenceReply;
  };

  // messages sent (volume) + rep outbound conversations (approx)
  const outboundSeenByContact = new Set<string>();
  for (const e of events) {
    if (e.direction !== 'outbound') continue;

    const contactEvents = eventsByContact.get(e._contactKey) || [];
    if (isManualOutboundExcluded(contactEvents, e)) continue;

    const point = trendMap.get(e._day) || emptyPoint(e._day);

    point.messagesSent += 1;
    const hasSequence = Boolean((e.sequence || '').trim());
    if (hasSequence) point.sequenceMessagesSent += 1;
    else point.manualMessagesSent += 1;

    trendMap.set(e._day, point);

    // rep leaderboard: outboundConversations = unique contacts with outbound in range for that rep
    const repName = (e.aloware_user || '').trim();
    if (repName) {
      const repKey = `${repName}::${e._contactKey}`;
      if (!outboundSeenByContact.has(repKey)) {
        outboundSeenByContact.add(repKey);
        const repRow = repMap.get(repName) || {
          repName,
          outboundConversations: 0,
          booked: 0,
          optOuts: 0,
          replyRatePct: null,
        };
        repRow.outboundConversations += 1;
        repMap.set(repName, repRow);
      }
    }
  }

  // repliesReceived: unique contacts with inbound in range (max 1 per contact), credited to inbound day
  // Also split into manual vs sequence replies based on attribution to latest outbound touch within 14 days (prefer sequenced).
  const repliedContactsByDay = new Map<string, Set<string>>();
  const manualRepliedContactsByDay = new Map<string, Set<string>>();
  const sequenceRepliedContactsByDay = new Map<string, Set<string>>();

  for (const [contactKey, list] of eventsByContact.entries()) {
    const inboundEvents = list.filter((e) => e.direction === 'inbound');
    if (inboundEvents.length === 0) continue;

    for (const inbound of inboundEvents) {
      const inboundTs = new Date(inbound.event_ts).getTime();
      if (!Number.isFinite(inboundTs)) continue;

      // overall replied
      const allSet = repliedContactsByDay.get(inbound._day) || new Set<string>();
      allSet.add(contactKey);
      repliedContactsByDay.set(inbound._day, allSet);

      // attribute inbound to latest outbound within 14 days (prefer sequenced)
      let latestOutbound: EventRow | undefined;
      let latestSequencedOutbound: EventRow | undefined;
      for (const candidate of list) {
        if (candidate.direction !== 'outbound') continue;
        const candidateTs = new Date(candidate.event_ts).getTime();
        if (!Number.isFinite(candidateTs)) continue;
        if (candidateTs > inboundTs) break;
        if (inboundTs - candidateTs > ATTRIBUTION_WINDOW_MS) continue;

        latestOutbound = candidate;
        if ((candidate.sequence || '').trim().length > 0) latestSequencedOutbound = candidate;
      }

      const attributedTouch = latestSequencedOutbound || latestOutbound;
      const isSequenceReply = (attributedTouch?.sequence || '').trim().length > 0;

      if (isSequenceReply) {
        const set = sequenceRepliedContactsByDay.get(inbound._day) || new Set<string>();
        set.add(contactKey);
        sequenceRepliedContactsByDay.set(inbound._day, set);
      } else {
        const set = manualRepliedContactsByDay.get(inbound._day) || new Set<string>();
        set.add(contactKey);
        manualRepliedContactsByDay.set(inbound._day, set);
      }
    }
  }

  for (const [day, contacts] of repliedContactsByDay.entries()) {
    const point = trendMap.get(day) || emptyPoint(day);
    point.repliesReceived += contacts.size;
    trendMap.set(day, point);
  }
  for (const [day, contacts] of manualRepliedContactsByDay.entries()) {
    const point = trendMap.get(day) || emptyPoint(day);
    point.manualRepliesReceived += contacts.size;
    trendMap.set(day, point);
  }
  for (const [day, contacts] of sequenceRepliedContactsByDay.entries()) {
    const point = trendMap.get(day) || emptyPoint(day);
    point.sequenceRepliesReceived += contacts.size;
    trendMap.set(day, point);
  }

  // optOuts: unique contacts with opt-out inbound in range, credited to opt-out day
  const optOutContactsByDay = new Map<string, Set<string>>();
  for (const e of events) {
    const body = (e.body || '').trim();
    if (!body) continue;
    if (!isOptOutEvent(e.direction, body)) continue;
    const set = optOutContactsByDay.get(e._day) || new Set<string>();
    set.add(e._contactKey);
    optOutContactsByDay.set(e._day, set);
  }
  for (const [day, contacts] of optOutContactsByDay.entries()) {
    const point = trendMap.get(day) || emptyPoint(day);
    point.optOuts += contacts.size;
    trendMap.set(day, point);
  }

  // booking attribution: for each contact, find booking events in range; attribute each booking to latest outbound touch within 14 days
  for (const [_contactKey, list] of eventsByContact.entries()) {
    for (const e of list) {
      const body = (e.body || '').trim();
      if (!body) continue;
      if (!isBookingEvent(e.direction, body)) continue;

      const bookingTs = new Date(e.event_ts).getTime();
      if (!Number.isFinite(bookingTs)) continue;

      // find latest outbound touch within 14 days before booking
      let latestOutbound: EventRow | undefined;
      let latestSequencedOutbound: EventRow | undefined;

      for (const candidate of list) {
        if (candidate.direction !== 'outbound') continue;
        const candidateTs = new Date(candidate.event_ts).getTime();
        if (!Number.isFinite(candidateTs)) continue;
        if (candidateTs > bookingTs) break;
        if (bookingTs - candidateTs > ATTRIBUTION_WINDOW_MS) continue;

        latestOutbound = candidate;
        if ((candidate.sequence || '').trim().length > 0) {
          latestSequencedOutbound = candidate;
        }
      }

      const attributedTouch = latestSequencedOutbound || latestOutbound;
      const sequenceLabel = (attributedTouch?.sequence || '').trim() || 'No sequence (manual/direct)';

      // credit booking to booking day
      const bookingDay = e._day;
      const point = trendMap.get(bookingDay) || emptyPoint(bookingDay);
      point.booked += 1;
      trendMap.set(bookingDay, point);

      // attribute to sequence table
      const seqRow = seqMap.get(sequenceLabel) || {
        label: sequenceLabel,
        messagesSent: 0,
        repliesReceived: 0,
        replyRatePct: 0,
        booked: 0,
        optOuts: 0,
      };
      seqRow.booked += 1;
      seqMap.set(sequenceLabel, seqRow);

      // attribute to rep leaderboard if we have a rep on the attributed touch
      const repName = (attributedTouch?.aloware_user || '').trim();
      if (repName) {
        const repRow = repMap.get(repName) || {
          repName,
          outboundConversations: 0,
          booked: 0,
          optOuts: 0,
          replyRatePct: null,
        };
        repRow.booked += 1;
        repMap.set(repName, repRow);
      }
    }
  }

  // Fill sequence messagesSent from outbound events.
  // NOTE: manual outbound exclusion does NOT apply here because this table is "by sequence";
  // excluded manual outbounds are not part of any sequence label anyway.
  for (const e of events) {
    if (e.direction !== 'outbound') continue;
    const label = (e.sequence || '').trim() || 'No sequence (manual/direct)';
    const row = seqMap.get(label) || {
      label,
      messagesSent: 0,
      repliesReceived: 0,
      replyRatePct: 0,
      booked: 0,
      optOuts: 0,
    };
    row.messagesSent += 1;
    seqMap.set(label, row);
  }

  // replies per sequence: unique contacts that replied within 14 days of an outbound touch for that sequence (max 1 per contact per sequence)
  const repliedBySequence = new Map<string, Set<string>>();
  for (const [contactKey, list] of eventsByContact.entries()) {
    const inboundEvents = list.filter((e) => e.direction === 'inbound');
    if (inboundEvents.length === 0) continue;

    // for each inbound, find latest outbound within 14 days and attribute reply to that touch's sequence
    for (const inbound of inboundEvents) {
      const inboundTs = new Date(inbound.event_ts).getTime();
      if (!Number.isFinite(inboundTs)) continue;

      let latestOutbound: EventRow | undefined;
      let latestSequencedOutbound: EventRow | undefined;
      for (const candidate of list) {
        if (candidate.direction !== 'outbound') continue;
        const candidateTs = new Date(candidate.event_ts).getTime();
        if (!Number.isFinite(candidateTs)) continue;
        if (candidateTs > inboundTs) break;
        if (inboundTs - candidateTs > ATTRIBUTION_WINDOW_MS) continue;

        latestOutbound = candidate;
        if ((candidate.sequence || '').trim().length > 0) {
          latestSequencedOutbound = candidate;
        }
      }

      const attributedTouch = latestSequencedOutbound || latestOutbound;
      if (!attributedTouch) continue;

      const label = (attributedTouch.sequence || '').trim() || 'No sequence (manual/direct)';
      const set = repliedBySequence.get(label) || new Set<string>();
      set.add(contactKey);
      repliedBySequence.set(label, set);
    }
  }
  for (const [label, contacts] of repliedBySequence.entries()) {
    const row = seqMap.get(label);
    if (!row) continue;
    row.repliesReceived = contacts.size;
    row.replyRatePct = row.messagesSent > 0 ? (row.repliesReceived / row.messagesSent) * 100 : 0;
    seqMap.set(label, row);
  }

  // opt-outs per sequence: attribute opt-out to latest outbound within 14 days (prefer sequenced)
  const optOutBySequence = new Map<string, Set<string>>();
  for (const [contactKey, list] of eventsByContact.entries()) {
    const optOutEvents = list.filter((e) => {
      const body = (e.body || '').trim();
      return body && isOptOutEvent(e.direction, body);
    });
    if (optOutEvents.length === 0) continue;

    for (const opt of optOutEvents) {
      const optTs = new Date(opt.event_ts).getTime();
      if (!Number.isFinite(optTs)) continue;

      let latestOutbound: EventRow | undefined;
      let latestSequencedOutbound: EventRow | undefined;
      for (const candidate of list) {
        if (candidate.direction !== 'outbound') continue;
        const candidateTs = new Date(candidate.event_ts).getTime();
        if (!Number.isFinite(candidateTs)) continue;
        if (candidateTs > optTs) break;
        if (optTs - candidateTs > ATTRIBUTION_WINDOW_MS) continue;

        latestOutbound = candidate;
        if ((candidate.sequence || '').trim().length > 0) {
          latestSequencedOutbound = candidate;
        }
      }

      const attributedTouch = latestSequencedOutbound || latestOutbound;
      const label = (attributedTouch?.sequence || '').trim() || 'No sequence (manual/direct)';
      const set = optOutBySequence.get(label) || new Set<string>();
      set.add(contactKey);
      optOutBySequence.set(label, set);

      const repName = (attributedTouch?.aloware_user || '').trim();
      if (repName) {
        const repRow = repMap.get(repName) || {
          repName,
          outboundConversations: 0,
          booked: 0,
          optOuts: 0,
          replyRatePct: null,
        };
        repRow.optOuts += 1;
        repMap.set(repName, repRow);
      }
    }
  }
  for (const [label, contacts] of optOutBySequence.entries()) {
    const row = seqMap.get(label) || {
      label,
      messagesSent: 0,
      repliesReceived: 0,
      replyRatePct: 0,
      booked: 0,
      optOuts: 0,
    };
    row.optOuts = contacts.size;
    seqMap.set(label, row);
  }

  // finalize trend reply rates
  for (const point of trendMap.values()) {
    point.replyRatePct = point.messagesSent > 0 ? (point.repliesReceived / point.messagesSent) * 100 : 0;
    point.manualReplyRatePct =
      point.manualMessagesSent > 0 ? (point.manualRepliesReceived / point.manualMessagesSent) * 100 : 0;
    point.sequenceReplyRatePct =
      point.sequenceMessagesSent > 0 ? (point.sequenceRepliesReceived / point.sequenceMessagesSent) * 100 : 0;
  }

  const trendByDay = [...trendMap.values()].sort((a, b) => a.day.localeCompare(b.day));
  const topSequences = [...seqMap.values()]
    .sort((a, b) => b.booked - a.booked || b.messagesSent - a.messagesSent)
    .slice(0, 10);
  const repLeaderboard = [...repMap.values()].sort(
    (a, b) => b.booked - a.booked || b.outboundConversations - a.outboundConversations,
  );

  const totals = trendByDay.reduce(
    (acc, d) => {
      acc.messagesSent += d.messagesSent;
      acc.manualMessagesSent += d.manualMessagesSent;
      acc.sequenceMessagesSent += d.sequenceMessagesSent;

      acc.repliesReceived += d.repliesReceived;
      acc.manualRepliesReceived += d.manualRepliesReceived;
      acc.sequenceRepliesReceived += d.sequenceRepliesReceived;

      acc.booked += d.booked;
      acc.optOuts += d.optOuts;
      return acc;
    },
    {
      messagesSent: 0,
      manualMessagesSent: 0,
      sequenceMessagesSent: 0,
      repliesReceived: 0,
      manualRepliesReceived: 0,
      sequenceRepliesReceived: 0,
      booked: 0,
      optOuts: 0,
    },
  );

  const replyRatePct = totals.messagesSent > 0 ? (totals.repliesReceived / totals.messagesSent) * 100 : 0;
  const manualReplyRatePct =
    totals.manualMessagesSent > 0 ? (totals.manualRepliesReceived / totals.manualMessagesSent) * 100 : 0;
  const sequenceReplyRatePct =
    totals.sequenceMessagesSent > 0 ? (totals.sequenceRepliesReceived / totals.sequenceMessagesSent) * 100 : 0;

  logger?.debug?.('sales metrics computed', {
    days: trendByDay.length,
    sequences: topSequences.length,
    reps: repLeaderboard.length,
  });

  return {
    timeRange: { from: fromIso, to: toIso },
    totals: { ...totals, replyRatePct, manualReplyRatePct, sequenceReplyRatePct },
    trendByDay,
    topSequences,
    repLeaderboard,
  };
};
