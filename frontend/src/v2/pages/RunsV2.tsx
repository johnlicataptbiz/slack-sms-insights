import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useV2Channels, useV2Runs, useV2SalesMetrics } from '../../api/v2Queries';
import type { RunV2 } from '../../api/v2-types';
import { parseReport, type RepMetrics, type SequenceRow } from '../../utils/reportParser';
import { v2Copy } from '../copy';
import { V2MetricCard, V2PageHeader, V2Panel, V2State } from '../components/V2Primitives';

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

type RunViewModel = {
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
  const booked = hasParsedBreakdown ? parsed?.totalBooked ?? null : matchNumber(run.summaryText, CALLS_BOOKED_PATTERN);
  const optOuts = hasParsedBreakdown ? parsed?.totalOptOuts ?? null : matchNumber(run.summaryText, OPT_OUTS_PATTERN);
  const outboundConversations = sumMatches(fullReport, OUTBOUND_CONVERSATIONS_PATTERN) ?? matchNumber(run.summaryText, OUTBOUND_FROM_SUMMARY_PATTERN);

  const titleBase =
    run.reportType === 'daily' && isDailySnapshot
      ? 'Daily Setter Snapshot'
      : run.reportType === 'daily'
        ? 'Daily Auto-Run'
        : run.reportType === 'manual'
          ? 'Manual Pull'
          : 'Test Pull';
  const title = run.status === 'error' ? `${titleBase} (Failed)` : titleBase;

  const modeLabel = run.reportType === 'daily' ? '6:00 AM auto run' : run.reportType === 'manual' ? 'Manual trigger' : 'Test trigger';
  const subtitleParts = [timeRangeLabel, modeLabel].filter((part): part is string => Boolean(part));

  const metricPreview =
    messagesSent !== null || repliesReceived !== null || booked !== null || optOuts !== null
      ? `Sent ${formatCount(messagesSent)} | Replies ${formatCount(repliesReceived)} | Booked Calls ${formatCount(booked)} | Opt-outs ${formatCount(
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

  const daysBack = parseRange(searchParams.get('range'));
  const channelId = searchParams.get('channel') || null;
  const selectedId = searchParams.get('run');
  const [isRunDetailFocused, setIsRunDetailFocused] = useState(() => Boolean(selectedId));

  const { data: runsData, isLoading, isError, error } = useV2Runs({ daysBack, channelId, limit: 100, offset: 0 });
  const { data: channelsData } = useV2Channels();

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

  const selected = useMemo(() => runsData?.data.items.find((item) => item.id === selectedId) || null, [runsData?.data.items, selectedId]);
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

  const selectedView = selected ? viewByRunId.get(selected.id) || buildRunViewModel(selected) : null;
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

  if (isLoading) return <V2State kind="loading">Loading daily runs…</V2State>;
  if (isError || !runsData) return <V2State kind="error">Failed to load runs: {String((error as Error)?.message || error)}</V2State>;

  return (
    <div className="V2Page">
      <V2PageHeader
        title={v2Copy.nav.runs}
        subtitle="Historical run log and run detail viewer. Structured snapshot first, raw text only when needed."
        right={
          <div className="V2ControlsRow">
            <label className="V2Control">
              <span>Range (days)</span>
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
          </div>
        }
      />

      <V2Panel title="Saved Views (Manager Pack)" caption="Save and share range, channel, and selected run via URL.">
        <div className="V2SavedViews">
          <div className="V2SavedViews__composer">
            <input
              type="text"
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
              placeholder="View name (example: Jack weekly + main line)"
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
                      Range {view.range}d | Channel {view.channelId || 'All'} | Run {view.runId ? view.runId.slice(0, 8) : 'none'}
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
            <V2State kind="empty">No saved views yet. Save one for manager handoff.</V2State>
          )}
        </div>
      </V2Panel>

      <div className={`V2Grid V2Grid--2-1 V2RunsLayout ${isRunDetailFocused ? 'is-detail-focused' : ''}`}>
        {!isRunDetailFocused ? (
          <V2Panel title="Run Timeline" caption={`Showing ${runsData.data.items.length} runs`} className="V2RunsLayout__timeline">
            <div className="V2RunList">
              {runsData.data.items.map((run) => {
                const runView = viewByRunId.get(run.id) || buildRunViewModel(run);
                return (
                  <button
                    key={run.id}
                    className={`V2RunList__item ${selected?.id === run.id ? 'is-active' : ''}`}
                    type="button"
                    onClick={() => setSelected(run.id)}
                  >
                    <div className="V2RunList__head">
                      <span>{runView.title}</span>
                      <div className="V2RunList__badges">
                        <span className={`V2Tag V2Tag--${statusTone(run.status)}`}>{run.status}</span>
                        <span className="V2Tag V2Tag--accent">{run.reportType}</span>
                      </div>
                    </div>
                    <p className="V2RunList__meta">
                      {channelLabel(run)} | {runDateLabel(run)}
                    </p>
                    <p className="V2RunList__meta">{runView.subtitle}</p>
                    <div className="V2RunList__kpis">
                      <span>Sent {formatCount(runView.messagesSent)}</span>
                      <span>Replies {formatCount(runView.repliesReceived)}</span>
                      <span>Booked Calls {formatCount(runView.booked)}</span>
                      <span>Opt-outs {formatCount(runView.optOuts)}</span>
                    </div>
                    <p className="V2RunList__summary">{runView.summaryPreview || 'No structured summary stored for this run.'}</p>
                  </button>
                );
              })}
            </div>
          </V2Panel>
        ) : null}

        <V2Panel title="Selected Run" caption="Structured summary first. Expand raw report text only when needed." className="V2RunsLayout__detail">
          {selected && selectedView ? (
            <div className="V2RunDetail">
              {isRunDetailFocused ? (
                <div className="V2RunDetail__topActions">
                  <button type="button" className="V2RunDetail__backButton" onClick={() => setIsRunDetailFocused(false)}>
                    <span aria-hidden="true">←</span> Back to run timeline
                  </button>
                </div>
              ) : null}

              <header className="V2RunDetail__hero">
                <div>
                  <p className="V2RunDetail__eyebrow">{selected.reportType === 'daily' ? 'Automated Daily Run' : 'Manual / On-Demand Run'}</p>
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
                  <strong>Run Error</strong>
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
                  label="Booked (Run report metric)"
                  value={formatCount(selectedView.booked)}
                  tone={(selectedView.booked ?? 0) > 0 ? 'positive' : 'default'}
                />
                <V2MetricCard
                  label="Booked total (Slack first conversion)"
                  value={
                    selectedBookedMetricsQuery.isLoading
                      ? 'Loading...'
                      : selectedBookedMetricsQuery.isError
                        ? 'Error'
                        : formatCount(selectedSlackBookedTotal)
                  }
                  meta={
                    selectedReportDay
                      ? `Report day ${selectedReportDay}. Can exceed SMS replies due to non SMS or unknown source.`
                      : 'Report day not detected for this run.'
                  }
                  tone={(selectedSlackBookedTotal ?? 0) > 0 ? 'positive' : 'default'}
                />
                <V2MetricCard
                  label="Jack booked / Brandon booked / Self booked"
                  value={selectedBookedMetricsQuery.isLoading ? 'Loading...' : selectedSlackBookedSplit}
                  meta={
                    selectedBookedMetricsQuery.isError
                      ? `Could not load booked split: ${String((selectedBookedMetricsQuery.error as Error)?.message || selectedBookedMetricsQuery.error)}`
                      : 'Slack first conversion credit split for this report day.'
                  }
                />
                <V2MetricCard
                  label="Opt-Outs"
                  value={formatCount(selectedView.optOuts)}
                  meta={`Outbound conversations ${formatCount(selectedView.outboundConversations)}`}
                  tone={(selectedView.optOuts ?? 0) > 0 ? 'critical' : 'default'}
                />
              </div>

              <div className="V2Grid V2Grid--2">
                <section className="V2RunDetail__section">
                  <h4>Snapshot Summary</h4>
                  {selectedView.summaryLines.length ? (
                    <ul className="V2BulletList">
                      {selectedView.summaryLines.map((line, index) => (
                        <li key={`${line}-${index}`}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="V2RunDetail__muted">No structured summary stored for this run.</p>
                  )}
                </section>

                <section className="V2RunDetail__section">
                  <h4>Run Metadata</h4>
                  <dl className="V2RunDetail__meta">
                    <dt>ID</dt>
                    <dd>{selected.id}</dd>
                    <dt>Channel</dt>
                    <dd>{channelLabel(selected)}</dd>
                    <dt>Timestamp</dt>
                    <dd>{formatDateTime(selected.timestamp)}</dd>
                    <dt>Report Day</dt>
                    <dd>{runDateLabel(selected)}</dd>
                    <dt>Duration</dt>
                    <dd>{formatDuration(selected.durationMs)}</dd>
                  </dl>
                </section>
              </div>

              <section className="V2RunDetail__section">
                <h4>Top Sequence Volume</h4>
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
                  <p className="V2RunDetail__muted">No parsed sequence rows were found for this run.</p>
                )}
              </section>

              <section className="V2RunDetail__section">
                <h4>Setter Breakdown</h4>
                {selectedView.repRows.length ? (
                  <div className="V2TableWrap">
                    <table className="V2Table">
                      <thead>
                        <tr>
                          <th>Setter</th>
                          <th className="is-right">Outbound Convos</th>
                          <th className="is-right">Booked Calls</th>
                          <th className="is-right">Opt-Outs</th>
                          <th>Top Sequence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedView.repRows.map((row, index) => (
                          <tr key={`${row.name}-${index}`}>
                            <td>{row.name}</td>
                            <td className="is-right">{row.outboundConversations.toLocaleString()}</td>
                            <td className="is-right">{row.booked.toLocaleString()}</td>
                            <td className="is-right">{row.optOuts.toLocaleString()}</td>
                            <td>{row.topSequenceLabel || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="V2RunDetail__muted">No parsed setter rows were found for this run.</p>
                )}
              </section>

              <details className="V2RunDetail__raw">
                <summary>Show stored raw report text</summary>
                <pre>{selected.fullReport || 'No stored report text'}</pre>
              </details>
            </div>
          ) : (
            <V2State kind="empty">Select a run to inspect details.</V2State>
          )}
        </V2Panel>
      </div>
    </div>
  );
}
