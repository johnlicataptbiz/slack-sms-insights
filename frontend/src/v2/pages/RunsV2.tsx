import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useV2Channels, useV2Run, useV2Runs, useV2SalesMetrics } from '../../api/v2Queries';
import type { RunV2 } from '../../api/v2-types';
import { parseReport, type RepMetrics, type SequenceRow } from '../../utils/reportParser';
import { v2Copy } from '../copy';
import { V2MetricCard, V2PageHeader, V2Panel, V2State, V2StatBar } from '../components/V2Primitives';

const savedViewsStorageKey = 'ptbizsms-v2-runs-saved-views';
const BUSINESS_TZ = 'America/Chicago';
const DAILY_SNAPSHOT_TITLE_PATTERN = /PT BIZ - DAILY SMS SNAPSHOT/i;
const DAILY_SETTER_SUMMARY_PATTERN = /Daily Setter Snapshot/i;
const REPORT_DATE_LINE_PATTERN = /^Date:\s*(.+)$/im;
const SUMMARY_DATE_PATTERN = /^Daily Setter Snapshot\s*\|\s*([^|]+?)(?:\s*\||$)/im;
const TIME_RANGE_LINE_PATTERN = /^Time Range:\s*(.+)$/im;
const OUTBOUND_CONVERSATIONS_PATTERN = /- Outbound Conversations:\s*([0-9,]+)/gi;
const MESSAGES_SENT_PATTERN = /Messages sent:\s*([0-9,]+)/i;
const REPLIES_RECEIVED_PATTERN = /Replies received:\s*([0-9,]+)/i;
const REPLY_RATE_PATTERN = /Replies received:\s*[0-9,]+\s*\(([0-9.]+)%\)/i;
const CALLS_BOOKED_PATTERN = /Calls booked(?:\s*\(Slack\))?:\s*([0-9,]+)/i;
const BOOKINGS_ALT_PATTERN = /- Book(?:ings?|ed):\s*([0-9,]+)/i;
const OPT_OUTS_PATTERN = /Opt-outs:\s*([0-9,]+)/i;
const OUTBOUND_FROM_SUMMARY_PATTERN = /Outbound conversations:\s*([0-9,]+)/i;
const SUMMARY_NOISE_PATTERNS = [/^PT BIZ - DAILY SMS SNAPSHOT/i, /^Date:/i, /^Time Range:/i, /^Split By Line/i];

const allowedRanges = [1, 7, 30, 90] as const;
type AllowedRange = (typeof allowedRanges)[number];

type SavedRunsView = {
  id: string;
  name: string;
  range: AllowedRange;
  channelId: string | null;
  runId: string | null;
  createdAt: string;
};

type RunSequenceInsight = {
  label: string;
  sent: number;
  replies: number;
  replyRatePct: number;
  booked: number;
  optOuts: number;
  optOutRatePct: number;
};

type RunRepInsight = {
  name: string;
  outboundConversations: number;
  booked: number;
  optOuts: number;
  topSequenceLabel: string | null;
};

export type RunViewModel = {
  title: string;
  subtitle: string;
  summaryPreview: string | null;
  summaryLines: string[];
  messagesSent: number | null;
  repliesReceived: number | null;
  replyRatePct: number | null;
  booked: number | null;
  optOuts: number | null;
  outboundConversations: number | null;
  topSequences: RunSequenceInsight[];
  repRows: RunRepInsight[];
};

export const resolveSelectedRunViewModel = (
  selected: RunV2 | null,
  cachedById?: Map<string, RunViewModel>,
): RunViewModel | null => {
  // When viewing details, always derive from the full selected payload
  // to ensure we have access to the complete report data
  if (!selected) return null;
  
  // If we have a cached view model and the selected run doesn't have fullReport,
  // use the cached view model to maintain consistency between preview and detail
  if (cachedById && !selected.fullReport && cachedById.has(selected.id)) {
    return cachedById.get(selected.id) || buildRunViewModel(selected);
  }
  
  // Otherwise build a fresh view model from the selected run
  return buildRunViewModel(selected);
};

const parseRange = (value: string | null): AllowedRange => {
  const parsed = Number(value);
  if (allowedRanges.includes(parsed as AllowedRange)) return parsed as AllowedRange;
  return 7;
};

const readSavedViews = (): SavedRunsView[] => {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(savedViewsStorageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((view) => typeof view === 'object' && view !== null) as SavedRunsView[];
  } catch {
    return [];
  }
};

const statusTone = (status: RunV2['status']) => {
  if (status === 'success') return 'positive';
  if (status === 'error') return 'critical';
  return 'accent';
};

