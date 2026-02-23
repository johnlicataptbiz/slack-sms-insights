import type { Logger } from '@slack/bolt';
import { getBookedCallAttributionSources, getBookedCallsSummary } from './booked-calls.js';
import { upsertWeeklySummaryItem } from './monday-client.js';
import {
  getLatestMondaySyncStatus,
  getMondayWeeklyReport,
  listMondayCallSnapshotsInRange,
  upsertMondayWeeklyReport,
} from './monday-store.js';
import { mondayConfig } from './monday-sync.js';
import { getSalesMetricsSummary } from './sales-metrics.js';
import { buildCanonicalSalesMetricsSlice } from './sales-metrics-contract.js';
import { attributeSlackBookedCallsToSequences } from './sequence-booked-attribution.js';
import { DEFAULT_BUSINESS_TIMEZONE, dayKeyInTimeZone, resolveBusinessDayRange, resolveTimeZone } from './time-range.js';

type RiskSeverity = 'high' | 'med' | 'low';
type SourceStatus = 'ready' | 'stale' | 'missing' | 'disabled';

export type WeeklyManagerSummary = {
  window: {
    weekStart: string;
    weekEnd: string;
    timeZone: string;
  };
  sources: {
    monday: {
      boardId: string | null;
      status: SourceStatus;
      enabled: boolean;
      lastSyncAt: string | null;
      staleThresholdHours: number;
    };
    generatedAt: string;
  };
  teamTotals: {
    messagesSent: number;
    peopleContacted: number;
    repliesReceived: number;
    replyRatePct: number;
    canonicalBookedCalls: number;
    optOuts: number;
  };
  setters: {
    jack: {
      outboundConversations: number;
      replyRatePct: number;
      diagnosticSmsBookingSignals: number;
      canonicalBookedCalls: number;
      optOuts: number;
    };
    brandon: {
      outboundConversations: number;
      replyRatePct: number;
      diagnosticSmsBookingSignals: number;
      canonicalBookedCalls: number;
      optOuts: number;
    };
  };
  mondayPipeline: {
    totalCalls: number;
    booked: number;
    noShow: number;
    cancelled: number;
    stageBreakdown: Array<{ stage: string; count: number }>;
  };
  topWins: Array<{
    sequence: string;
    canonicalBookedCalls: number;
    messagesSent: number;
    replyRatePct: number;
  }>;
  atRiskFlags: Array<{
    severity: RiskSeverity;
    title: string;
    detail: string;
  }>;
  actionsNextWeek: string[];
};

const shiftIsoDay = (day: string, deltaDays: number): string => {
  const base = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(base.getTime())) return day;
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
};

const weekdayIndex = (timeZone: string): number => {
  const short = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(new Date());
  const map: Record<string, number> = {
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
    Sun: 7,
  };
  return map[short] || 1;
};

const resolveWeekStart = (params: { weekStart?: string; timeZone: string }): string => {
  if (params.weekStart) return params.weekStart;
  const today = dayKeyInTimeZone(new Date(), params.timeZone);
  if (!today) return new Date().toISOString().slice(0, 10);
  const dayOfWeek = weekdayIndex(params.timeZone);
  const delta = dayOfWeek - 1; // Monday start
  return shiftIsoDay(today, -delta);
};

const toDisplaySetter = (name: string): 'jack' | 'brandon' | null => {
  const normalized = name.trim().toLowerCase();
  if (normalized.includes('jack')) return 'jack';
  if (normalized.includes('brandon')) return 'brandon';
  return null;
};

