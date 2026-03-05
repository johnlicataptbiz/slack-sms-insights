const DAILY_SNAPSHOT_TITLE_PATTERN = /PT BIZ - DAILY SMS SNAPSHOT/i;
const OUTBOUND_CONVERSATIONS_PATTERNS = [
  /- Outbound conversations started\s*\(24h\):\s*(\d+)/gi,
  /- Outbound Conversations:\s*(\d+)/gi,
];
const BOOKINGS_PATTERNS = [/Calls\s+booked\s*\(24h\):\s*(\d+)/gi, /- Bookings:\s*(\d+)/gi];
const OPTOUTS_PATTERNS = [/Total opt-out conversations\s*\(24h\):\s*(\d+)/gi, /- Opt[-\s]?Outs?:\s*(\d+)/gi];
const DATE_PATTERN = /^Date:\s*(.+)$/im;
const TIME_RANGE_PATTERN = /^Time Range:\s*(.+)$/im;
const SEQUENCE_LINE_PATTERN =
  /^-\s*(.+?):\s*sent\s+(\d+).*?(?:replies(?:\s+received)?|replied)\s+(\d+)\s*\(([0-9.]+)%[^)]*\).*?book(?:ings?|ed)\s+(\d+).*?opt-outs\s+(\d+)/i;

type SequenceRow = {
  booked: number;
  label: string;
  messagesSent: number;
  optOuts: number;
  repliesReceived: number;
};

const sumRegexMatches = (input: string, pattern: RegExp): number => {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);
  let sum = 0;
  for (const match of input.matchAll(globalPattern)) {
    const parsed = Number.parseInt(match[1] || '', 10);
    if (!Number.isNaN(parsed)) {
      sum += parsed;
    }
  }
  return sum;
};

const sumFromPatterns = (input: string, patterns: RegExp[]): number => {
  for (const pattern of patterns) {
    const sum = sumRegexMatches(input, pattern);
    const nonGlobalPattern = new RegExp(pattern.source, pattern.flags.replace(/g/g, ''));
    if (sum > 0 || nonGlobalPattern.test(input)) {
      return sum;
    }
  }
  return 0;
};

const sumCoreMetrics = (report: string, pattern: RegExp): { sum: number; foundCoreMetrics: boolean } => {
  let sum = 0;
  let inCoreMetrics = false;
  let foundCoreMetrics = false;
  for (const line of report.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.startsWith('*Core Metrics*')) {
      inCoreMetrics = true;
      foundCoreMetrics = true;
      continue;
    }
    if (trimmed.startsWith('*') && trimmed !== '*Core Metrics*') {
      inCoreMetrics = false;
    }
    if (inCoreMetrics) {
      const match = trimmed.match(pattern);
      if (match) {
        sum += Number.parseInt(match[1] || '0', 10);
      }
    }
  }
  return { sum, foundCoreMetrics };
};

const aggregateSequenceRows = (report: string): SequenceRow[] => {
  const byLabel = new Map<string, SequenceRow>();
  for (const rawLine of report.split('\n')) {
    const line = rawLine.trim();
    const match = line.match(SEQUENCE_LINE_PATTERN);
    if (!match) {
      continue;
    }

    const label = (match[1] || '').trim();
    const messagesSent = Number.parseInt(match[2] || '', 10);
    const repliesReceived = Number.parseInt(match[3] || '', 10);
    const booked = Number.parseInt(match[5] || '', 10);
    const optOuts = Number.parseInt(match[6] || '', 10);
    if (!label || [messagesSent, repliesReceived, booked, optOuts].some((value) => Number.isNaN(value))) {
      continue;
    }

    const current = byLabel.get(label) || {
      label,
      messagesSent: 0,
      repliesReceived: 0,
      booked: 0,
      optOuts: 0,
    };
    current.messagesSent += messagesSent;
    current.repliesReceived += repliesReceived;
    current.booked += booked;
    current.optOuts += optOuts;
    byLabel.set(label, current);
  }

  return [...byLabel.values()].sort((a, b) => {
    if (b.messagesSent !== a.messagesSent) {
      return b.messagesSent - a.messagesSent;
    }
    if (b.repliesReceived !== a.repliesReceived) {
      return b.repliesReceived - a.repliesReceived;
    }
    return a.label.localeCompare(b.label);
  });
};

export const isDailySnapshotReport = (report: string): boolean => {
  return DAILY_SNAPSHOT_TITLE_PATTERN.test(report);
};

