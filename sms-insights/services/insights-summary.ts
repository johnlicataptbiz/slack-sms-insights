import type { Logger } from '@slack/bolt';
import { getPrismaClient } from './prisma.js';

const getPrisma = () => getPrismaClient();

type InsightsSummaryParams = {
  from: Date;
  to: Date;
  timeZone: string;
  rep?: 'jack' | 'brandon' | null;
};

export type InsightsSummary = {
  window: { from: string; to: string; timeZone: string };
  warnings?: string[];
  kpis: {
    messagesSent: number;
    uniqueContacted: number;
    repliesReceived: number;
    replyRatePct: number;
    bookedCalls: number;
    bookingRatePct: number;
    optOuts: number;
    optOutRatePct: number;
  };
  reps: Array<{
    repId: string;
    messagesSent: number;
    uniqueContacted: number;
    repliesReceived: number;
    replyRatePct: number;
    bookedCalls: number;
    bookingRatePct: number;
    optOuts: number;
    optOutRatePct: number;
  }>;
  funnel: {
    contacted: number;
    replied: number;
    booked: number;
    replyDropoffPct: number;
    bookingDropoffPct: number;
  };
  risks: Array<{ key: string; severity: 'critical' | 'warning' | 'info'; message: string }>;
  mondayHealth: {
    boards: number;
    staleBoards: number;
    erroredBoards: number;
    avgSourceCoveragePct: number;
    avgCampaignCoveragePct: number;
    avgSetByCoveragePct: number;
    avgTouchpointsCoveragePct: number;
  };
};

