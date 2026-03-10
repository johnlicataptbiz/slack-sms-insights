import type { Logger } from '@slack/bolt';
import { getPrismaClient } from './prisma.js';

const getPrisma = () => getPrismaClient();
const DEFAULT_SALES_TEAM_BOARD_ID = '5077164868';
const MONDAY_BACKFILL_LABEL = 'Monday backfill (sequence unresolved)';
const SOCIAL_MEDIA_BACKFILL_LABEL = 'Social Media (Monday backfill)';

export type SequenceDeepParams = {
  from: Date;
  to: Date;
  timeZone: string;
  status?: 'active' | 'inactive' | null;
};

export type SequenceDeepPayload = {
  window: { from: string; to: string; timeZone: string };
  warnings?: string[];
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

  const [smsRows, bookingRows, leadRows, sequenceRows, mondayRows, manualBucketRows, attributionStats, mondayBookedTotalRows] = await Promise.all([
    prisma.fact_sms_daily.findMany({
      where: {
        day: {
          gte: new Date(`${fromDay}T00:00:00.000Z`),
          lte: new Date(`${toDay}T00:00:00.000Z`),
        },
      },
      select: {
        sequence_id: true,
        messages_sent: true,
        unique_contacted: true,
        replies_received: true,
        reply_rate_pct: true,
        opt_outs: true,
        opt_out_rate_pct: true,
        booking_signals_sms: true,
      },
    }),
    prisma.fact_booking_daily.findMany({
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
    }),
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
  ]);

  const manualSequenceId = sequenceRows.find((row) => row.is_manual_bucket)?.id || null;
  const backfillSequenceIds = new Set(
    sequenceRows
      .filter((row) => row.label === MONDAY_BACKFILL_LABEL || row.label === SOCIAL_MEDIA_BACKFILL_LABEL)
      .map((row) => row.id),
  );
  const resolveSequenceId = (sequenceId: string): string =>
    manualSequenceId && backfillSequenceIds.has(sequenceId) ? manualSequenceId : sequenceId;

  const summary = new Map<string, {
    messagesSent: number;
    uniqueContacted: number;
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
  }>();

  const ensure = (sequenceId: string) => {
    let row = summary.get(sequenceId);
    if (!row) {
      row = {
        messagesSent: 0,
        uniqueContacted: 0,
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
      };
      summary.set(sequenceId, row);
    }
    return row;
  };

  for (const row of smsRows) {
    const stat = ensure(resolveSequenceId(row.sequence_id));
    stat.messagesSent += row.messages_sent;
    stat.uniqueContacted += row.unique_contacted;
    stat.repliesReceived += row.replies_received;
    stat.optOuts += row.opt_outs;
    stat.bookingSignals += row.booking_signals_sms;
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

  const sequences = sequenceRows
    .filter((row) => !backfillSequenceIds.has(row.id))
    .map((row) => {
      const stat = summary.get(row.id);
      const messagesSent = stat?.messagesSent || 0;
      const uniqueContacted = stat?.uniqueContacted || 0;
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
    .filter((row) => manualBucketIds.has(row.sequence_id))
    .reduce((sum, row) => sum + row.booked_total, 0);
  const mondayBookedTotal = mondayBookedTotalRows[0]?.monday_booked_total || 0;
  const attributionTotal = attributionStats[0]?.total || 0;
  const attributionMappedConversation = attributionStats[0]?.mapped_conversation || 0;

  if (mondayRows.length === 0) {
    logger?.warn?.('sequences-deep: no monday health rows in requested window');
  }

  return {
    window: { from: params.from.toISOString(), to: params.to.toISOString(), timeZone: params.timeZone },
    sequences,
    monday: {
      boards,
      staleBoards,
      erroredBoards,
      avgSourceCoveragePct:
        mondayRows.length > 0 ? mondayRows.reduce((sum, row) => sum + row.source_coverage_pct, 0) / mondayRows.length : 0,
      avgCampaignCoveragePct:
        mondayRows.length > 0 ? mondayRows.reduce((sum, row) => sum + row.campaign_coverage_pct, 0) / mondayRows.length : 0,
      avgSetByCoveragePct:
        mondayRows.length > 0 ? mondayRows.reduce((sum, row) => sum + row.set_by_coverage_pct, 0) / mondayRows.length : 0,
      avgTouchpointsCoveragePct:
        mondayRows.length > 0
          ? mondayRows.reduce((sum, row) => sum + row.touchpoints_coverage_pct, 0) / mondayRows.length
          : 0,
    },
    verification: {
      slackBookedTotal,
      mondayBookedTotal,
      deltaBookedVsMonday: slackBookedTotal - mondayBookedTotal,
      manualDirectBooked,
      manualDirectSharePct: slackBookedTotal > 0 ? (manualDirectBooked / slackBookedTotal) * 100 : 0,
      attributionConversationMapped: attributionMappedConversation,
      attributionConversationMappedPct:
        attributionTotal > 0 ? (attributionMappedConversation / attributionTotal) * 100 : 0,
    },
  };
};
