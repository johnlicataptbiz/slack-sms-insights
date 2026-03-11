import type { Logger } from '@slack/bolt';

import { getBookedCallAttributionSources, getBookedCallSequenceFromSmsEvents, getBookedCallSmsReplyLinks } from './booked-calls.js';
import { getPrismaClient } from './prisma.js';
import { resolveTimeZone, DEFAULT_BUSINESS_TIMEZONE } from './time-range.js';
import { getSalesMetricsSummary } from './sales-metrics.js';
import { attributeSlackBookedCallsToSequences, type SequenceBookedBreakdown } from './sequence-booked-attribution.js';
import { parseLeadMagnetAndVersion } from './scoreboard.js';

export type SequenceKpiRow = {
  label: string;
  leadMagnet: string;
  version: string;
  messagesSent: number;
  uniqueContacted: number;
  repliesReceived: number;
  replyRatePct: number;
  bookedCalls: number;
  bookingRatePct: number;
  optOuts: number;
  optOutRatePct: number;
  firstSeenAt?: string | null;
  bookedBreakdown?: {
    jack: number;
    brandon: number;
    selfBooked: number;
    bookedAfterSmsReply: number;
    diagnosticSmsBookingSignals: number;
  };
};

export type SequenceKpis = {
  items: SequenceKpiRow[];
  window: { from: string; to: string; timeZone: string };
  verification: {
    slackBookedTotal: number;
    matchedCalls: number;
    unattributedCalls: number;
    manualDirectBooked: number;
    manualDirectSharePct: number;
    smsPhoneMatchedCalls: number;
    fuzzyTextMatchedCalls: number;
  };
};

const getPrisma = () => getPrismaClient();

const buildPeopleContactedBySequence = async (
  fromIso: string,
  toIso: string,
  logger?: Pick<Logger, 'debug' | 'warn' | 'error'>,
): Promise<Map<string, number>> => {
  const prisma = getPrisma();
  try {
    const rows = await prisma.$queryRawUnsafe<{ label: string; unique_contacts: number | bigint }[]>(
      `SELECT
         COALESCE(sr.label, COALESCE(NULLIF(TRIM(e.sequence), ''), 'No sequence (manual/direct)')) AS label,
         COUNT(DISTINCT COALESCE(contact_id, regexp_replace(contact_phone, '\\D', '', 'g'))) AS unique_contacts
       FROM sms_events e
       LEFT JOIN sequence_registry sr ON sr.id = e.sequence_id
       WHERE e.event_ts >= $1::timestamptz
         AND e.event_ts <= $2::timestamptz
         AND e.direction = 'outbound'
       GROUP BY 1`,
      fromIso,
      toIso,
    );
    return new Map(rows.map((r) => [r.label, Number(r.unique_contacts) || 0]));
  } catch (error) {
    logger?.error?.('sequence-kpis: failed to build people-contacted-by-sequence', error);
    return new Map();
  }
};

const resolveCanonicalSequenceLabels = async (labels: string[]): Promise<Map<string, string>> => {
  const prisma = getPrisma();
  const trimmed = labels.map((label) => label.trim()).filter(Boolean);
  if (trimmed.length === 0) return new Map();

  const rows = await prisma.sequence_aliases.findMany({
    where: { raw_label: { in: trimmed } },
    select: { raw_label: true, sequence: { select: { label: true } } },
  });

  return new Map(rows.map((row) => [row.raw_label, row.sequence.label]));
};

