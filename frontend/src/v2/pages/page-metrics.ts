import type { RunV2, SalesMetricsV2 } from '../../api/v2-types.js';
import { parseReport, type RepMetrics, type SequenceRow } from '../../utils/reportParser.js';

const DAILY_SNAPSHOT_TITLE_PATTERN = /PT BIZ - DAILY SMS SNAPSHOT/i;
const DAILY_SETTER_SUMMARY_PATTERN = /Daily Setter Snapshot/i;
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

const pad2 = (value: number): string => value.toString().padStart(2, '0');

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

export type SequenceHeaderMetrics = {
  totalBookedAllChannels: number;
  totalBookedAttributedToRows: number;
  unattributedCalls: number;
  totalBookedAfterReply: number;
  totalBookedNonSmsOrUnknown: number;
};

export type InsightsBookedBreakdown = {
  bookedTotalAllChannels: number;
  bookedSmsLinkedStrict: number;
  bookedSelf: number;
  bookedNonSmsOrUnknown: number;
  bookedNonSmsOrUnknownExcludingSelf: number;
};

const parseDateValue = (value: string): Date | null => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
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

const formatCount = (value: number | null): string => {
  if (value === null) return '—';
  return Math.round(value).toLocaleString();
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

const isSummaryNoiseLine = (line: string): boolean => SUMMARY_NOISE_PATTERNS.some((pattern) => pattern.test(line));

export const buildRunViewModel = (run: RunV2): RunViewModel => {
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
  const parsedBookedFromSequences = parsed?.allSequences.reduce((sum, row) => sum + row.booked, 0) ?? null;
  const booked = hasParsedBreakdown
    ? parsedBookedFromSequences
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
      ? `Sent ${formatCount(messagesSent)} | Replies ${formatCount(repliesReceived)} | Booked (report) ${formatCount(booked)} | Opt-outs ${formatCount(optOuts)}`
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

export const resolveSelectedRunViewModel = (
  selected: RunV2 | null,
  cachedById?: Map<string, RunViewModel>,
): RunViewModel | null => {
  if (!selected) return null;
  if (cachedById && !selected.fullReport && cachedById.has(selected.id)) {
    return cachedById.get(selected.id) || buildRunViewModel(selected);
  }
  return buildRunViewModel(selected);
};

export const computeSequenceHeaderMetrics = (
  payload: SalesMetricsV2,
  sequences: SalesMetricsV2['sequences'],
): SequenceHeaderMetrics => {
  const totalBookedAllChannels = payload.bookedCredit.total;
  const totalBookedAttributedToRows = sequences.reduce((sum, row) => sum + row.canonicalBookedCalls, 0);
  const attribution = payload.provenance.sequenceBookedAttribution;
  const unattributedCalls = attribution?.unattributedCalls ?? Math.max(0, totalBookedAllChannels - totalBookedAttributedToRows);
  const totalBookedAfterReply = attribution?.strictSmsReplyLinkedCalls ?? 0;
  const totalBookedNonSmsOrUnknown = attribution?.nonSmsOrUnknownCalls ?? unattributedCalls;

  return {
    totalBookedAllChannels,
    totalBookedAttributedToRows,
    unattributedCalls,
    totalBookedAfterReply,
    totalBookedNonSmsOrUnknown,
  };
};

export const computeInsightsBookedBreakdown = (payload: SalesMetricsV2): InsightsBookedBreakdown => {
  const bookedTotalAllChannels = payload.bookedCredit.total;
  const bookedSmsLinkedStrict = payload.provenance.sequenceBookedAttribution?.strictSmsReplyLinkedCalls ?? 0;
  const bookedSelf = payload.bookedCredit.selfBooked;
  const bookedNonSmsOrUnknown = payload.provenance.sequenceBookedAttribution?.nonSmsOrUnknownCalls ?? 0;

  return {
    bookedTotalAllChannels,
    bookedSmsLinkedStrict,
    bookedSelf,
    bookedNonSmsOrUnknown,
    bookedNonSmsOrUnknownExcludingSelf: Math.max(0, bookedNonSmsOrUnknown - bookedSelf),
  };
};

export const toIsoDay = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const parsed = parseDateValue(trimmed);
  if (!parsed) return null;
  return `${parsed.getUTCFullYear()}-${pad2(parsed.getUTCMonth() + 1)}-${pad2(parsed.getUTCDate())}`;
};