export const extractDailySnapshotReportDate = (report: string): string | null => {
  const raw = report.match(DATE_PATTERN)?.[1]?.trim();
  if (!raw) return null;

  const parsed = new Date(raw);
  if (!Number.isFinite(parsed.getTime())) return null;

  const yyyy = parsed.getUTCFullYear();
  const mm = String(parsed.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const buildDailyReportSummary = (report: string): string => {
  const bookingsCore = sumCoreMetrics(report, /- Book(?:ings?|ed):\s*(\d+)/i);
  const booked = bookingsCore.foundCoreMetrics ? bookingsCore.sum : sumFromPatterns(report, BOOKINGS_PATTERNS);

  const optOutsCore = sumCoreMetrics(report, /- Opt[-\s]?Outs?:\s*(\d+)/i);
  const optOuts = optOutsCore.foundCoreMetrics ? optOutsCore.sum : sumFromPatterns(report, OPTOUTS_PATTERNS);

  const outboundCore = sumCoreMetrics(report, /- Outbound Conversations:\s*(\d+)/i);
  const outboundConversations = outboundCore.foundCoreMetrics
    ? outboundCore.sum
    : sumFromPatterns(report, OUTBOUND_CONVERSATIONS_PATTERNS);
  const sequences = aggregateSequenceRows(report);
  const dateLabel = report.match(DATE_PATTERN)?.[1]?.trim();
  const timeRange = report.match(TIME_RANGE_PATTERN)?.[1]?.trim();
  const messagesSent = sequences.reduce((sum, row) => sum + row.messagesSent, 0);
  const repliesReceived = sequences.reduce((sum, row) => sum + row.repliesReceived, 0);
  const replyRatePct = messagesSent > 0 ? (repliesReceived / messagesSent) * 100 : 0;
  const topSequences = sequences.slice(0, 3);

  const headlineParts = ['Daily Setter Snapshot'];
  if (dateLabel) {
    headlineParts.push(dateLabel);
  }
  if (timeRange) {
    headlineParts.push(timeRange);
  }

  const lines = [
    headlineParts.join(' | '),
    `Messages sent: ${messagesSent}`,
    `Replies received: ${repliesReceived} (${replyRatePct.toFixed(1)}%)`,
    `Calls booked (Slack): ${booked}`,
    `Opt-outs: ${optOuts}`,
  ];

  if (outboundConversations > 0) {
    lines.push(`Outbound conversations: ${outboundConversations}`);
  }

  if (topSequences.length > 0) {
    lines.push('Top sequences by volume:');
    topSequences.forEach((row, index) => {
      const sequenceRate = row.messagesSent > 0 ? (row.repliesReceived / row.messagesSent) * 100 : 0;
      lines.push(
        `${index + 1}. ${row.label}: ${row.messagesSent} sent, ${row.repliesReceived} replies (${sequenceRate.toFixed(
          1,
        )}%), ${row.booked} booked, ${row.optOuts} opt-outs`,
      );
    });
  }

  return lines.join('\n');
};

type SlackBlock = Record<string, unknown>;

export const buildDailyReportBlocks = (report: string): SlackBlock[] => {
  const bookingsCore = sumCoreMetrics(report, /- Book(?:ings?|ed):\s*(\d+)/i);
  const booked = bookingsCore.foundCoreMetrics ? bookingsCore.sum : sumFromPatterns(report, BOOKINGS_PATTERNS);

  const optOutsCore = sumCoreMetrics(report, /- Opt[-\s]?Outs?:\s*(\d+)/i);
  const optOuts = optOutsCore.foundCoreMetrics ? optOutsCore.sum : sumFromPatterns(report, OPTOUTS_PATTERNS);
  const sequences = aggregateSequenceRows(report);

  const messagesSent = sequences.reduce((sum, row) => sum + row.messagesSent, 0);
  const repliesReceived = sequences.reduce((sum, row) => sum + row.repliesReceived, 0);
  const replyRatePct = messagesSent > 0 ? (repliesReceived / messagesSent) * 100 : 0;

  const topSequences = sequences.slice(0, 3);

  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: '📊 Daily SMS Performance Snapshot',
        emoji: true,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Total Messages:*\n${messagesSent.toLocaleString()}`,
        },
        {
          type: 'mrkdwn',
          text: `*Reply Rate:*\n${replyRatePct.toFixed(1)}% (${repliesReceived.toLocaleString()} replies)`,
        },
        {
          type: 'mrkdwn',
          text: `*Calls Booked:*\n${booked > 0 ? `🚀 *${booked}*` : '0'}`,
        },
        {
          type: 'mrkdwn',
          text: `*Opt-Outs:*\n${optOuts > 0 ? `⚠️ ${optOuts}` : '0'}`,
        },
      ],
    },
  ];

  if (topSequences.length > 0) {
    blocks.push({ type: 'divider' });
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*🔥 Top Performing Sequences*',
      },
    });

    for (const row of topSequences) {
      const rate = row.messagesSent > 0 ? (row.repliesReceived / row.messagesSent) * 100 : 0;
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${row.label}*\n${row.messagesSent} sent • ${rate.toFixed(1)}% reply • ${row.booked} booked`,
        },
      });
    }
  }

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: '📈 _Data extracted from PT Biz Daily Snapshot_',
      },
    ],
  });

  return blocks;
};