export const getInsightsSummary = async (
  params: InsightsSummaryParams,
  logger?: Pick<Logger, 'warn'>,
): Promise<InsightsSummary> => {
  const prisma = getPrisma();
  const fromDay = params.from.toISOString().slice(0, 10);
  const toDay = params.to.toISOString().slice(0, 10);

  const smsRows = await prisma.fact_sms_daily.findMany({
    where: {
      day: {
        gte: new Date(`${fromDay}T00:00:00.000Z`),
        lte: new Date(`${toDay}T00:00:00.000Z`),
      },
      ...(params.rep ? { rep_id: params.rep } : {}),
    },
    select: {
      rep_id: true,
      messages_sent: true,
      unique_contacted: true,
      replies_received: true,
      opt_outs: true,
    },
  });

  const bookingRows = await prisma.fact_booking_daily.findMany({
    where: {
      day: {
        gte: new Date(`${fromDay}T00:00:00.000Z`),
        lte: new Date(`${toDay}T00:00:00.000Z`),
      },
      ...(params.rep ? { rep_id: params.rep } : {}),
    },
    select: {
      rep_id: true,
      booked_total: true,
    },
  });

  const mondayRows = await prisma.fact_monday_health_daily.findMany({
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
  });

  const repTotals = new Map<string, {
    messagesSent: number;
    uniqueContacted: number;
    repliesReceived: number;
    bookedCalls: number;
    optOuts: number;
  }>();

  const ensure = (repId: string) => {
    const key = repId || 'unknown';
    let row = repTotals.get(key);
    if (!row) {
      row = { messagesSent: 0, uniqueContacted: 0, repliesReceived: 0, bookedCalls: 0, optOuts: 0 };
      repTotals.set(key, row);
    }
    return row;
  };

  for (const row of smsRows) {
    const rep = ensure(row.rep_id);
    rep.messagesSent += row.messages_sent;
    rep.uniqueContacted += row.unique_contacted;
    rep.repliesReceived += row.replies_received;
    rep.optOuts += row.opt_outs;
  }

  for (const row of bookingRows) {
    const rep = ensure(row.rep_id);
    rep.bookedCalls += row.booked_total;
  }

  const reps = Array.from(repTotals.entries())
    .map(([repId, row]) => ({
      repId,
      messagesSent: row.messagesSent,
      uniqueContacted: row.uniqueContacted,
      repliesReceived: row.repliesReceived,
      replyRatePct: row.uniqueContacted > 0 ? (row.repliesReceived / row.uniqueContacted) * 100 : 0,
      bookedCalls: row.bookedCalls,
      bookingRatePct: row.uniqueContacted > 0 ? (row.bookedCalls / row.uniqueContacted) * 100 : 0,
      optOuts: row.optOuts,
      optOutRatePct: row.messagesSent > 0 ? (row.optOuts / row.messagesSent) * 100 : 0,
    }))
    .sort((a, b) => b.messagesSent - a.messagesSent);

  const kpis = reps.reduce(
    (acc, rep) => {
      acc.messagesSent += rep.messagesSent;
      acc.uniqueContacted += rep.uniqueContacted;
      acc.repliesReceived += rep.repliesReceived;
      acc.bookedCalls += rep.bookedCalls;
      acc.optOuts += rep.optOuts;
      return acc;
    },
    { messagesSent: 0, uniqueContacted: 0, repliesReceived: 0, bookedCalls: 0, optOuts: 0 },
  );

  const replyRatePct = kpis.uniqueContacted > 0 ? (kpis.repliesReceived / kpis.uniqueContacted) * 100 : 0;
  const bookingRatePct = kpis.uniqueContacted > 0 ? (kpis.bookedCalls / kpis.uniqueContacted) * 100 : 0;
  const optOutRatePct = kpis.messagesSent > 0 ? (kpis.optOuts / kpis.messagesSent) * 100 : 0;

  const risks: InsightsSummary['risks'] = [];
  if (optOutRatePct >= 3) {
    risks.push({ key: 'optout', severity: 'critical', message: `Opt-out rate ${optOutRatePct.toFixed(1)}% is above watch threshold.` });
  }
  if (replyRatePct < 5 && kpis.messagesSent >= 50) {
    risks.push({ key: 'reply', severity: 'warning', message: `Reply rate ${replyRatePct.toFixed(1)}% is low for current volume.` });
  }
  if (bookingRatePct < 1 && kpis.uniqueContacted >= 100) {
    risks.push({ key: 'booking', severity: 'warning', message: `Booking rate ${bookingRatePct.toFixed(1)}% is below target.` });
  }

  const boards = new Set(mondayRows.map((row) => row.board_id)).size;
  const staleBoards = mondayRows.filter((row) => row.is_stale).length;
  const erroredBoards = mondayRows.filter((row) => row.sync_status === 'error').length;
  const avgSourceCoveragePct =
    mondayRows.length > 0 ? mondayRows.reduce((sum, row) => sum + row.source_coverage_pct, 0) / mondayRows.length : 0;
  const avgCampaignCoveragePct =
    mondayRows.length > 0 ? mondayRows.reduce((sum, row) => sum + row.campaign_coverage_pct, 0) / mondayRows.length : 0;
  const avgSetByCoveragePct =
    mondayRows.length > 0 ? mondayRows.reduce((sum, row) => sum + row.set_by_coverage_pct, 0) / mondayRows.length : 0;
  const avgTouchpointsCoveragePct =
    mondayRows.length > 0 ? mondayRows.reduce((sum, row) => sum + row.touchpoints_coverage_pct, 0) / mondayRows.length : 0;

  if (mondayRows.length === 0) {
    logger?.warn?.('insights-summary: no monday health rows in requested window');
  }

  return {
    window: { from: params.from.toISOString(), to: params.to.toISOString(), timeZone: params.timeZone },
    kpis: {
      messagesSent: kpis.messagesSent,
      uniqueContacted: kpis.uniqueContacted,
      repliesReceived: kpis.repliesReceived,
      replyRatePct,
      bookedCalls: kpis.bookedCalls,
      bookingRatePct,
      optOuts: kpis.optOuts,
      optOutRatePct,
    },
    reps,
    funnel: {
      contacted: kpis.uniqueContacted,
      replied: kpis.repliesReceived,
      booked: kpis.bookedCalls,
      replyDropoffPct: kpis.uniqueContacted > 0 ? ((kpis.uniqueContacted - kpis.repliesReceived) / kpis.uniqueContacted) * 100 : 0,
      bookingDropoffPct: kpis.repliesReceived > 0 ? ((kpis.repliesReceived - kpis.bookedCalls) / kpis.repliesReceived) * 100 : 0,
    },
    risks,
    mondayHealth: {
      boards,
      staleBoards,
      erroredBoards,
      avgSourceCoveragePct,
      avgCampaignCoveragePct,
      avgSetByCoveragePct,
      avgTouchpointsCoveragePct,
    },
  };
};
