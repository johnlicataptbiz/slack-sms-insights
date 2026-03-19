import type {
  DailyReportAlertV2,
  DailyReportComparisonV2,
  DailyReportKpisV2,
  DailyReportLeadQualityV2,
  DailyReportMondayHealthRowV2,
  DailyReportRangeV2,
  DailyReportRepRowV2,
  DailyReportSequenceRowV2,
  DailyReportV2,
} from '../api/v2-contract.js';
import { getPrismaClient } from './prisma.js';

const getPrisma = () => getPrismaClient();

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Parse a YYYY-MM-DD string into a Date at midnight UTC. */
const parseDateUTC = (dateStr: string): Date => {
  const d = new Date(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(d.getTime())) throw new Error(`Invalid date: ${dateStr}`);
  return d;
};

/** Add N days to a Date (UTC). */
const addDays = (date: Date, days: number): Date => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
};

/** Format a Date as YYYY-MM-DD. */
const formatDate = (date: Date): string => date.toISOString().slice(0, 10);

/** Safely convert a Prisma Decimal/number/null to a JS number. */
const toNum = (val: unknown): number => {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  return Number(val) || 0;
};

/** Safely convert to number | null. */
const toNumOrNull = (val: unknown): number | null => {
  if (val == null) return null;
  const n = Number(val);
  return Number.isNaN(n) ? null : n;
};

/** Compute percentage change: ((current - previous) / previous) * 100. Returns null if previous is 0. */
const pctChange = (current: number | null, previous: number | null): number | null => {
  if (current == null || previous == null) return null;
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
};

/** Rep display name from rep_id. */
const repDisplayName = (repId: string): string => {
  if (!repId) return 'Unassigned';
  const normalized = repId.trim();
  const jackId = (process.env.ALOWARE_WATCHER_JACK_USER_ID || '').trim();
  const brandonId = (process.env.ALOWARE_WATCHER_BRANDON_USER_ID || '').trim();
  if (jackId && normalized === jackId) return 'Jack';
  if (brandonId && normalized === brandonId) return 'Brandon';
  if (/jack/i.test(normalized)) return 'Jack';
  if (/brandon/i.test(normalized)) return 'Brandon';
  return normalized;
};

// ─── Core Aggregation ───────────────────────────────────────────────────────────

async function aggregateKpis(targetDate: Date): Promise<DailyReportKpisV2> {
  const prisma = getPrisma();

  const [smsAgg, bookingAgg, leadAgg] = await Promise.all([
    prisma.fact_sms_daily.aggregate({
      where: { day: targetDate },
      _sum: {
        messages_sent: true,
        unique_contacted: true,
        replies_received: true,
        opt_outs: true,
        booking_signals_sms: true,
      },
    }),
    prisma.fact_booking_daily.aggregate({
      where: { day: targetDate },
      _sum: {
        booked_total: true,
      },
    }),
    prisma.fact_lead_quality_daily.aggregate({
      where: { day: targetDate },
      _sum: { leads_count: true },
      _avg: { avg_lead_score: true },
    }),
  ]);

  const messagesSent = toNum(smsAgg._sum.messages_sent);
  const uniqueContacted = toNum(smsAgg._sum.unique_contacted);
  const repliesReceived = toNum(smsAgg._sum.replies_received);
  const optOuts = toNum(smsAgg._sum.opt_outs);
  const bookingSignalsSms = toNum(smsAgg._sum.booking_signals_sms);
  const bookedTotal = toNum(bookingAgg._sum.booked_total);
  const leadsCount = toNum(leadAgg._sum.leads_count);
  const avgLeadScore = toNumOrNull(leadAgg._avg.avg_lead_score);

  return {
    messagesSent,
    uniqueContacted,
    repliesReceived,
    replyRatePct: uniqueContacted > 0 ? (repliesReceived / uniqueContacted) * 100 : 0,
    optOuts,
    optOutRatePct: messagesSent > 0 ? (optOuts / messagesSent) * 100 : 0,
    bookedTotal,
    bookingRatePct: uniqueContacted > 0 ? (bookedTotal / uniqueContacted) * 100 : 0,
    bookingSignalsSms,
    leadsCount,
    avgLeadScore,
  };
}

