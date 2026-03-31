import type { Logger } from '@slack/bolt';
import {
  getBookedCallAttributionSources,
  getBookedCallSequenceFromSmsEvents,
  getBookedCallSmsReplyLinks,
} from './booked-calls.js';

import { getPrismaClient } from './prisma.js';
import type { UnattributedAuditRow } from './sequence-booked-attribution.js';
import { attributeSlackBookedCallsToSequences } from './sequence-booked-attribution.js';

const getPrisma = () => getPrismaClient();
const DEFAULT_SALES_TEAM_BOARD_ID = '5077164868';
const isMondayBackfillLabel = (label: string): boolean => label.toLowerCase().includes('monday backfill');
const HIGH_CONFIDENCE_BOOKING_PATTERN =
  /\b(call booked|booked call|booked for|appointment booked|appointment confirmed|scheduled (?:a )?call|strategy call booked)\b/i;
const BOOKED_CONFIRMATION_LINK_PATTERN = /(?:https?:\/\/)?vip\.physicaltherapybiz\.com\/call-booked(?:[/?#][^\s]*)?/i;
const CANCELLATION_PATTERN = /\b(cancel|cancellation|delete me off your list|remove me|unsubscribe|stop)\b/i;

const contactKeyFor = (event: { contact_id: string | null; contact_phone: string | null }): string | null => {
  if (event.contact_id) return `contact:${event.contact_id}`;
  if (event.contact_phone) return `phone:${event.contact_phone.replace(/\D/g, '')}`;
  return null;
};

const isBookingSignal = (direction: string, body: string): boolean => {
  if (!body) return false;
  if (BOOKED_CONFIRMATION_LINK_PATTERN.test(body)) return true;
  return direction === 'inbound' && HIGH_CONFIDENCE_BOOKING_PATTERN.test(body) && !CANCELLATION_PATTERN.test(body);
};

const isOptOutSignal = (direction: string, body: string): boolean =>
  direction === 'inbound' && CANCELLATION_PATTERN.test(body);

export type SequenceDeepParams = {
  from: Date;
  to: Date;
  timeZone: string;
  status?: 'active' | 'inactive' | null;
};

export type SequenceDeepPayload = {
  window: { from: string; to: string; timeZone: string };
  warnings?: string[];
  unattributedAuditRows?: UnattributedAuditRow[];
  sequences: Array<{
    sequenceId: string;
    label: string;
    leadMagnet: string;
    versionTag: string;
    status: 'active' | 'inactive';
    ownerRep: string | null;
    isManualBucket: boolean;
    messagesSent: number;
    uniqueContacted: number;
    inboundTexts: number;
    repliesReceived: number;
    replyRatePct: number;
    bookedCalls: number;
    bookingRatePct: number;
    optOuts: number;
    optOutRatePct: number;
    bookedBreakdown: {
      jack: number;
      brandon: number;
      selfBooked: number;
      bookedAfterSmsReply: number;
      diagnosticSignals: number;
    };
    leadQuality: {
      leadsCount: number;
      highInterestPct: number;
      fullTimePct: number;
      mostlyCashPct: number;
      progressedToStep3Or4Pct: number;
    };
  }>;
  monday: {
    boards: number;
    staleBoards: number;
    erroredBoards: number;
    avgSourceCoveragePct: number;
    avgCampaignCoveragePct: number;
    avgSetByCoveragePct: number;
    avgTouchpointsCoveragePct: number;
  };
  verification: {
    slackBookedTotal: number;
    mondayBookedTotal: number;
    deltaBookedVsMonday: number;
    matchedCalls: number;
    unattributedCalls: number;
    manualCalls: number;
    strictSmsReplyLinkedCalls: number;
    smsPhoneMatchedCalls: number;
    fuzzyTextMatchedCalls: number;
    manualDirectBooked: number;
    manualDirectSharePct: number;
    attributionConversationMapped: number;
    attributionConversationMappedPct: number;
  };
};

export const getSequencesDeep = async (
  params: SequenceDeepParams,
  logger?: Pick<Logger, 'warn'>,
): Promise<SequenceDeepPayload> => {
  const prisma = getPrisma();
  const salesTeamBoardId = (process.env.MONDAY_SALES_TEAM_BOARD_ID || DEFAULT_SALES_TEAM_BOARD_ID).trim();
  const fromDay = params.from.toISOString().slice(0, 10);
  const toDay = params.to.toISOString().slice(0, 10);
  const scanFrom = new Date(params.from.getTime() - 14 * 24 * 60 * 60 * 1000);

  const [
    bookingRows,
    leadRows,
    sequenceRows,
    mondayRows,
    manualBucketRows,
    attributionStats,
    mondayBookedTotalRows,
    attributedByLabelRows,
    rawEventRows,
  ] = await Promise.all([
    (async () => {
    (async () => {
      try {
        return await prisma.fact_booking_daily.findMany({
          where: {
            day: {
              gte: new Date(`${fromDay}T00:00:00.000Z`),
              lte: new Date(`${toDay}T00:00:00.000Z`),
            },
          },
          select: {
            sequence_id: true,
            booked_total: true,
            booked_jack: true,
            booked_brandon: true,
            booked_self: true,
            booked_after_sms_reply: true,
            booking_rate_pct: true,
            diagnostic_booking_signals: true,
          },
        });
      } catch (error) {
        // Table may not exist in production yet
        logger?.warn?.('sequences-deep: fact_booking_daily table not available', {
          error: error instanceof Error ? error.message : String(error),
        });
        return [];
      }
    })(),
    prisma.fact_lead_quality_daily.findMany({
      where: {
        day: {
          gte: new Date(`${fromDay}T00:00:00.000Z`),
          lte: new Date(`${toDay}T00:00:00.000Z`),
        },
      },
      select: {
        sequence_id: true,
        leads_count: true,
        coaching_interest_high: true,
        employment_full_time: true,
        revenue_mix_mostly_cash: true,
        progress_step_3_count: true,
        progress_step_4_count: true,
      },
    }),
    prisma.sequence_registry.findMany({
      where: params.status ? { status: params.status } : undefined,
      select: {
        id: true,
        label: true,
        lead_magnet: true,
        version_tag: true,
        owner_rep: true,
        status: true,
        is_manual_bucket: true,
      },
      orderBy: { label: 'asc' },
    }),
    prisma.fact_monday_health_daily.findMany({
      where: {
        day: {
          gte: new Date(`${fromDay}T00:00:00.000Z`),
          lte: new Date(`${toDay}T00:00:00.000Z`),
        },
      },
      select: {
        board_id: true,
        is_stale: true,
        sync_status: true,
        source_coverage_pct: true,
        campaign_coverage_pct: true,
        set_by_coverage_pct: true,
        touchpoints_coverage_pct: true,
      },
    }),
    prisma.sequence_registry.findMany({
      where: { is_manual_bucket: true },
      select: { id: true },
    }),
    prisma.$queryRawUnsafe<Array<{ total: number; mapped_conversation: number }>>(
      `
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE conversation_id IS NOT NULL)::int AS mapped_conversation
      FROM booked_call_attribution
      WHERE booked_event_ts >= $1::timestamptz
        AND booked_event_ts <= $2::timestamptz
      `,
      params.from.toISOString(),
      params.to.toISOString(),
    ),
    prisma.$queryRawUnsafe<Array<{ monday_booked_total: number }>>(
      `
      SELECT COUNT(*)::int AS monday_booked_total
      FROM monday_call_snapshots
      WHERE is_booked = TRUE
        AND board_id = $3
        AND call_date >= $1::date
        AND call_date <= $2::date
      `,
      fromDay,
      toDay,
      salesTeamBoardId,
    ),
    prisma.$queryRawUnsafe<
      Array<{
        sequence_label: string;
        booked_total: number;
        booked_jack: number;
        booked_brandon: number;
        booked_self: number;
      }>
    >(
      `
      SELECT
        COALESCE(NULLIF(BTRIM(b.first_conversion), ''), NULLIF(BTRIM(b.setter_final), ''), 'No sequence (manual/direct)') AS sequence_label,
        COUNT(*)::int AS booked_total,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(b.setter_final, '')) LIKE '%jack%')::int AS booked_jack,
        COUNT(*) FILTER (WHERE LOWER(COALESCE(b.setter_final, '')) LIKE '%brandon%')::int AS booked_brandon,
        COUNT(*) FILTER (
          WHERE NOT (
            LOWER(COALESCE(b.setter_final, '')) LIKE '%jack%'
            OR LOWER(COALESCE(b.setter_final, '')) LIKE '%brandon%'
          )
        )::int AS booked_self
      FROM booked_call_attribution b
      WHERE b.booked_event_ts >= $1::timestamptz
        AND b.booked_event_ts <= $2::timestamptz
      GROUP BY 1
      `,
      params.from.toISOString(),
      params.to.toISOString(),
    ),
    prisma.sms_events.findMany({
      where: {
        event_ts: { gte: scanFrom, lte: params.to },
        direction: { in: ['inbound', 'outbound'] },
      },
      orderBy: { event_ts: 'asc' },
      select: {
        event_ts: true,
        direction: true,
        sequence_id: true,
        body: true,
        contact_id: true,
        contact_phone: true,
      },
    }),
  ]);

  const manualSequenceId = sequenceRows.find((row) => row.is_manual_bucket)?.id || null;
  const backfillSequenceIds = new Set(
    sequenceRows.filter((row) => isMondayBackfillLabel(row.label)).map((row) => row.id),
  );
  const resolveSequenceId = (sequenceId: string): string =>
    manualSequenceId && backfillSequenceIds.has(sequenceId) ? manualSequenceId : sequenceId;

interface SmsEventExtended {
  event_ts: Date;
  direction: string;
  sequence_id: string | null;
  body: string | null;
  contact_id: string | null;
  contact_phone: string | null;
  _contactKey: string;
  _seqId: string;
}

type Event = SmsEventExtended;
  const events: Event[] = [];
  for (const row of rawEventRows) {
    const contactKey = contactKeyFor(row);
    if (!contactKey) continue;
    const resolvedSequenceId = row.sequence_id || manualSequenceId;
    if (!resolvedSequenceId) continue;
    events.push({
      ...row,
      _contactKey: contactKey,
      _seqId: resolveSequenceId(resolvedSequenceId),
    } as Event);
  }

  const eventsByContact = new Map<string, Event[]>();
  for (const event of events) {
    const list = eventsByContact.get(event._contactKey) || [];
    list.push(event);
    eventsByContact.set(event._contactKey, list);
  }

  interface SequenceSummary {
    messagesSent: number;
    inboundTexts: number;
    repliesReceived: number;
    optOuts: number;
    bookingSignals: number;
    bookedCalls: number;
    bookedJack: number;
    bookedBrandon: number;
    bookedSelf: number;
    bookedAfterReply: number;
    qualityLeads: number;
    qualityHighInterest: number;
    qualityFullTime: number;
    qualityMostlyCash: number;
    qualityStep34: number;
    uniqueContactedSet: Set<string>;
    repliedSet: Set<string>;
    optOutSet: Set<string>;
  }

  const summary = new Map<string, SequenceSummary>();

  const ensure = (sequenceId: string) => {
    let row = summary.get(sequenceId);
    if (!row) {
      row = {
        messagesSent: 0,
        inboundTexts: 0,
        repliesReceived: 0,
        optOuts: 0,
        bookingSignals: 0,
        bookedCalls: 0,
        bookedJack: 0,
        bookedBrandon: 0,
        bookedSelf: 0,
        bookedAfterReply: 0,
        qualityLeads: 0,
        qualityHighInterest: 0,
        qualityFullTime: 0,
        qualityMostlyCash: 0,
        qualityStep34: 0,
        uniqueContactedSet: new Set<string>(),
        repliedSet: new Set<string>(),
        optOutSet: new Set<string>(),
      };
      summary.set(sequenceId, row);
    }
    return row;
  };

  for (const event of events) {
    if (event.event_ts < params.from) continue;
    if (event.direction !== 'outbound') continue;
    const stat = ensure(event._seqId);
    stat.messagesSent += 1;
    stat.uniqueContactedSet.add(event._contactKey);
  }

  for (const contactEvents of eventsByContact.values()) {
    for (const inbound of contactEvents) {
      if (inbound.event_ts < params.from || inbound.direction !== 'inbound') continue;

      const inboundTs = inbound.event_ts.getTime();
      let latestAny: Event | null = null;
      let latestSequenced: Event | null = null;

      for (const candidate of contactEvents) {
        if (candidate.direction !== 'outbound') continue;
        const ts = candidate.event_ts.getTime();
        if (ts > inboundTs) break;
        if (inboundTs - ts > 14 * 24 * 60 * 60 * 1000) continue;
        latestAny = candidate;
        if (candidate.sequence_id) latestSequenced = candidate;
      }

      const attributed = latestSequenced || latestAny;
      if (!attributed) continue;

      const stat = ensure(attributed._seqId);
      stat.inboundTexts += 1;

      if (!stat.repliedSet.has(inbound._contactKey)) {
        stat.repliedSet.add(inbound._contactKey);
        stat.repliesReceived += 1;
      }

      const body = (inbound.body || '').trim();
      if (isOptOutSignal(inbound.direction, body) && !stat.optOutSet.has(inbound._contactKey)) {
        stat.optOutSet.add(inbound._contactKey);
        stat.optOuts += 1;
      }

      if (isBookingSignal(inbound.direction, body)) {
        stat.bookingSignals += 1;
      }
    }
  }

  for (const row of bookingRows) {
    const stat = ensure(resolveSequenceId(row.sequence_id));
    stat.bookedCalls += row.booked_total;
    stat.bookedJack += row.booked_jack;
    stat.bookedBrandon += row.booked_brandon;
    stat.bookedSelf += row.booked_self;
    stat.bookedAfterReply += row.booked_after_sms_reply;
    stat.bookingSignals += row.diagnostic_booking_signals;
  }

  for (const row of leadRows) {
    const stat = ensure(resolveSequenceId(row.sequence_id));
    stat.qualityLeads += row.leads_count;
    stat.qualityHighInterest += row.coaching_interest_high;
    stat.qualityFullTime += row.employment_full_time;
    stat.qualityMostlyCash += row.revenue_mix_mostly_cash;
    stat.qualityStep34 += row.progress_step_3_count + row.progress_step_4_count;
  }

  const normalizedLabelMap = new Map<string, string>();
  const normalizeLabel = (value: string): string => value.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const row of sequenceRows) {
    normalizedLabelMap.set(normalizeLabel(row.label), row.id);
  }

  for (const row of attributedByLabelRows) {
    const rawLabel = (row.sequence_label || '').trim();
    if (!rawLabel) continue;
    const matchedSequenceId = normalizedLabelMap.get(normalizeLabel(rawLabel));
    if (!matchedSequenceId) continue;
    const stat = ensure(resolveSequenceId(matchedSequenceId));

    // Fallback attribution: only fill gaps where fact_booking_daily is 0 for this sequence in range.
    if (stat.bookedCalls === 0 && row.booked_total > 0) {
      stat.bookedCalls = row.booked_total;
      stat.bookedJack = row.booked_jack;
      stat.bookedBrandon = row.booked_brandon;
      stat.bookedSelf = row.booked_self;
    }
  }

  const sequences = sequenceRows
    .filter((row) => !backfillSequenceIds.has(row.id))
    .map((row) => {
      const stat = summary.get(row.id);
      const messagesSent = stat?.messagesSent || 0;
      const uniqueContacted = stat?.uniqueContactedSet.size || 0;
      const inboundTexts = stat?.inboundTexts || 0;
      const repliesReceived = stat?.repliesReceived || 0;
      const bookedCalls = stat?.bookedCalls || 0;
      const optOuts = stat?.optOuts || 0;
      const qualityLeads = stat?.qualityLeads || 0;

      return {
        sequenceId: row.id,
        label: row.label,
        leadMagnet: row.lead_magnet || row.label,
        versionTag: row.version_tag || '',
        status: row.status,
        ownerRep: row.owner_rep,
        isManualBucket: row.is_manual_bucket,
        messagesSent,
        uniqueContacted,
        inboundTexts,
        repliesReceived,
        replyRatePct: uniqueContacted > 0 ? (repliesReceived / uniqueContacted) * 100 : 0,
        bookedCalls,
        bookingRatePct: uniqueContacted > 0 ? (bookedCalls / uniqueContacted) * 100 : 0,
        optOuts,
        optOutRatePct: messagesSent > 0 ? (optOuts / messagesSent) * 100 : 0,
        bookedBreakdown: {
          jack: stat?.bookedJack || 0,
          brandon: stat?.bookedBrandon || 0,
          selfBooked: stat?.bookedSelf || 0,
          bookedAfterSmsReply: stat?.bookedAfterReply || 0,
          diagnosticSignals: stat?.bookingSignals || 0,
        },
        leadQuality: {
          leadsCount: qualityLeads,
          highInterestPct: qualityLeads > 0 ? ((stat?.qualityHighInterest || 0) / qualityLeads) * 100 : 0,
          fullTimePct: qualityLeads > 0 ? ((stat?.qualityFullTime || 0) / qualityLeads) * 100 : 0,
          mostlyCashPct: qualityLeads > 0 ? ((stat?.qualityMostlyCash || 0) / qualityLeads) * 100 : 0,
          progressedToStep3Or4Pct: qualityLeads > 0 ? ((stat?.qualityStep34 || 0) / qualityLeads) * 100 : 0,
        },
      };
    })
    .filter((row) => row.messagesSent > 0 || row.bookedCalls > 0 || row.leadQuality.leadsCount > 0)
    .sort((a, b) => b.bookedCalls - a.bookedCalls || b.messagesSent - a.messagesSent);

  const boards = new Set(mondayRows.map((row) => row.board_id)).size;
  const staleBoards = mondayRows.filter((row) => row.is_stale).length;
  const erroredBoards = mondayRows.filter((row) => row.sync_status === 'error').length;
  const manualBucketIds = new Set(manualBucketRows.map((row) => row.id));
  const slackBookedTotal = bookingRows.reduce((sum, row) => sum + row.booked_total, 0);
  const manualDirectBooked = bookingRows
    .filter((row) => (row.sequence_id && manualBucketIds.has(row.sequence_id)) || false)
    .reduce((sum, row) => sum + row.booked_total, 0);

  const stats = attributionStats?.[0] || { total: 0, mapped_conversation: 0 };
  const attributionTotal = stats.total || 0;
  const attributionMappedConversation = stats.mapped_conversation || 0;
  const mondayBookedTotal = mondayBookedTotalRows?.[0]?.monday_booked_total || 0;
  const bookedCallSources = await getBookedCallAttributionSources({
    from: params.from,
    to: params.to,
  });
  const smsReplyLinks = await getBookedCallSmsReplyLinks(bookedCallSources);
  const smsSequenceLookup = await getBookedCallSequenceFromSmsEvents(bookedCallSources, undefined, smsReplyLinks);
  const sequenceAttribution = attributeSlackBookedCallsToSequences(
    sequences.map((row) => ({
      label: row.label,
      messagesSent: row.messagesSent,
      repliesReceived: row.repliesReceived,
      replyRatePct: row.replyRatePct,
      bookingSignalsSms: row.bookedBreakdown.diagnosticSignals,
      booked: row.bookedCalls,
      optOuts: row.optOuts,
      uniqueContacted: row.uniqueContacted,
      bookingRatePct: row.bookingRatePct,
    })),
    bookedCallSources,
    smsReplyLinks,
    smsSequenceLookup,
  );

  if (mondayRows.length === 0) {
    logger?.warn?.('sequences-deep: no monday health rows in requested window');
  }

  return {
    window: {
      from: params.from.toISOString(),
      to: params.to.toISOString(),
      timeZone: params.timeZone,
    },
    unattributedAuditRows: sequenceAttribution.unattributedAuditRows,
    sequences,
    monday: {
      boards,
      staleBoards,
      erroredBoards,
      avgSourceCoveragePct:
        mondayRows.length > 0
          ? mondayRows.reduce((sum, row) => sum + row.source_coverage_pct, 0) / mondayRows.length
          : 0,
      avgCampaignCoveragePct:
        mondayRows.length > 0
          ? mondayRows.reduce((sum, row) => sum + row.campaign_coverage_pct, 0) / mondayRows.length
          : 0,
      avgSetByCoveragePct:
        mondayRows.length > 0
          ? mondayRows.reduce((sum, row) => sum + row.set_by_coverage_pct, 0) / mondayRows.length
          : 0,
      avgTouchpointsCoveragePct:
        mondayRows.length > 0
          ? mondayRows.reduce((sum, row) => sum + row.touchpoints_coverage_pct, 0) / mondayRows.length
          : 0,
    },
    verification: {
      slackBookedTotal,
      mondayBookedTotal,
      deltaBookedVsMonday: slackBookedTotal - mondayBookedTotal,
      matchedCalls: sequenceAttribution.totals.matchedCalls,
      unattributedCalls: sequenceAttribution.totals.unattributedCalls,
      manualCalls: sequenceAttribution.totals.manualCalls,
      strictSmsReplyLinkedCalls: sequenceAttribution.totals.bookedAfterSmsReply,
      smsPhoneMatchedCalls: sequenceAttribution.totals.smsPhoneMatchedCalls,
      fuzzyTextMatchedCalls: sequenceAttribution.totals.fuzzyTextMatchedCalls,
      manualDirectBooked,
      manualDirectSharePct: slackBookedTotal > 0 ? (manualDirectBooked / slackBookedTotal) * 100 : 0,
      attributionConversationMapped: attributionMappedConversation,
      attributionConversationMappedPct:
        attributionTotal > 0 ? (attributionMappedConversation / attributionTotal) * 100 : 0,
    },
  };
};