export const getSequenceKpis = async (
  params: { from: Date; to: Date; timeZone?: string; channelId?: string | null },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SequenceKpis> => {
  const tz = resolveTimeZone(params.timeZone) || DEFAULT_BUSINESS_TIMEZONE;
  const fromIso = params.from.toISOString();
  const toIso = params.to.toISOString();
  const channelId = params.channelId ?? process.env.BOOKED_CALLS_CHANNEL_ID ?? null;

  const [summary, attributionSources, peopleBySeq] = await Promise.all([
    getSalesMetricsSummary({ from: params.from, to: params.to, timeZone: tz }, logger),
    getBookedCallAttributionSources({ from: params.from, to: params.to, channelId: channelId || undefined }),
    buildPeopleContactedBySequence(fromIso, toIso, logger),
  ]);

  const smsLinks = await getBookedCallSmsReplyLinks(attributionSources, logger);
  const smsSeqLookup = await getBookedCallSequenceFromSmsEvents(attributionSources, logger, smsLinks);
  const seqAttribution = attributeSlackBookedCallsToSequences(summary.topSequences, attributionSources, smsLinks, smsSeqLookup);
  const canonicalMap = await resolveCanonicalSequenceLabels(summary.topSequences.map((row) => row.label));

  const bookedByCanonical = new Map<string, SequenceBookedBreakdown>();
  for (const [label, booked] of seqAttribution.byLabel.entries()) {
    const canonical = canonicalMap.get(label) ?? label;
    const existing = bookedByCanonical.get(canonical);
    if (!existing) {
      bookedByCanonical.set(canonical, { ...booked });
      continue;
    }
    existing.booked += booked.booked;
    existing.jack += booked.jack;
    existing.brandon += booked.brandon;
    existing.selfBooked += booked.selfBooked;
    existing.bookedAfterSmsReply += booked.bookedAfterSmsReply;
    existing.auditRows = existing.auditRows.concat(booked.auditRows);
  }

  const aggregated = new Map<
    string,
    {
      label: string;
      messagesSent: number;
      uniqueContacted: number;
      repliesReceived: number;
      optOuts: number;
      bookingSignalsSms: number;
      bookingSignals: number;
      bookedCalls: number;
      firstSeenAt?: string | null;
    }
  >();

  for (const row of summary.topSequences) {
    const canonical = canonicalMap.get(row.label) ?? row.label;
    const existing = aggregated.get(canonical);
    const uniqueContacted = row.uniqueContacted ?? 0;
    if (!existing) {
      aggregated.set(canonical, {
        label: canonical,
        messagesSent: row.messagesSent,
        uniqueContacted,
        repliesReceived: row.repliesReceived,
        optOuts: row.optOuts,
        bookingSignalsSms: row.bookingSignalsSms,
        bookingSignals: row.bookingSignalsSms,
        bookedCalls: row.booked ?? 0,
        firstSeenAt: row.firstSeenAt ?? null,
      });
      continue;
    }
    existing.messagesSent += row.messagesSent;
    existing.uniqueContacted += uniqueContacted;
    existing.repliesReceived += row.repliesReceived;
    existing.optOuts += row.optOuts;
    existing.bookingSignalsSms += row.bookingSignalsSms;
    existing.bookingSignals += row.bookingSignalsSms;
    existing.bookedCalls += row.booked ?? 0;
    if (row.firstSeenAt && (!existing.firstSeenAt || row.firstSeenAt < existing.firstSeenAt)) {
      existing.firstSeenAt = row.firstSeenAt;
    }
  }

  const aggregatedTotals = {
    messagesSent: 0,
    uniqueContacted: 0,
    repliesReceived: 0,
    optOuts: 0,
    bookingSignals: 0,
    bookedCalls: 0,
  };
  for (const stat of aggregated.values()) {
    aggregatedTotals.messagesSent += stat.messagesSent;
    aggregatedTotals.uniqueContacted += stat.uniqueContacted;
    aggregatedTotals.repliesReceived += stat.repliesReceived;
    aggregatedTotals.optOuts += stat.optOuts;
    aggregatedTotals.bookingSignals += stat.bookingSignals;
    aggregatedTotals.bookedCalls += stat.bookedCalls;
  }

  const manualDirectBooked = seqAttribution.totals.manualCalls;
  const slackBookedTotal = aggregatedTotals.bookedCalls;

  const items: SequenceKpiRow[] = Array.from(aggregated.values()).map((row) => {
    const booked = bookedByCanonical.get(row.label);
    const uniqueContacted = peopleBySeq.get(row.label) ?? row.messagesSent;
    const { leadMagnet, version } = parseLeadMagnetAndVersion(row.label);
    const replyRatePct = uniqueContacted > 0 ? (row.repliesReceived / uniqueContacted) * 100 : 0;
    const bookingRatePct = uniqueContacted > 0 ? ((booked?.booked ?? 0) / uniqueContacted) * 100 : 0;
    const optOutRatePct = row.messagesSent > 0 ? (row.optOuts / row.messagesSent) * 100 : 0;

    return {
      label: row.label,
      leadMagnet,
      version,
      messagesSent: row.messagesSent,
      uniqueContacted,
      repliesReceived: row.repliesReceived,
      replyRatePct,
      bookedCalls: booked?.booked ?? 0,
      bookingRatePct,
      optOuts: row.optOuts,
      optOutRatePct,
      firstSeenAt: row.firstSeenAt ?? null,
      bookedBreakdown: booked
        ? {
            jack: booked.jack,
            brandon: booked.brandon,
            selfBooked: booked.selfBooked,
            bookedAfterSmsReply: booked.bookedAfterSmsReply,
            diagnosticSmsBookingSignals: row.bookingSignalsSms,
          }
        : undefined,
    };
  });

  const verification = {
    slackBookedTotal,
    matchedCalls: seqAttribution.totals.matchedCalls,
    unattributedCalls: seqAttribution.totals.unattributedCalls,
    manualDirectBooked,
    manualDirectSharePct: slackBookedTotal > 0 ? (manualDirectBooked / slackBookedTotal) * 100 : 0,
    smsPhoneMatchedCalls: seqAttribution.totals.smsPhoneMatchedCalls,
    fuzzyTextMatchedCalls: seqAttribution.totals.fuzzyTextMatchedCalls,
  };

  return {
    items,
    window: { from: fromIso, to: toIso, timeZone: tz },
    verification,
  };
};