async function getSequenceBreakdown(targetDate: Date): Promise<DailyReportSequenceRowV2[]> {
  const prisma = getPrisma();

  // SMS groupBy
  const smsGroups = await prisma.fact_sms_daily.groupBy({
    by: ['sequence_id'],
    where: { day: targetDate },
    _sum: {
      messages_sent: true,
      replies_received: true,
      opt_outs: true,
      unique_contacted: true,
    },
  });

  // Booking groupBy
  const bookingGroups = await prisma.fact_booking_daily.groupBy({
    by: ['sequence_id'],
    where: { day: targetDate },
    _sum: {
      booked_total: true,
    },
  });

  // Build booking lookup
  const bookingMap = new Map<string, number>();
  for (const bg of bookingGroups) {
    bookingMap.set(bg.sequence_id, toNum(bg._sum.booked_total));
  }

  // Fetch sequence names
  const sequenceIds = [
    ...new Set([...smsGroups.map((g) => g.sequence_id), ...bookingGroups.map((g) => g.sequence_id)]),
  ];
  const sequences =
    sequenceIds.length > 0
      ? await prisma.sequence_registry.findMany({
          where: { id: { in: sequenceIds } },
          select: { id: true, label: true },
        })
      : [];
  const nameMap = new Map(sequences.map((s) => [s.id, s.label]));

  return smsGroups
    .map((sg) => {
      const messagesSent = toNum(sg._sum.messages_sent);
      const repliesReceived = toNum(sg._sum.replies_received);
      const uniqueContacted = toNum(sg._sum.unique_contacted);
      const bookedTotal = bookingMap.get(sg.sequence_id) ?? 0;
      return {
        sequenceId: sg.sequence_id,
        sequenceName: nameMap.get(sg.sequence_id) ?? sg.sequence_id,
        messagesSent,
        repliesReceived,
        replyRatePct: uniqueContacted > 0 ? (repliesReceived / uniqueContacted) * 100 : 0,
        bookedTotal,
        bookingRatePct: uniqueContacted > 0 ? (bookedTotal / uniqueContacted) * 100 : 0,
        optOuts: toNum(sg._sum.opt_outs),
      };
    })
    .sort((a, b) => b.messagesSent - a.messagesSent);
}

async function getRepBreakdown(targetDate: Date): Promise<DailyReportRepRowV2[]> {
  const prisma = getPrisma();

  const smsGroups = await prisma.fact_sms_daily.groupBy({
    by: ['rep_id'],
    where: { day: targetDate },
    _sum: {
      messages_sent: true,
      replies_received: true,
      unique_contacted: true,
    },
  });

  const bookingGroups = await prisma.fact_booking_daily.groupBy({
    by: ['rep_id'],
    where: { day: targetDate },
    _sum: {
      booked_total: true,
    },
  });

  const bookingMap = new Map<string, number>();
  for (const bg of bookingGroups) {
    bookingMap.set(bg.rep_id, toNum(bg._sum.booked_total));
  }

  return smsGroups
    .map((sg) => {
      const messagesSent = toNum(sg._sum.messages_sent);
      const repliesReceived = toNum(sg._sum.replies_received);
      const uniqueContacted = toNum(sg._sum.unique_contacted);
      return {
        repId: sg.rep_id,
        repName: repDisplayName(sg.rep_id),
        messagesSent,
        repliesReceived,
        replyRatePct: uniqueContacted > 0 ? (repliesReceived / uniqueContacted) * 100 : 0,
        bookedTotal: bookingMap.get(sg.rep_id) ?? 0,
      };
    })
    .sort((a, b) => b.messagesSent - a.messagesSent);
}

async function getLeadQuality(targetDate: Date): Promise<DailyReportLeadQualityV2> {
  const prisma = getPrisma();

  const agg = await prisma.fact_lead_quality_daily.aggregate({
    where: { day: targetDate },
    _sum: {
      leads_count: true,
      progress_step_0_count: true,
      progress_step_1_count: true,
      progress_step_2_count: true,
      progress_step_3_count: true,
      progress_step_4_count: true,
      revenue_mix_mostly_cash: true,
      revenue_mix_mostly_ins: true,
      revenue_mix_balanced: true,
      revenue_mix_unknown: true,
      coaching_interest_high: true,
      coaching_interest_medium: true,
      coaching_interest_low: true,
      coaching_interest_unknown: true,
    },
    _avg: {
      avg_lead_score: true,
    },
  });

  return {
    total: toNum(agg._sum.leads_count),
    progressDistribution: [
      toNum(agg._sum.progress_step_0_count),
      toNum(agg._sum.progress_step_1_count),
      toNum(agg._sum.progress_step_2_count),
      toNum(agg._sum.progress_step_3_count),
      toNum(agg._sum.progress_step_4_count),
    ],
    revenueMix: {
      cash: toNum(agg._sum.revenue_mix_mostly_cash),
      insurance: toNum(agg._sum.revenue_mix_mostly_ins),
      balanced: toNum(agg._sum.revenue_mix_balanced),
      unknown: toNum(agg._sum.revenue_mix_unknown),
    },
    coachingInterest: {
      high: toNum(agg._sum.coaching_interest_high),
      medium: toNum(agg._sum.coaching_interest_medium),
      low: toNum(agg._sum.coaching_interest_low),
      unknown: toNum(agg._sum.coaching_interest_unknown),
    },
    avgLeadScore: toNumOrNull(agg._avg.avg_lead_score),
  };
}