const makeActions = (riskFlags: WeeklyManagerSummary['atRiskFlags']): string[] => {
  if (!riskFlags.length) {
    return ['Hold current sequence volume plan and keep weekly QA checks on opt-outs and booking quality.'];
  }

  const actions = new Set<string>();
  for (const risk of riskFlags) {
    if (risk.title.includes('opt-out')) {
      actions.add('Reduce send volume on high-risk sequences and tighten opener + CTA copy before scaling.');
    } else if (risk.title.includes('no-show')) {
      actions.add('Add confirmation and reminder touchpoints for booked calls to reduce no-shows.');
    } else if (risk.title.includes('zero booked')) {
      actions.add('Run setter coaching on objection handling and closing scripts for high-volume/no-booked days.');
    }
  }
  if (!actions.size) {
    actions.add('Review at-risk segments in Sequence Performance and assign owner actions in monday.');
  }
  return [...actions].slice(0, 3);
};

export const getWeeklyManagerSummary = async (
  params: {
    weekStart?: string;
    timeZone?: string;
  } = {},
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<WeeklyManagerSummary> => {
  const timeZone = resolveTimeZone(params.timeZone || DEFAULT_BUSINESS_TIMEZONE);
  const weekStart = resolveWeekStart({ weekStart: params.weekStart, timeZone });
  const weekEnd = shiftIsoDay(weekStart, 6);
  const from = resolveBusinessDayRange(weekStart, timeZone).from;
  const to = resolveBusinessDayRange(weekEnd, timeZone).to;

  const [summary, bookedCalls, bookedAttributionSources, mondayRows, mondaySyncState] = await Promise.all([
    getSalesMetricsSummary({ from, to, timeZone }, logger),
    getBookedCallsSummary({ from, to, channelId: process.env.BOOKED_CALLS_CHANNEL_ID, timeZone }, logger),
    getBookedCallAttributionSources({ from, to, channelId: process.env.BOOKED_CALLS_CHANNEL_ID }),
    listMondayCallSnapshotsInRange({ boardId: mondayConfig.acqBoardId, from, to }, logger),
    getLatestMondaySyncStatus(mondayConfig.acqBoardId, logger),
  ]);

  const canonical = buildCanonicalSalesMetricsSlice(summary, bookedCalls);
  const sequenceAttribution = attributeSlackBookedCallsToSequences(canonical.topSequences, bookedAttributionSources);

  const topWins = canonical.topSequences
    .map((row) => {
      const booked = sequenceAttribution.byLabel.get(row.label);
      return {
        sequence: row.label,
        canonicalBookedCalls: booked?.booked ?? 0,
        messagesSent: row.messagesSent,
        replyRatePct: row.replyRatePct,
        optOutRatePct: row.messagesSent > 0 ? (row.optOuts / row.messagesSent) * 100 : 0,
      };
    })
    .sort((a, b) => b.canonicalBookedCalls - a.canonicalBookedCalls || b.messagesSent - a.messagesSent)
    .slice(0, 5);

  const setters = {
    jack: {
      outboundConversations: 0,
      replyRatePct: 0,
      diagnosticSmsBookingSignals: 0,
      canonicalBookedCalls: canonical.bookedCalls.jack,
      optOuts: 0,
    },
    brandon: {
      outboundConversations: 0,
      replyRatePct: 0,
      diagnosticSmsBookingSignals: 0,
      canonicalBookedCalls: canonical.bookedCalls.brandon,
      optOuts: 0,
    },
  };

  for (const row of canonical.repLeaderboard) {
    const who = toDisplaySetter(row.repName);
    if (!who) continue;
    setters[who] = {
      outboundConversations: row.outboundConversations,
      replyRatePct: row.replyRatePct ?? 0,
      diagnosticSmsBookingSignals: row.bookingSignalsSms,
      canonicalBookedCalls: who === 'jack' ? canonical.bookedCalls.jack : canonical.bookedCalls.brandon,
      optOuts: row.optOuts,
    };
  }

  const stageMap = new Map<string, number>();
  let mondayBooked = 0;
  let mondayNoShow = 0;
  let mondayCancelled = 0;
  for (const row of mondayRows) {
    const stage = (row.stage || 'Unknown').trim() || 'Unknown';
    stageMap.set(stage, (stageMap.get(stage) || 0) + 1);
    if (row.disposition === 'booked' || row.is_booked) mondayBooked += 1;
    else if (row.disposition === 'no_show') mondayNoShow += 1;
    else if (row.disposition === 'cancelled') mondayCancelled += 1;
  }

  const stageBreakdown = [...stageMap.entries()]
    .map(([stage, count]) => ({ stage, count }))
    .sort((a, b) => b.count - a.count || a.stage.localeCompare(b.stage))
    .slice(0, 10);

  const staleThresholdHours = 24;
  const lastSyncAt = mondaySyncState?.last_sync_at || null;
  const lastSyncMs = lastSyncAt ? new Date(lastSyncAt).getTime() : Number.NaN;
  const stale = Number.isFinite(lastSyncMs) ? Date.now() - lastSyncMs > staleThresholdHours * 60 * 60 * 1000 : true;
  const mondayStatus: SourceStatus = !mondayConfig.syncEnabled
    ? 'disabled'
    : mondaySyncState?.status === 'success'
      ? stale
        ? 'stale'
        : 'ready'
      : mondaySyncState
        ? 'stale'
        : 'missing';

  const riskFlags: WeeklyManagerSummary['atRiskFlags'] = [];
  const highOptOut = topWins.filter((row) => row.messagesSent >= 20 && row.optOutRatePct >= 3).slice(0, 2);
  for (const row of highOptOut) {
    riskFlags.push({
      severity: row.optOutRatePct >= 6 ? 'high' : 'med',
      title: 'Sequence opt-out risk',
      detail: `${row.sequence} is at ${(row.optOutRatePct || 0).toFixed(1)}% opt-out rate on ${row.messagesSent} sends.`,
    });
  }
  if (setters.jack.outboundConversations >= 40 && setters.jack.canonicalBookedCalls === 0) {
    riskFlags.push({
      severity: 'high',
      title: 'Jack high volume / zero booked',
      detail: `Jack had ${setters.jack.outboundConversations} outbound conversations with 0 canonical booked calls.`,
    });
  }
  if (setters.brandon.outboundConversations >= 40 && setters.brandon.canonicalBookedCalls === 0) {
    riskFlags.push({
      severity: 'high',
      title: 'Brandon high volume / zero booked',
      detail: `Brandon had ${setters.brandon.outboundConversations} outbound conversations with 0 canonical booked calls.`,
    });
  }
  const mondayNoShowRate = mondayRows.length > 0 ? mondayNoShow / mondayRows.length : 0;
  if (mondayNoShowRate >= 0.2) {
    riskFlags.push({
      severity: mondayNoShowRate >= 0.3 ? 'high' : 'med',
      title: 'Monday no-show risk',
      detail: `No-show rate is ${(mondayNoShowRate * 100).toFixed(1)}% on monday outcomes this week.`,
    });
  }

  return {
    window: { weekStart, weekEnd, timeZone },
    sources: {
      monday: {
        boardId: mondayConfig.acqBoardId || null,
        status: mondayStatus,
        enabled: mondayConfig.syncEnabled,
        lastSyncAt,
        staleThresholdHours,
      },
      generatedAt: new Date().toISOString(),
    },
    teamTotals: {
      messagesSent: canonical.totals.messagesSent,
      peopleContacted: canonical.totals.peopleContacted,
      repliesReceived: canonical.totals.repliesReceived,
      replyRatePct: canonical.totals.replyRatePct,
      canonicalBookedCalls: canonical.bookedCalls.booked,
      optOuts: canonical.totals.optOuts,
    },
    setters,
    mondayPipeline: {
      totalCalls: mondayRows.length,
      booked: mondayBooked,
      noShow: mondayNoShow,
      cancelled: mondayCancelled,
      stageBreakdown,
    },
    topWins: topWins.map((row) => ({
      sequence: row.sequence,
      canonicalBookedCalls: row.canonicalBookedCalls,
      messagesSent: row.messagesSent,
      replyRatePct: row.replyRatePct,
    })),
    atRiskFlags: riskFlags.slice(0, 6),
    actionsNextWeek: makeActions(riskFlags),
  };
};

const buildWeeklySummaryMarkdown = (summary: WeeklyManagerSummary): string => {
  const lines = [
    `# PTBizSMS Weekly Manager Summary (${summary.window.weekStart} to ${summary.window.weekEnd})`,
    '',
    `Time zone: ${summary.window.timeZone}`,
    `Generated: ${summary.sources.generatedAt}`,
    `PTBizSMS: ${summary.teamTotals.messagesSent} sent, ${summary.teamTotals.repliesReceived} replies (${summary.teamTotals.replyRatePct.toFixed(1)}%), ${summary.teamTotals.canonicalBookedCalls} calls booked, ${summary.teamTotals.optOuts} opt-outs.`,
    '',
    `Setter Jack: ${summary.setters.jack.canonicalBookedCalls} calls booked, ${summary.setters.jack.outboundConversations} outbound, ${summary.setters.jack.optOuts} opt-outs.`,
    `Setter Brandon: ${summary.setters.brandon.canonicalBookedCalls} calls booked, ${summary.setters.brandon.outboundConversations} outbound, ${summary.setters.brandon.optOuts} opt-outs.`,
    '',
    `Monday pipeline: ${summary.mondayPipeline.totalCalls} calls (${summary.mondayPipeline.booked} booked, ${summary.mondayPipeline.noShow} no-show, ${summary.mondayPipeline.cancelled} cancelled).`,
    '',
    'Top wins:',
    ...summary.topWins
      .slice(0, 3)
      .map(
        (row, index) =>
          `${index + 1}. ${row.sequence} — ${row.canonicalBookedCalls} booked, ${row.messagesSent} sent, ${row.replyRatePct.toFixed(1)}% reply rate`,
      ),
    '',
    'At-risk flags:',
    ...(summary.atRiskFlags.length
      ? summary.atRiskFlags.map((flag, index) => `${index + 1}. [${flag.severity}] ${flag.title} — ${flag.detail}`)
      : ['1. None this week.']),
    '',
    'Actions for next week:',
    ...summary.actionsNextWeek.map((action, index) => `${index + 1}. ${action}`),
    '',
    'Dashboard link: https://ptbizsms.com/v2/insights?ui=v2',
  ];
  return lines.join('\n');
};

export const syncWeeklySummaryToMonday = async (
  params: {
    weekStart?: string;
    timeZone?: string;
  } = {},
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<{ status: 'skipped' | 'synced'; weekStart: string; itemId: string | null }> => {
  if (!mondayConfig.outboundEnabled || !mondayConfig.writebackEnabled) {
    const summary = await getWeeklyManagerSummary(params, logger);
    return { status: 'skipped', weekStart: summary.window.weekStart, itemId: null };
  }

  const summary = await getWeeklyManagerSummary(params, logger);
  const targetBoardId = mondayConfig.personalBoardId || mondayConfig.myCallsBoardId || mondayConfig.acqBoardId;
  const existing = await getMondayWeeklyReport(summary.window.weekStart, logger);
  const markdown = buildWeeklySummaryMarkdown(summary);
  const title = `PTBizSMS Weekly Summary - ${summary.window.weekStart}`;
  const existingItemId = existing?.source_board_id === targetBoardId ? existing?.monday_item_id || null : null;

  const result = await upsertWeeklySummaryItem(
    targetBoardId,
    summary.window.weekStart,
    {
      title,
      summaryMarkdown: markdown,
      existingItemId,
    },
    logger,
  );

  await upsertMondayWeeklyReport(
    {
      weekStart: summary.window.weekStart,
      sourceBoardId: targetBoardId,
      summaryJson: summary,
      mondayItemId: result.itemId,
      syncedAt: new Date(),
    },
    logger,
  );

  return {
    status: 'synced',
    weekStart: summary.window.weekStart,
    itemId: result.itemId,
  };
};