// ─── Outlier Detection ────────────────────────────────────────────────────────

export type ParsedRunMetrics = {
  runId: string;
  reportDate: string | null;
  messagesSent: number;
  booked: number;
  optOuts: number;
  replyRatePct: number;
  durationMs: number | null;
};

export type RunOutlierAnnotation = {
  runId: string;
  outlierFields: Array<{
    field: keyof Omit<ParsedRunMetrics, 'runId' | 'reportDate'>;
    value: number;
    direction: 'high' | 'low';
    q1: number;
    q3: number;
    iqr: number;
    fence: number;
  }>;
};

/** Linear interpolation percentile on a pre-sorted array. */
const iqrPercentile = (sorted: number[], p: number): number => {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
};

/**
 * Parse key numeric metrics out of a run's summaryText + durationMs.
 * Used as input to detectRunOutliers.
 */
export const parseRunMetrics = (
  runId: string,
  reportDate: string | null,
  summaryText: string | null,
  durationMs: number | null,
): ParsedRunMetrics => {
  const text = summaryText || '';
  const sequences = aggregateSequenceRows(text);
  const messagesSent =
    sequences.reduce((s, r) => s + r.messagesSent, 0) ||
    sumFromPatterns(text, OUTBOUND_CONVERSATIONS_PATTERNS);
  const repliesReceived = sequences.reduce((s, r) => s + r.repliesReceived, 0);
  const replyRatePct = messagesSent > 0 ? (repliesReceived / messagesSent) * 100 : 0;
  const booked = sumFromPatterns(text, BOOKINGS_PATTERNS);
  const optOuts = sumFromPatterns(text, OPTOUTS_PATTERNS);
  return { runId, reportDate, messagesSent, booked, optOuts, replyRatePct, durationMs };
};

/**
 * IQR-based outlier detection across a set of parsed run metrics.
 * Returns only runs that have at least one outlier field.
 * Requires at least 4 data points; returns [] for smaller sets.
 */
export const detectRunOutliers = (runs: ParsedRunMetrics[]): RunOutlierAnnotation[] => {
  if (runs.length < 4) return [];

  type NumericField = keyof Omit<ParsedRunMetrics, 'runId' | 'reportDate'>;
  const numericFields: NumericField[] = ['messagesSent', 'booked', 'optOuts', 'replyRatePct', 'durationMs'];

  const fences = new Map<NumericField, { q1: number; q3: number; iqr: number; lo: number; hi: number }>();
  for (const field of numericFields) {
    const values = runs
      .map((r) => r[field])
      .filter((v): v is number => v !== null && Number.isFinite(v as number));
    if (values.length < 4) continue;
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = iqrPercentile(sorted, 25);
    const q3 = iqrPercentile(sorted, 75);
    const iqr = q3 - q1;
    if (iqr === 0) continue; // All values identical — no outliers possible
    fences.set(field, { q1, q3, iqr, lo: q1 - 1.5 * iqr, hi: q3 + 1.5 * iqr });
  }

  const annotations: RunOutlierAnnotation[] = [];
  for (const run of runs) {
    const outlierFields: RunOutlierAnnotation['outlierFields'] = [];
    for (const field of numericFields) {
      const fence = fences.get(field);
      if (!fence) continue;
      const raw = run[field];
      if (raw === null || !Number.isFinite(raw as number)) continue;
      const v = raw as number;
      if (v < fence.lo) {
        outlierFields.push({ field, value: v, direction: 'low', q1: fence.q1, q3: fence.q3, iqr: fence.iqr, fence: fence.lo });
      } else if (v > fence.hi) {
        outlierFields.push({ field, value: v, direction: 'high', q1: fence.q1, q3: fence.q3, iqr: fence.iqr, fence: fence.hi });
      }
    }
    if (outlierFields.length > 0) {
      annotations.push({ runId: run.runId, outlierFields });
    }
  }
  return annotations;
};