async function getMondayHealth(targetDate: Date): Promise<DailyReportMondayHealthRowV2[]> {
  const prisma = getPrisma();

  const rows = await prisma.fact_monday_health_daily.findMany({
    where: { day: targetDate },
    orderBy: { board_class: 'asc' },
  });

  return rows.map((r) => ({
    boardId: r.board_id,
    boardClass: r.board_class,
    syncStatus: r.sync_status,
    isStale: r.is_stale,
    sourceCoveragePct: r.source_coverage_pct,
    campaignCoveragePct: r.campaign_coverage_pct,
  }));
}

async function getAlerts(targetDate: Date): Promise<DailyReportAlertV2[]> {
  const prisma = getPrisma();
  const nextDay = addDays(targetDate, 1);

  const rows = await prisma.trend_alerts.findMany({
    where: {
      created_at: {
        gte: targetDate,
        lt: nextDay,
      },
    },
    orderBy: { created_at: 'desc' },
    take: 50,
  });

  return rows.map((r) => ({
    id: r.id,
    type: r.alert_type,
    severity: r.severity,
    message: r.message,
    createdAt: r.created_at?.toISOString() ?? null,
  }));
}

// ─── Comparison Logic ───────────────────────────────────────────────────────────

function resolveComparisonDate(targetDate: Date, period: 'prev_day' | 'prev_week' | 'prev_month'): Date {
  switch (period) {
    case 'prev_day':
      return addDays(targetDate, -1);
    case 'prev_week':
      return addDays(targetDate, -7);
    case 'prev_month': {
      const d = new Date(targetDate);
      d.setUTCMonth(d.getUTCMonth() - 1);
      return d;
    }
  }
}

function buildComparison(
  currentKpis: DailyReportKpisV2,
  previousKpis: DailyReportKpisV2,
  period: 'prev_day' | 'prev_week' | 'prev_month',
): DailyReportComparisonV2 {
  const keys = Object.keys(currentKpis) as Array<keyof DailyReportKpisV2>;
  const deltas = {} as Record<keyof DailyReportKpisV2, number | null>;
  for (const key of keys) {
    deltas[key] = pctChange(currentKpis[key], previousKpis[key]);
  }
  return { period, kpis: previousKpis, deltas };
}

// ─── Public API ─────────────────────────────────────────────────────────────────

export type ComparePeriod = 'prev_day' | 'prev_week' | 'prev_month';

export async function computeDailyReport(
  dateStr: string,
  options?: { compare?: ComparePeriod },
): Promise<DailyReportV2> {
  const targetDate = parseDateUTC(dateStr);

  const [kpis, sequences, reps, leadQuality, mondayHealth, alerts] = await Promise.all([
    aggregateKpis(targetDate),
    getSequenceBreakdown(targetDate),
    getRepBreakdown(targetDate),
    getLeadQuality(targetDate),
    getMondayHealth(targetDate),
    getAlerts(targetDate),
  ]);

  let comparison: DailyReportComparisonV2 | undefined;
  if (options?.compare) {
    const compDate = resolveComparisonDate(targetDate, options.compare);
    const compKpis = await aggregateKpis(compDate);
    comparison = buildComparison(kpis, compKpis, options.compare);
  }

  return {
    date: dateStr,
    generatedAt: new Date().toISOString(),
    kpis,
    comparison,
    sequences,
    reps,
    leadQuality,
    mondayHealth,
    alerts,
  };
}

export async function computeDailyReportRange(fromStr: string, toStr: string): Promise<DailyReportRangeV2> {
  const fromDate = parseDateUTC(fromStr);
  const toDate = parseDateUTC(toStr);

  if (fromDate > toDate) {
    throw new Error(`'from' date must be before or equal to 'to' date`);
  }

  // Cap at 31 days to prevent abuse
  const diffDays = Math.round((toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays > 31) {
    throw new Error('Date range cannot exceed 31 days');
  }

  const days: DailyReportV2[] = [];
  let current = new Date(fromDate);
  while (current <= toDate) {
    const report = await computeDailyReport(formatDate(current));
    days.push(report);
    current = addDays(current, 1);
  }

  return {
    from: fromStr,
    to: toStr,
    days,
  };
}