const parseNumber = (rawValue: string | undefined): number | null => {
  if (!rawValue) return null;
  const normalized = rawValue.replace(/,/g, '').trim();
  if (!normalized) return null;
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const matchNumber = (source: string | null, pattern: RegExp): number | null => {
  if (!source) return null;
  const match = source.match(pattern);
  return parseNumber(match?.[1]);
};

const sumMatches = (source: string | null, pattern: RegExp): number | null => {
  if (!source) return null;
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);
  let found = false;
  let total = 0;
  for (const match of source.matchAll(globalPattern)) {
    const value = parseNumber(match[1]);
    if (value === null) continue;
    found = true;
    total += value;
  }
  return found ? total : null;
};

const formatDateTime = (value: string) => new Date(value).toLocaleString();

const formatReportDay = (value: string): string => {
  const normalizedValue = /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T12:00:00.000Z` : value;
  const date = new Date(normalizedValue);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

const extractReportDayLabel = (run: RunV2): string | null => {
  if (run.reportDate) return run.reportDate;

  const fromReport = run.fullReport?.match(REPORT_DATE_LINE_PATTERN)?.[1]?.trim() || null;
  if (fromReport) return fromReport;

  const fromSummary = run.summaryText?.match(SUMMARY_DATE_PATTERN)?.[1]?.trim() || null;
  if (fromSummary) return fromSummary;

  return null;
};

const runDateLabel = (run: RunV2): string => {
  const reportDay = extractReportDayLabel(run);
  if (reportDay) return formatReportDay(reportDay);
  return formatDateTime(run.timestamp);
};

const toIsoDay = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const getTodayCT = (): { date: string; hour: number } => {
  const now = new Date();
  // Use formatToParts for reliable cross-browser parsing — toLocaleString string-splitting
  // is fragile and can return "24" for midnight with hour12:false in some environments.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  const year = get('year');
  const month = get('month');
  const day = get('day');
  let hour = Number.parseInt(get('hour'), 10);
  if (hour === 24) hour = 0; // Some implementations return 24 for midnight instead of 0
  return {
    date: `${year}-${month}-${day}`,
    hour,
  };
};

const extractDateStampParts = (run: RunV2): { month: string; day: string } => {
  const reportDay = extractReportDayLabel(run);
  if (reportDay) {
    // Mirror formatReportDay: ISO dates → UTC noon anchor; other strings → parse as-is
    const normalizedValue = /^\d{4}-\d{2}-\d{2}$/.test(reportDay.trim())
      ? `${reportDay.trim()}T12:00:00.000Z`
      : reportDay;
    const date = new Date(normalizedValue);
    if (!Number.isNaN(date.getTime())) {
      return {
        month: date.toLocaleDateString('en-US', { month: 'short' }),
        day: String(date.getDate()),
      };
    }
    // Last resort: regex-extract from strings like "Feb 25, 2026" or "February 25, 2026"
    const match = reportDay.match(/([A-Za-z]+)\s+(\d{1,2})/);
    if (match) {
      return { month: match[1].slice(0, 3), day: match[2] };
    }
  }
  // Fall back to the generation timestamp
  const date = new Date(run.timestamp);
  return {
    month: date.toLocaleDateString('en-US', { month: 'short' }),
    day: String(date.getDate()),
  };
};

const formatCount = (value: number | null): string => {
  if (value === null) return '—';
  return Math.round(value).toLocaleString();
};

const formatPct = (value: number | null): string => {
  if (value === null) return '—';
  return `${value.toFixed(1)}%`;
};

const formatDuration = (value: number | null): string => {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value >= 1000) return `${(value / 1000).toFixed(2)}s`;
  return `${Math.round(value)}ms`;
};

const normalizeSummaryLines = (summaryText: string | null): string[] => {
  if (!summaryText) return [];
  return summaryText
    .split('\n')
    .map((rawLine) => {
      const withoutMarkdown = rawLine.trim().replace(/^\*+/, '').replace(/\*+$/, '');
      return withoutMarkdown.replace(/^-+\s*/, '').trim();
    })
    .filter((line) => line.length > 0);
};

const toTopSequenceLabel = (rep: RepMetrics): string | null => {
  if (!rep.sequences.length) return null;
  const sorted = [...rep.sequences].sort((a, b) => b.messagesSent - a.messagesSent);
  return sorted[0]?.label || null;
};

const toSequenceInsight = (row: SequenceRow): RunSequenceInsight => ({
  label: row.label,
  sent: row.messagesSent,
  replies: row.repliesReceived,
  replyRatePct: row.replyRate,
  booked: row.booked,
  optOuts: row.optOuts,
  optOutRatePct: row.messagesSent > 0 ? (row.optOuts / row.messagesSent) * 100 : 0,
});

const isSummaryNoiseLine = (line: string): boolean => {
  return SUMMARY_NOISE_PATTERNS.some((pattern) => pattern.test(line));
};

const buildRunViewModel = (run: RunV2): RunViewModel => {
  const fullReport = run.fullReport || '';
  const summaryLines = normalizeSummaryLines(run.summaryText);
  const isDailySnapshot =
    DAILY_SNAPSHOT_TITLE_PATTERN.test(fullReport) || summaryLines.some((line) => DAILY_SETTER_SUMMARY_PATTERN.test(line));
  const parsed = run.status === 'success' && fullReport ? parseReport(fullReport) : null;
  const hasParsedBreakdown = Boolean(parsed && parsed.reps.length > 0);

  const timeRangeLabel = fullReport.match(TIME_RANGE_LINE_PATTERN)?.[1]?.trim() || null;

  const messagesSent = hasParsedBreakdown
    ? parsed?.totalMessagesSent ?? null
    : matchNumber(run.summaryText, MESSAGES_SENT_PATTERN);
  const repliesReceived = hasParsedBreakdown
    ? parsed?.totalRepliesReceived ?? null
    : matchNumber(run.summaryText, REPLIES_RECEIVED_PATTERN);
  const replyRatePct = hasParsedBreakdown ? parsed?.overallReplyRate ?? null : matchNumber(run.summaryText, REPLY_RATE_PATTERN);
  const booked = hasParsedBreakdown
    ? parsed?.totalBooked ?? null
    : matchNumber(run.summaryText, CALLS_BOOKED_PATTERN) ?? matchNumber(run.summaryText, BOOKINGS_ALT_PATTERN);
  const optOuts = hasParsedBreakdown ? parsed?.totalOptOuts ?? null : matchNumber(run.summaryText, OPT_OUTS_PATTERN);
  const outboundConversations = sumMatches(fullReport, OUTBOUND_CONVERSATIONS_PATTERN) ?? matchNumber(run.summaryText, OUTBOUND_FROM_SUMMARY_PATTERN);

  const titleBase =
    run.reportType === 'daily' && isDailySnapshot
      ? 'Daily Setter Snapshot'
      : run.reportType === 'daily'
        ? 'Daily Auto-Report'
        : run.reportType === 'manual'
          ? 'Manual Report'
          : 'Test Report';
  const title = run.status === 'error' ? `${titleBase} (Failed)` : titleBase;

  const modeLabel = run.reportType === 'daily' ? '6:00 AM auto-report' : run.reportType === 'manual' ? 'Manual report' : 'Test report';
  const subtitleParts = [timeRangeLabel, modeLabel].filter((part): part is string => Boolean(part));

  const metricPreview =
    messagesSent !== null || repliesReceived !== null || booked !== null || optOuts !== null
      ? `Sent ${formatCount(messagesSent)} | Replies ${formatCount(repliesReceived)} | Booked (report) ${formatCount(booked)} | Opt-outs ${formatCount(
          optOuts,
        )}`
      : null;
  const summaryPreview =
    metricPreview ||
    summaryLines.find((line) => !DAILY_SETTER_SUMMARY_PATTERN.test(line) && !isSummaryNoiseLine(line)) ||
    summaryLines.find((line) => !isSummaryNoiseLine(line)) ||
    summaryLines[0] ||
    null;
  const topSequences = hasParsedBreakdown ? (parsed?.allSequences || []).slice(0, 5).map(toSequenceInsight) : [];
  const repRows = hasParsedBreakdown
    ? (parsed?.reps || []).map((rep) => ({
        name: rep.name,
        outboundConversations: rep.outboundConversations,
        booked: rep.bookings,
        optOuts: rep.optOuts,
        topSequenceLabel: toTopSequenceLabel(rep),
      }))
    : [];

  return {
    title,
    subtitle: subtitleParts.join(' | '),
    summaryPreview,
    summaryLines,
    messagesSent,
    repliesReceived,
    replyRatePct,
    booked,
    optOuts,
    outboundConversations,
    topSequences,
    repRows,
  };
};

export default function RunsV2() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [savedViews, setSavedViews] = useState<SavedRunsView[]>(() => readSavedViews());
  const [newViewName, setNewViewName] = useState('');
  const [copied, setCopied] = useState<'current' | string | null>(null);
  const [showSavedViews, setShowSavedViews] = useState(false);
  const [staleBannerDismissed, setStaleBannerDismissed] = useState(false);

  const daysBack = parseRange(searchParams.get('range'));
  const channelId = searchParams.get('channel') || null;
  const selectedId = searchParams.get('run');
  const [isRunDetailFocused, setIsRunDetailFocused] = useState(() => Boolean(selectedId));

  const { data: runsData, isLoading, isError, error } = useV2Runs({
    daysBack,
    channelId,
    limit: 100,
    offset: 0,
    includeFullReport: false,
  });
  const { data: channelsData } = useV2Channels();
  const selectedRunQuery = useV2Run(selectedId);

  const channels = useMemo(() => {
    const rows = channelsData?.data.items || [];
    const map = new Map<string, { channelId: string; channelName: string | null; runCount: number }>();
    for (const row of rows) {
      const existing = map.get(row.channelId);
      if (!existing) {
        map.set(row.channelId, { ...row });
        continue;
      }
      map.set(row.channelId, {
        channelId: row.channelId,
        channelName: existing.channelName || row.channelName,
        runCount: existing.runCount + row.runCount,
      });
    }
    return [...map.values()].sort((a, b) => b.runCount - a.runCount);
  }, [channelsData?.data.items]);

  const channelNameById = useMemo(() => {
    const map = new Map<string, string>();
    channels.forEach((channel) => {
      map.set(channel.channelId, channel.channelName || channel.channelId);
    });
    return map;
  }, [channels]);

  const selectedSummary = useMemo(
    () => runsData?.data.items.find((item) => item.id === selectedId) || null,
    [runsData?.data.items, selectedId],
  );
  const selected = selectedRunQuery.data?.data || selectedSummary || null;
  const selectedReportDay = useMemo(() => {
    if (!selected) return null;
    return toIsoDay(extractReportDayLabel(selected));
  }, [selected]);

  const selectedBookedMetricsQuery = useV2SalesMetrics(
    selectedReportDay ? { day: selectedReportDay, tz: BUSINESS_TZ } : { range: 'today', tz: BUSINESS_TZ },
    { enabled: Boolean(selectedReportDay) },
  );

  const viewByRunId = useMemo(() => {
    const map = new Map<string, RunViewModel>();
    (runsData?.data.items || []).forEach((run) => {
      map.set(run.id, buildRunViewModel(run));
    });
    return map;
  }, [runsData?.data.items]);

  // Always derive selected detail view from the selected run payload.
  // The timeline list is fetched without fullReport, so reusing the list view model
  // here can hide parsed sequence/rep sections.
  const aggregateStats = useMemo(() => {
    const items = runsData?.data.items || [];
    const totalRuns = items.length;
    const allViews = items.map((r) => viewByRunId.get(r.id) || buildRunViewModel(r));
    const totalMessagesSent = allViews.reduce((sum, v) => sum + (v.messagesSent ?? 0), 0);
    const totalBooked = allViews.reduce((sum, v) => sum + (v.booked ?? 0), 0);
    const replyRates = allViews.map((v) => v.replyRatePct).filter((r): r is number => r !== null);
    const avgReplyRate = replyRates.length > 0 ? replyRates.reduce((a, b) => a + b, 0) / replyRates.length : null;
    return { totalRuns, totalMessagesSent, totalBooked, avgReplyRate };
  }, [runsData?.data.items, viewByRunId]);

  const isStale = useMemo(() => {
    const { date: todayCT, hour: hourCT } = getTodayCT();
    if (hourCT < 7) return false; // Before 7 AM CT — cron hasn't had time to fire yet
    const items = runsData?.data.items || [];
    const hasTodayDailyRun = items.some((run) => {
      if (run.reportType !== 'daily') return false;
      // Compare when the run was GENERATED (timestamp), not what day it covers (reportDate).
      // Daily reports always cover yesterday, so reportDate never equals today — using it
      // caused the banner to show permanently even when the cron had already run.
      const generatedDay = toIsoDay(run.timestamp);
      return generatedDay === todayCT;
    });
    return !hasTodayDailyRun;
  }, [runsData?.data.items]);

  const selectedView = resolveSelectedRunViewModel(selected, viewByRunId);
  const selectedSlackBookedTotal = selectedBookedMetricsQuery.data?.data.totals.canonicalBookedCalls ?? null;
  const selectedSlackBookedJack = selectedBookedMetricsQuery.data?.data.bookedCredit.jack ?? null;
  const selectedSlackBookedBrandon = selectedBookedMetricsQuery.data?.data.bookedCredit.brandon ?? null;
  const selectedSlackBookedSelf = selectedBookedMetricsQuery.data?.data.bookedCredit.selfBooked ?? null;
  const selectedSlackBookedSplit =
    selectedSlackBookedJack === null || selectedSlackBookedBrandon === null || selectedSlackBookedSelf === null
      ? '—'
      : `${selectedSlackBookedJack.toLocaleString()} / ${selectedSlackBookedBrandon.toLocaleString()} / ${selectedSlackBookedSelf.toLocaleString()}`;

  const channelLabel = (run: RunV2): string => {
    return run.channelName || channelNameById.get(run.channelId) || run.channelId;
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(savedViewsStorageKey, JSON.stringify(savedViews));
  }, [savedViews]);

  useEffect(() => {
    if (!selectedId) return;
    if (!runsData) return;
    const stillExists = runsData.data.items.some((item) => item.id === selectedId);
    if (!stillExists) {
      const next = new URLSearchParams(searchParams);
      next.delete('run');
      setSearchParams(next, { replace: true });
      setIsRunDetailFocused(false);
    }
  }, [runsData, searchParams, selectedId, setSearchParams]);

  const setParams = (updates: { range?: AllowedRange; channelId?: string | null; runId?: string | null }) => {
    const next = new URLSearchParams(searchParams);
    if (updates.range !== undefined) next.set('range', String(updates.range));
    if (updates.channelId !== undefined) {
      if (updates.channelId) next.set('channel', updates.channelId);
      else next.delete('channel');
    }
    if (updates.runId !== undefined) {
      if (updates.runId) next.set('run', updates.runId);
      else next.delete('run');
      setIsRunDetailFocused(Boolean(updates.runId));
    }
    setSearchParams(next, { replace: true });
  };

  const setSelected = (runId: string | null) => {
    setParams({ runId });
  };

  const shareableUrl = useMemo(() => {
    if (typeof window === 'undefined') return '/v2/runs?ui=v2';
    const url = new URL(`${window.location.origin}/v2/runs`);
    url.searchParams.set('ui', 'v2');
    url.searchParams.set('range', String(daysBack));
    if (channelId) url.searchParams.set('channel', channelId);
    if (selectedId) url.searchParams.set('run', selectedId);
    return url.toString();
  }, [channelId, daysBack, selectedId]);

  const copyShareLink = async (id: 'current' | string, link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(id);
      window.setTimeout(() => setCopied((value) => (value === id ? null : value)), 1300);
    } catch {
      setCopied(null);
    }
  };

  const saveCurrentView = () => {
    const trimmed = newViewName.trim();
    const name = trimmed || `Runs ${new Date().toLocaleString()}`;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const nextView: SavedRunsView = {
      id,
      name,
      range: daysBack,
      channelId,
      runId: selectedId,
      createdAt: new Date().toISOString(),
    };
    setSavedViews((prev) => [nextView, ...prev].slice(0, 12));
    setNewViewName('');
  };

  const applySavedView = (view: SavedRunsView) => {
    setParams({
      range: view.range,
      channelId: view.channelId,
      runId: view.runId,
    });
  };

  const deleteSavedView = (viewId: string) => {
    setSavedViews((prev) => prev.filter((view) => view.id !== viewId));
  };

  const buildSavedViewUrl = (view: SavedRunsView) => {
    if (typeof window === 'undefined') return '/v2/runs?ui=v2';
    const url = new URL(`${window.location.origin}/v2/runs`);
    url.searchParams.set('ui', 'v2');
    url.searchParams.set('range', String(view.range));
    if (view.channelId) url.searchParams.set('channel', view.channelId);
    if (view.runId) url.searchParams.set('run', view.runId);
    return url.toString();
  };

  if (isLoading) return <V2State kind="loading">Loading reports…</V2State>;
  if (isError || !runsData) return <V2State kind="error">Failed to load reports: {String((error as Error)?.message || error)}</V2State>;

  return (
    <div className="V2Page">
      <V2PageHeader
        title={v2Copy.nav.runs}
        subtitle="A look back at each day's activity."
        right={
          <div className="V2ControlsRow">
            <label className="V2Control">
              <span>Show last (days)</span>
              <select
                value={daysBack}
                onChange={(e) => {
                  setParams({ range: parseRange(e.target.value), runId: null });
                }}
              >
                <option value={1}>1</option>
                <option value={7}>7</option>
                <option value={30}>30</option>
                <option value={90}>90</option>
              </select>
            </label>
            <label className="V2Control">
              <span>Channel</span>
              <select
                value={channelId || ''}
                onChange={(e) => {
                  setParams({ channelId: e.target.value || null, runId: null });
                }}
              >
                <option value="">All</option>
                {channels.map((channel) => (
                  <option key={channel.channelId} value={channel.channelId}>
                    {channel.channelName || channel.channelId} ({channel.runCount})
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="V2Shell__defsButton"
              onClick={() => setShowSavedViews((v) => !v)}
            >
              {showSavedViews ? '✕ Saved Views' : '⊞ Saved Views'}
            </button>
          </div>
        }
      />

      {isStale && !staleBannerDismissed && (
        <div className="V2StalenessBanner">
          <span className="V2StalenessBanner__icon">⚠️</span>
          <p className="V2StalenessBanner__text">
            No daily run recorded for today yet.{' '}
            <span>The morning auto-report hasn't run yet. Check back later or trigger a manual report.</span>
          </p>
          <button
            type="button"
            className="V2StalenessBanner__dismiss"
            aria-label="Dismiss"
            onClick={() => setStaleBannerDismissed(true)}
          >
            ✕
          </button>
        </div>
      )}

      <section className="V2MetricsGrid">
        <V2MetricCard
          label="Daily Reports"
          value={String(aggregateStats.totalRuns)}
          meta={`Last ${daysBack} day${daysBack === 1 ? '' : 's'}`}
        />
        <V2MetricCard
          label="Messages Sent"
          value={aggregateStats.totalMessagesSent > 0 ? formatCount(aggregateStats.totalMessagesSent) : '—'}
          meta="across all reports"
        />
        <V2MetricCard
          label="Booked Calls"
          value={aggregateStats.totalBooked > 0 ? formatCount(aggregateStats.totalBooked) : '—'}
          tone="positive"
          meta="across all reports"
        />
        <V2MetricCard
          label="Avg Reply Rate"
          value={formatPct(aggregateStats.avgReplyRate)}
          meta="across runs with data"
          tone={aggregateStats.avgReplyRate !== null && aggregateStats.avgReplyRate >= 15 ? 'positive' : 'default'}
        />
      </section>

      <div className={`V2Grid V2Grid--2-1 V2RunsLayout ${isRunDetailFocused ? 'is-detail-focused' : ''}`}>
        <V2Panel title="Report History" caption={`Showing ${runsData.data.items.length} reports`} className="V2RunsLayout__timeline">
          <div className="V2RunList">
            {runsData.data.items.map((run, index) => {
                const runView = viewByRunId.get(run.id) || buildRunViewModel(run);
                return (
                  <button
                    key={run.id}
                    className={`V2RunList__item V2RunList__item--${run.status} ${selected?.id === run.id ? 'is-active' : ''}`}
                    type="button"
                    onClick={() => setSelected(run.id)}
                  >
                    {(() => {
                      const stamp = extractDateStampParts(run);
                      return (
                        <div className={`V2RunList__dateStamp V2RunList__dateStamp--${run.status}`}>
                          <span className="V2RunList__dateMonth">{stamp.month}</span>
                          <span className="V2RunList__dateDay">{stamp.day}</span>
                        </div>
                      );
                    })()}
                    <div className="V2RunList__body">
                      <div className="V2RunList__head">
                        <span>
                          {runView.title}
                          {index === 0 && <span className="V2RunList__latestBadge">Latest</span>}
                        </span>
                        <div className="V2RunList__badges">
                          <span className={`V2Tag V2Tag--${statusTone(run.status)}`}>{run.status}</span>
                          <span className="V2Tag V2Tag--accent">{run.reportType}</span>
                        </div>
                      </div>
                      <p className="V2RunList__meta">{channelLabel(run)} | {runDateLabel(run)}</p>
                      <div className="V2RunList__kpis">
                        <span>Sent {formatCount(runView.messagesSent)}</span>
                        <span>Replies {formatCount(runView.repliesReceived)}</span>
                        <span>Booked (report) {formatCount(runView.booked)}</span>
                        <span>Opt-outs {formatCount(runView.optOuts)}</span>
                      </div>
                      <p className="V2RunList__summary">{runView.summaryPreview || 'No summary available for this report.'}</p>
                    </div>
                  </button>
                );
            })}
          </div>
        </V2Panel>

        <V2Panel title="Report Details" caption="The summary and raw output." className="V2RunsLayout__detail">
          {selected && selectedView ? (
            <div className="V2RunDetail">
              {isRunDetailFocused ? (
                <div className="V2RunDetail__topActions">
                  <button type="button" className="V2RunDetail__backButton" onClick={() => setIsRunDetailFocused(false)}>
                    <span aria-hidden="true">←</span> Back to report history
                  </button>
                </div>
              ) : null}

              <header className="V2RunDetail__hero">
                <div>
                  <p className="V2RunDetail__eyebrow">{selected.reportType === 'daily' ? 'Automated Daily Report' : 'Manual / On-Demand Report'}</p>
                  <h3>{selectedView.title}</h3>
                  <p>{selectedView.subtitle}</p>
                </div>
                <div className="V2RunDetail__badges">
                  <span className={`V2Tag V2Tag--${statusTone(selected.status)}`}>{selected.status}</span>
                  <span className="V2Tag V2Tag--accent">{selected.reportType}</span>
                </div>
              </header>

              {selected.status === 'error' && selected.errorMessage ? (
                <div className="V2RunDetail__error">
                  <strong>Report Error</strong>
                  <p>{selected.errorMessage}</p>
                </div>
              ) : null}

              <div className="V2MetricsGrid">
                <V2MetricCard label="Messages Sent" value={formatCount(selectedView.messagesSent)} />
                <V2MetricCard
                  label="Replies"
                  value={formatCount(selectedView.repliesReceived)}
                  meta={`Reply rate ${formatPct(selectedView.replyRatePct)}`}
                  tone="accent"
                />
                <V2MetricCard
                  label="Booked Calls (Canonical)"
                  value={
                    selectedBookedMetricsQuery.isLoading
                      ? 'Loading…'
                      : selectedBookedMetricsQuery.isError
                        ? 'Error'
                        : formatCount(selectedSlackBookedTotal)
                  }
                  meta={selectedReportDay ? `Report date: ${selectedReportDay}` : 'Date not detected'}
                  tone={(selectedSlackBookedTotal ?? 0) > 0 ? 'positive' : 'default'}
                />
                <V2MetricCard
                  label="Booked (from report text)"
                  value={formatCount(selectedView.booked)}
                  tone={(selectedView.booked ?? 0) > 0 ? 'positive' : 'default'}
                  meta="Extracted from SMS report - may be inaccurate"
                />
                <V2MetricCard
                  label="Setter Split"
                  value={selectedBookedMetricsQuery.isLoading ? 'Loading…' : selectedSlackBookedSplit}
                  meta="Jack / Brandon / Self (Slack credit)"
                />
                <V2MetricCard
                  label="Opt-Outs"
                  value={formatCount(selectedView.optOuts)}
                  meta={`Outbound conversations ${formatCount(selectedView.outboundConversations)}`}
                  tone={(selectedView.optOuts ?? 0) > 0 ? 'critical' : 'default'}
                />
              </div>

              {selectedSlackBookedTotal !== null && selectedSlackBookedTotal > 0 && (
                <V2Panel
                  title="Setter Split"
                  caption="How booked calls are credited across setters and self-bookings for this report day. Bookings are dated by when they were recorded in Slack — if a booking was entered after midnight it will appear in the next day's count, not this one."
                >
                  <V2StatBar
                    segments={[
                      { label: 'Jack', value: selectedSlackBookedJack ?? 0, color: '#11b8d6' },
                      { label: 'Brandon', value: selectedSlackBookedBrandon ?? 0, color: '#13b981' },
                      { label: 'Self', value: selectedSlackBookedSelf ?? 0, color: 'var(--v2-muted)' },
                    ]}
                    total={selectedSlackBookedTotal}
                  />
                </V2Panel>
              )}

              <div className="V2Grid V2Grid--2">
                <section className="V2RunDetail__section">
                  <h4>Summary</h4>
                  {selectedView.summaryLines.length ? (
                    <ul className="V2BulletList">
                      {selectedView.summaryLines.map((line, index) => (
                        <li key={`${line}-${index}`}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="V2RunDetail__muted">No summary available for this report.</p>
                  )}
                </section>

                <section className="V2RunDetail__section">
                  <h4>Report Info</h4>
                  <dl className="V2RunDetail__meta">
                    <dt>ID</dt>
                    <dd>{selected.id}</dd>
                    <dt>Channel</dt>
                    <dd>{channelLabel(selected)}</dd>
                    <dt>Generated at</dt>
                    <dd>{formatDateTime(selected.timestamp)}</dd>
                    <dt>Report Day</dt>
                    <dd>{runDateLabel(selected)}</dd>
                    <dt>Duration</dt>
                    <dd>{formatDuration(selected.durationMs)}</dd>
                  </dl>
                </section>
              </div>

              <section className="V2RunDetail__section">
                <h4>Top Sequences</h4>
                {selectedView.topSequences.length ? (
                  <div className="V2TableWrap">
                    <table className="V2Table">
                      <thead>
                        <tr>
                          <th>Sequence</th>
                          <th className="is-right">Sent</th>
                          <th className="is-right">Replies</th>
                          <th className="is-right">Reply Rate</th>
                          <th className="is-right">Booked Calls</th>
                          <th className="is-right">Opt-Outs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedView.topSequences.map((row, index) => (
                          <tr key={`${row.label}-${index}`}>
                            <td>{row.label}</td>
                            <td className="is-right">{row.sent.toLocaleString()}</td>
                            <td className="is-right">{row.replies.toLocaleString()}</td>
                            <td className="is-right">{row.replyRatePct.toFixed(1)}%</td>
                            <td className="is-right">{row.booked.toLocaleString()}</td>
                            <td className="is-right">
                              {row.optOuts.toLocaleString()} ({row.optOutRatePct.toFixed(1)}%)
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="V2RunDetail__muted">No sequence data found for this report.</p>
                )}
              </section>

              <section className="V2RunDetail__section">
                <h4>Setter Performance</h4>
                {selectedView.repRows.length ? (
                  <div className="V2TableWrap">
                    <table className="V2Table">
                      <thead>
                        <tr>
                          <th>Setter</th>
                          <th className="is-right">Conversations</th>
                          <th
                            className="is-right"
                            title="Bookings as reported by the Aloware SMS system — not Slack-verified. See 'Booked (Slack-verified)' above for the canonical count."
                          >
                            Bookings (from report)
                          </th>
                          <th className="is-right">Opt-Outs</th>
                          <th>Top Sequence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedView.repRows.map((row, index) => (
                          <tr key={`${row.name}-${index}`}>
                            <td>{row.name}</td>
                            <td className="is-right">{row.outboundConversations.toLocaleString()}</td>
                            <td
                              className="is-right"
                              title="Aloware-reported bookings — may differ from Slack-verified count above"
                            >
                              {row.booked.toLocaleString()}
                            </td>
                            <td className="is-right">{row.optOuts.toLocaleString()}</td>
                            <td>{row.topSequenceLabel || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="V2RunDetail__muted">No setter data found for this report.</p>
                )}
                <p className="V2RunDetail__muted" style={{ marginTop: '0.5rem', fontSize: '0.75rem' }}>
                  ⓘ <strong>Important:</strong> "Bookings (from report)" are pulled from the Aloware SMS report text and may not match the Slack-verified count above. Always use <em>Booked Calls (Canonical)</em> as the official figure for reporting.
                </p>
              </section>

              <details className="V2RunDetail__raw">
                <summary>Show full report text</summary>
                <pre>{selectedRunQuery.isLoading ? 'Loading report text…' : selected.fullReport || 'No report text available'}</pre>
              </details>
            </div>
          ) : (
            <V2State kind="empty">Select a report to view details.</V2State>
          )}
        </V2Panel>
      </div>

      {showSavedViews && (
        <V2Panel title="Saved Views" caption="Save and share specific run views. Up to 12 saved.">
          <div className="V2SavedViews">
            <div className="V2SavedViews__composer">
              <input
                type="text"
                value={newViewName}
                onChange={(e) => setNewViewName(e.target.value)}
                placeholder="View name (e.g. Jack weekly + main line)"
              />
              <button type="button" onClick={saveCurrentView}>
                Save current view
              </button>
              <button type="button" onClick={() => void copyShareLink('current', shareableUrl)}>
                {copied === 'current' ? 'Copied link' : 'Copy current link'}
              </button>
            </div>
            {savedViews.length ? (
              <div className="V2SavedViews__list">
                {savedViews.map((view) => (
                  <article className="V2SavedViews__item" key={view.id}>
                    <div>
                      <h3>{view.name}</h3>
                      <p>
                        Last {view.range} days | Channel: {view.channelId || 'All'} | Report: {view.runId ? view.runId.slice(0, 8) : 'none'}
                      </p>
                    </div>
                    <div className="V2SavedViews__actions">
                      <button type="button" onClick={() => applySavedView(view)}>
                        Open
                      </button>
                      <button type="button" onClick={() => void copyShareLink(view.id, buildSavedViewUrl(view))}>
                        {copied === view.id ? 'Copied' : 'Copy URL'}
                      </button>
                      <button type="button" onClick={() => deleteSavedView(view.id)}>
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <V2State kind="empty">No saved views yet.</V2State>
            )}
          </div>
        </V2Panel>
      )}
    </div>
  );
}
