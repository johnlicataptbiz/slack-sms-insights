import type { Logger } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  readCanvasSyncState,
  upsertCanvasSyncState,
} from "./canvas-sync-state.js";
import { runSerializedTask } from "./serialized-task.js";
import { timeOperation } from "./telemetry.js";

const DAILY_REPORT_PROMPT_PATTERN =
  /\b(daily report|new inbound leads|booking requests|follow-ups needed)\b/i;
const DAILY_REPORT_TITLE_PATTERN =
  /(PT BIZ - DAILY SMS (REPORT|SNAPSHOT)|SMS Insights Core KPI Report)/i;
const DAILY_REPORT_REQUEST_PATTERN = /<@[^>]+>\s*daily report/i;
const DEFAULT_CANVAS_TITLE = "Analysis Log Report";
const DEFAULT_ARCHIVE_CANVAS_TITLE = "Analysis Log Archive";
const DEFAULT_TIMEZONE = "America/Chicago";
const DEFAULT_RETENTION_DAYS = 365;
const DEFAULT_LOOKBACK_DAYS = 365;
const DEFAULT_FULL_DETAIL_RUNS = 30;
const DEFAULT_PRIMARY_TRIGGER_ID = "Ft0AF5FTC3U4";
const DEFAULT_BACKUP_TRIGGER_ID = "Ft0AF1TPMEFL";
const DEFAULT_PRIMARY_RUN_LABEL = "Scheduled 4:00 PM";
const DEFAULT_BACKUP_RUN_LABEL = "Scheduled (secondary)";
const DEFAULT_MANUAL_RUN_LABEL = "Manual";
const DEFAULT_MANAGED_SECTION_HEADING = "SMS Insights Auto Log (Managed)";
const DEFAULT_ARCHIVE_SECTION_HEADING = "SMS Insights Archive (Managed)";
const DEFAULT_MANAGED_CANVAS_KEY = "sms_insights_auto_log_v2";
const DEFAULT_ARCHIVE_CANVAS_KEY = "sms_insights_archive_v2";
const DEFAULT_REPORT_MAX_THREADS_PER_RUN = 40;
const DEFAULT_REPORT_THREAD_FETCH_CONCURRENCY = 4;
const DEFAULT_REPORT_STATE_BUFFER_SECONDS = 60 * 60;
const DEFAULT_DURABLE_MODE_ENABLED = true;
const DEFAULT_REPORT_STORE_PATH = ".data/canvas-report-log.json";
const DEFAULT_REPORT_STORE_MAX_ENTRIES = 1000;
const REQUEST_MATCH_WINDOW_SECONDS = 10 * 60;
const DAY_SECONDS = 24 * 60 * 60;
export const LEGACY_MAIN_SECTION_MARKERS = [
  "PT BIZ - DAILY SMS REPORT",
  "PT BIZ - DAILY SMS SNAPSHOT",
  "Open Conversations Waiting on Us",
  "Daily Index",
  "Daily Logs",
  "SMS Snapshot Board",
  "Latest Daily Run",
  "Booking Conversion By Message Structure (Latest Run)",
  "Performance By Sequence (Latest Run)",
  "Opt-Outs Tied To Campaigns (Latest Run)",
  "Daily Report Archive (Newest First)",
  "Snapshot and index metrics aggregate all setter sections from each run.",
  "Retention window: last",
];
export const LEGACY_ARCHIVE_SECTION_MARKERS = [
  "Archive includes runs older than",
  "Monthly totals:",
];

type SlackFile = {
  id?: string;
  title?: string;
};

type HistoryMessage = {
  ts?: string;
  text?: string;
  trigger_id?: string;
  app_id?: string;
  bot_id?: string;
  user?: string;
  subtype?: string;
};

type SectionLookupResponse = {
  ok?: boolean;
  error?: string;
  sections?: Array<{ id?: string }>;
};

type CanvasCreateResponse = {
  ok?: boolean;
  error?: string;
  id?: string;
  canvas_id?: string;
  canvas?: {
    id?: string;
  };
};

type SequenceResponseRateRow = {
  booked: number;
  label: string;
  messagesSent: number;
  optOuts: number;
  repliesReceived: number;
  replyRatePct: number;
};

type ReportMetrics = {
  outboundConversations?: number;
  replyRateText?: string;
  booked?: number;
  optOuts?: number;
  bookingRatePerConversationText?: string;
  bookingRatePerReplyText?: string;
  rolling7DayBookingPer100?: number;
  topBookingDriverLabel?: string;
  topBookingDriverReplyRateText?: string;
  topBookingDriverBookingWhenRepliedText?: string;
  sequenceResponseRates: SequenceResponseRateRow[];
};

type RequestSignal = {
  ts: number;
  triggerId?: string;
  fromBot: boolean;
};

type ReportEntry = {
  ts: number;
  report: string;
  runLabel: string;
  dayKey: string;
  dayLabel: string;
  monthKey: string;
  monthLabel: string;
  compactSummary: string;
  metrics: ReportMetrics;
};

export type CanvasSeedEntry = {
  report: string;
  runLabel: string;
  ts: number;
};

type StoredReportEntry = {
  report: string;
  runLabel: string;
  ts: number;
};

type ReportStorePayload = {
  entries: StoredReportEntry[];
  updated_at: number;
  version: 1;
};

export const getReportCanvasId = (): string | undefined => {
  const canvasId = process.env.ALOWARE_REPORT_CANVAS_ID?.trim();
  return canvasId && canvasId.length > 0 ? canvasId : undefined;
};

const getArchiveCanvasId = (): string | undefined => {
  const canvasId = process.env.ALOWARE_REPORT_ARCHIVE_CANVAS_ID?.trim();
  return canvasId && canvasId.length > 0 ? canvasId : undefined;
};

const getCanvasTitle = (): string => {
  const configuredTitle = process.env.ALOWARE_REPORT_CANVAS_TITLE?.trim();
  return configuredTitle && configuredTitle.length > 0
    ? configuredTitle
    : DEFAULT_CANVAS_TITLE;
};

const getArchiveCanvasTitle = (): string => {
  const configuredTitle =
    process.env.ALOWARE_REPORT_ARCHIVE_CANVAS_TITLE?.trim();
  return configuredTitle && configuredTitle.length > 0
    ? configuredTitle
    : DEFAULT_ARCHIVE_CANVAS_TITLE;
};

export const getReportTimezone = (): string => {
  const timezone = process.env.ALOWARE_REPORT_TIMEZONE?.trim();
  return timezone && timezone.length > 0 ? timezone : DEFAULT_TIMEZONE;
};

export const getManagedCanvasKey = (): string => {
  return (
    process.env.ALOWARE_MANAGED_CANVAS_KEY?.trim() || DEFAULT_MANAGED_CANVAS_KEY
  );
};

export const getManagedSectionHeading = (): string => {
  return (
    process.env.ALOWARE_MANAGED_SECTION_HEADING?.trim() ||
    DEFAULT_MANAGED_SECTION_HEADING
  );
};

export const getArchiveCanvasKey = (): string => {
  return (
    process.env.ALOWARE_ARCHIVE_CANVAS_KEY?.trim() || DEFAULT_ARCHIVE_CANVAS_KEY
  );
};

export const getArchiveSectionHeading = (): string => {
  return (
    process.env.ALOWARE_ARCHIVE_SECTION_HEADING?.trim() ||
    DEFAULT_ARCHIVE_SECTION_HEADING
  );
};

const parsePositiveInt = (
  value: string | undefined,
  fallback: number,
  min: number,
  max: number,
): number => {
  const parsed = Number.parseInt(value || "", 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
};

const parseBoolean = (
  value: string | undefined,
  fallback: boolean,
): boolean => {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return fallback;
};

const isDurableModeEnabled = (): boolean => {
  return parseBoolean(
    process.env.ALOWARE_CANVAS_DURABLE_MODE,
    DEFAULT_DURABLE_MODE_ENABLED,
  );
};

const getReportStorePath = (): string => {
  const configuredPath = process.env.ALOWARE_REPORT_STORE_PATH?.trim();
  return configuredPath && configuredPath.length > 0
    ? configuredPath
    : DEFAULT_REPORT_STORE_PATH;
};

const getReportStoreMaxEntries = (): number => {
  return parsePositiveInt(
    process.env.ALOWARE_REPORT_STORE_MAX_ENTRIES,
    DEFAULT_REPORT_STORE_MAX_ENTRIES,
    10,
    5000,
  );
};

const getRetentionDays = (): number => {
  return parsePositiveInt(
    process.env.ALOWARE_REPORT_RETENTION_DAYS,
    DEFAULT_RETENTION_DAYS,
    1,
    3650,
  );
};

const getHistoryLookbackDays = (): number => {
  return parsePositiveInt(
    process.env.ALOWARE_REPORT_LOOKBACK_DAYS,
    DEFAULT_LOOKBACK_DAYS,
    1,
    3650,
  );
};

const getFullDetailRuns = (): number => {
  return parsePositiveInt(
    process.env.ALOWARE_REPORT_FULL_DETAIL_RUNS,
    DEFAULT_FULL_DETAIL_RUNS,
    1,
    1000,
  );
};

const getPrimaryTriggerId = (): string => {
  return (
    process.env.ALOWARE_PRIMARY_TRIGGER_ID?.trim() || DEFAULT_PRIMARY_TRIGGER_ID
  );
};

const getBackupTriggerId = (): string => {
  return (
    process.env.ALOWARE_BACKUP_TRIGGER_ID?.trim() || DEFAULT_BACKUP_TRIGGER_ID
  );
};

const getPrimaryRunLabel = (): string => {
  return (
    process.env.ALOWARE_PRIMARY_RUN_LABEL?.trim() || DEFAULT_PRIMARY_RUN_LABEL
  );
};

const getBackupRunLabel = (): string => {
  return (
    process.env.ALOWARE_BACKUP_RUN_LABEL?.trim() || DEFAULT_BACKUP_RUN_LABEL
  );
};

const getManualRunLabel = (): string => {
  return (
    process.env.ALOWARE_MANUAL_RUN_LABEL?.trim() || DEFAULT_MANUAL_RUN_LABEL
  );
};

const getMaxThreadsPerRun = (): number => {
  return parsePositiveInt(
    process.env.ALOWARE_REPORT_MAX_THREADS_PER_RUN,
    DEFAULT_REPORT_MAX_THREADS_PER_RUN,
    1,
    500,
  );
};

const getThreadFetchConcurrency = (): number => {
  return parsePositiveInt(
    process.env.ALOWARE_REPORT_THREAD_FETCH_CONCURRENCY,
    DEFAULT_REPORT_THREAD_FETCH_CONCURRENCY,
    1,
    12,
  );
};

const getStateBufferSeconds = (): number => {
  return parsePositiveInt(
    process.env.ALOWARE_REPORT_STATE_BUFFER_SECONDS,
    DEFAULT_REPORT_STATE_BUFFER_SECONDS,
    0,
    86_400,
  );
};

const loadReportStoreEntries = async (): Promise<StoredReportEntry[]> => {
  const storePath = getReportStorePath();
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as ReportStorePayload;
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    return entries
      .filter((entry) => Number.isFinite(entry.ts) && entry.ts > 0)
      .filter((entry) => typeof entry.report === "string")
      .filter((entry) => typeof entry.runLabel === "string")
      .map((entry) => ({
        report: entry.report,
        runLabel: entry.runLabel,
        ts: Math.floor(entry.ts),
      }));
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    if (code === "ENOENT") {
      return [];
    }
    return [];
  }
};

const saveReportStoreEntries = async (
  entries: StoredReportEntry[],
): Promise<void> => {
  const storePath = getReportStorePath();
  const payload: ReportStorePayload = {
    version: 1,
    updated_at: Math.floor(Date.now() / 1000),
    entries,
  };
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const upsertReportStoreEntry = async (
  entry: StoredReportEntry,
): Promise<StoredReportEntry[]> => {
  const existingEntries = await loadReportStoreEntries();
  const normalizedEntry: StoredReportEntry = {
    ...entry,
    ts: Math.floor(entry.ts),
  };
  const byTs = new Map<number, StoredReportEntry>();
  for (const current of existingEntries) {
    byTs.set(current.ts, current);
  }
  byTs.set(normalizedEntry.ts, normalizedEntry);

  const normalized = [...byTs.values()]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, getReportStoreMaxEntries());

  await saveReportStoreEntries(normalized);
  return normalized;
};

const isDailyReportRequest = (prompt: string): boolean => {
  return DAILY_REPORT_PROMPT_PATTERN.test(prompt);
};

const isDailyReportText = (report: string): boolean => {
  return DAILY_REPORT_TITLE_PATTERN.test(report);
};

const parseTs = (value?: string): number => {
  if (!value) {
    return 0;
  }
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const formatDateTime = (ts: number, timezone: string): string => {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: true,
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ts * 1000));
};

const formatTime = (ts: number, timezone: string): string => {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: true,
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(ts * 1000));
};

const getDateParts = (
  ts: number,
  timezone: string,
): { year: string; month: string; day: string } => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(ts * 1000));

  const getPart = (type: "year" | "month" | "day"): string => {
    return parts.find((part) => part.type === type)?.value || "00";
  };

  return {
    year: getPart("year"),
    month: getPart("month"),
    day: getPart("day"),
  };
};

const getDayKey = (ts: number, timezone: string): string => {
  const parts = getDateParts(ts, timezone);
  return `${parts.year}-${parts.month}-${parts.day}`;
};

const getMonthKey = (ts: number, timezone: string): string => {
  const parts = getDateParts(ts, timezone);
  return `${parts.year}-${parts.month}`;
};

const getDayLabel = (ts: number, timezone: string): string => {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "short",
    day: "2-digit",
    year: "numeric",
  }).format(new Date(ts * 1000));
};

const getMonthLabel = (ts: number, timezone: string): string => {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    month: "long",
    year: "numeric",
  }).format(new Date(ts * 1000));
};

const extractInt = (text: string, pattern: RegExp): number | undefined => {
  const match = text.match(pattern);
  if (!match?.[1]) {
    return undefined;
  }
  const value = Number.parseInt(match[1], 10);
  return Number.isNaN(value) ? undefined : value;
};

const extractFloat = (text: string, pattern: RegExp): number | undefined => {
  const match = text.match(pattern);
  if (!match?.[1]) {
    return undefined;
  }
  const value = Number.parseFloat(match[1]);
  return Number.isNaN(value) ? undefined : value;
};

const toPercentText = (value: number | undefined): string | undefined => {
  if (typeof value !== "number") {
    return undefined;
  }
  return `${value.toFixed(1)}%`;
};

const extractFirstInt = (
  text: string,
  patterns: RegExp[],
): number | undefined => {
  for (const pattern of patterns) {
    const value = extractInt(text, pattern);
    if (typeof value === "number") {
      return value;
    }
  }
  return undefined;
};

const extractFirstFloat = (
  text: string,
  patterns: RegExp[],
): number | undefined => {
  for (const pattern of patterns) {
    const value = extractFloat(text, pattern);
    if (typeof value === "number") {
      return value;
    }
  }
  return undefined;
};

type RepSnapshotMetrics = {
  booked?: number;
  bookingRatePerConversationPct?: number;
  bookingRatePerReplyPct?: number;
  optOuts?: number;
  outboundConversations?: number;
  replyRatePct?: number;
  rolling7DayBookingPer100?: number;
};

const extractRepSnapshotMetrics = (block: string): RepSnapshotMetrics => {
  const replyRateFromInlineCount = parseRatePercent(
    block.match(/- Conversations replied\s*\(24h\):\s*\d+\s*\(([0-9.]+%)\)/i)?.[1],
  );
  const replyRateFromDirectLine = parseRatePercent(
    block.match(/- Reply Rate:\s*([0-9.]+%)/i)?.[1],
  );

  return {
    outboundConversations: extractFirstInt(block, [
      /- Outbound conversations started\s*\(24h\):\s*(\d+)/i,
      /- Outbound Conversations:\s*(\d+)/i,
    ]),
    replyRatePct:
      replyRateFromInlineCount ??
      replyRateFromDirectLine,
    booked: extractFirstInt(block, [
      /- Calls booked\s*\(24h\):\s*(\d+)/i,
      /- Bookings:\s*(\d+)/i,
    ]),
    optOuts: extractFirstInt(block, [
      /- Total opt-out conversations\s*\(24h\):\s*(\d+)/i,
      /- Opt[-\s]?Outs?:\s*(\d+)/i,
    ]),
    bookingRatePerConversationPct: extractFirstFloat(block, [
      /- Booking Rate Per Conversation:\s*([0-9.]+)%/i,
    ]),
    bookingRatePerReplyPct: extractFirstFloat(block, [
      /- Booking Rate Per Reply:\s*([0-9.]+)%/i,
    ]),
    rolling7DayBookingPer100: extractFirstFloat(block, [
      /- Rolling 7 Day Booking Per 100 Conversations:\s*([0-9.]+)/i,
    ]),
  };
};

type BookingDriverSnapshot = {
  bookingWhenRepliedText?: string;
  label?: string;
  replyRateText?: string;
};

const extractTopBookingDriver = (report: string): BookingDriverSnapshot => {
  const bookingDriverBlock = report.match(
    /\*Top Booking Driver\*([\s\S]*?)(?=\n\*[^\n]+\*|$)/i,
  )?.[1];

  if (!bookingDriverBlock) {
    return {};
  }

  const label =
    bookingDriverBlock.match(/- Message Type:\s*(.+)/i)?.[1]?.trim() ||
    undefined;
  const replyRateText =
    bookingDriverBlock.match(/- Reply Rate:\s*([0-9.]+%)/i)?.[1]?.trim() ||
    undefined;
  const bookingWhenRepliedText =
    bookingDriverBlock
      .match(/- Booking When Replied:\s*([0-9.]+%)/i)?.[1]
      ?.trim() || undefined;

  return {
    bookingWhenRepliedText,
    label,
    replyRateText,
  };
};

const extractFallbackGlobalTotals = (
  report: string,
): {
  booked?: number;
  optOuts?: number;
  outboundConversations?: number;
  replyRatePct?: number;
} => {
  const outboundConversations = extractFirstInt(report, [
    /- Outbound conversations started\s*\(24h\):\s*(\d+)/i,
  ]);
  const booked = extractFirstInt(report, [
    /- Calls booked\s*\(24h\):\s*(\d+)/i,
  ]);
  const optOuts = extractFirstInt(report, [
    /- Total opt-out conversations\s*\(24h\):\s*(\d+)/i,
  ]);
  const replyRatePct = parseRatePercent(
    report.match(
      /- Conversations replied\s*\(24h\):\s*\d+\s*\(([0-9.]+%)\)/i,
    )?.[1],
  );
  return {
    outboundConversations,
    booked,
    optOuts,
    replyRatePct,
  };
};

const extractRepBlocks = (report: string): string[] => {
  const blocks = report.match(
    /\*Rep:\s+[^\n]+\*[\s\S]*?(?=\n\*Rep:\s+[^\n]+\*|$)/g,
  );
  return blocks || [];
};

const SEQUENCE_RESPONSE_RATE_LINE_PATTERN =
  /^-\s*(.+?):\s*sent\s+(\d+).*?(?:replies(?:\s+received)?|replied)\s+(\d+)\s*\(([0-9.]+)%[^)]*\).+?book(?:ings?|ed)\s+(\d+).+?opt-outs\s+(\d+)/i;

const extractSequenceResponseRates = (
  report: string,
): SequenceResponseRateRow[] => {
  const byLabel = new Map<
    string,
    {
      booked: number;
      messagesSent: number;
      optOuts: number;
      repliesReceived: number;
    }
  >();

  for (const rawLine of report.split("\n")) {
    const line = rawLine.trim();
    const match = line.match(SEQUENCE_RESPONSE_RATE_LINE_PATTERN);
    if (!match) {
      continue;
    }

    const label = match[1]?.trim();
    if (!label) {
      continue;
    }

    const messagesSent = Number.parseInt(match[2] || "", 10);
    const repliesReceived = Number.parseInt(match[3] || "", 10);
    const booked = Number.parseInt(match[5] || "", 10);
    const optOuts = Number.parseInt(match[6] || "", 10);
    if (
      [messagesSent, repliesReceived, booked, optOuts].some((value) =>
        Number.isNaN(value),
      )
    ) {
      continue;
    }

    const current = byLabel.get(label) || {
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

  return [...byLabel.entries()]
    .map(([label, values]) => ({
      label,
      messagesSent: values.messagesSent,
      repliesReceived: values.repliesReceived,
      booked: values.booked,
      optOuts: values.optOuts,
      replyRatePct:
        values.messagesSent > 0
          ? (values.repliesReceived / values.messagesSent) * 100
          : 0,
    }))
    .sort((a, b) => {
      if (b.replyRatePct !== a.replyRatePct) {
        return b.replyRatePct - a.replyRatePct;
      }
      if (b.messagesSent !== a.messagesSent) {
        return b.messagesSent - a.messagesSent;
      }
      return a.label.localeCompare(b.label);
    });
};

const extractMetrics = (report: string): ReportMetrics => {
  const repBlocks = extractRepBlocks(report);
  const sourceBlocks = repBlocks.length > 0 ? repBlocks : [report];
  const repMetrics = sourceBlocks.map(extractRepSnapshotMetrics);
  const fallbackTotals = extractFallbackGlobalTotals(report);
  const topBookingDriver = extractTopBookingDriver(report);

  const aggregatedOutboundConversations = repMetrics.reduce(
    (sum, metric) => sum + (metric.outboundConversations || 0),
    0,
  );
  const aggregatedBooked = repMetrics.reduce(
    (sum, metric) => sum + (metric.booked || 0),
    0,
  );
  const aggregatedOptOuts = repMetrics.reduce(
    (sum, metric) => sum + (metric.optOuts || 0),
    0,
  );

  const replyRateDenominator = repMetrics.reduce((sum, metric) => {
    if (
      typeof metric.outboundConversations !== "number" ||
      typeof metric.replyRatePct !== "number"
    ) {
      return sum;
    }
    return sum + metric.outboundConversations;
  }, 0);
  const replyRateNumerator = repMetrics.reduce((sum, metric) => {
    if (
      typeof metric.outboundConversations !== "number" ||
      typeof metric.replyRatePct !== "number"
    ) {
      return sum;
    }
    return sum + metric.outboundConversations * (metric.replyRatePct / 100);
  }, 0);
  const aggregatedReplyRatePct =
    replyRateDenominator > 0
      ? (replyRateNumerator / replyRateDenominator) * 100
      : undefined;

  const outboundConversations =
    aggregatedOutboundConversations > 0
      ? aggregatedOutboundConversations
      : fallbackTotals.outboundConversations;
  const booked =
    aggregatedBooked > 0 || typeof fallbackTotals.booked !== "number"
      ? aggregatedBooked
      : fallbackTotals.booked;
  const optOuts =
    aggregatedOptOuts > 0 || typeof fallbackTotals.optOuts !== "number"
      ? aggregatedOptOuts
      : fallbackTotals.optOuts;
  const replyRatePct = aggregatedReplyRatePct ?? fallbackTotals.replyRatePct;

  const bookingRatePerConversationPct =
    typeof outboundConversations === "number" &&
    outboundConversations > 0 &&
    typeof booked === "number"
      ? (booked / outboundConversations) * 100
      : undefined;
  const aggregatedBookingRatePerReplyPct =
    replyRateNumerator > 0 && typeof booked === "number"
      ? (booked / replyRateNumerator) * 100
      : undefined;
  const bookingRatePerReplyPct =
    aggregatedBookingRatePerReplyPct ??
    (() => {
      const withBookingRate = repMetrics.find(
        (metric) => typeof metric.bookingRatePerReplyPct === "number",
      );
      return withBookingRate?.bookingRatePerReplyPct;
    })();

  // Multi-rep rolling 7d needs per-rep 7d denominators which are not always in this report format.
  const rolling7DayBookingPer100 =
    repMetrics.length === 1 &&
    typeof repMetrics[0].rolling7DayBookingPer100 === "number"
      ? repMetrics[0].rolling7DayBookingPer100
      : extractFirstFloat(report, [
          /- Rolling 7 Day Booking Per 100 Conversations:\s*([0-9.]+)/i,
        ]);

  return {
    outboundConversations,
    replyRateText: toPercentText(replyRatePct),
    booked: typeof booked === "number" ? booked : 0,
    optOuts: typeof optOuts === "number" ? optOuts : 0,
    bookingRatePerConversationText: toPercentText(
      bookingRatePerConversationPct,
    ),
    bookingRatePerReplyText: toPercentText(bookingRatePerReplyPct),
    rolling7DayBookingPer100,
    topBookingDriverLabel: topBookingDriver.label,
    topBookingDriverReplyRateText: topBookingDriver.replyRateText,
    topBookingDriverBookingWhenRepliedText:
      topBookingDriver.bookingWhenRepliedText,
    sequenceResponseRates: extractSequenceResponseRates(report),
  };
};

const buildCompactSummary = (metrics: ReportMetrics): string => {
  const chunks: string[] = [];
  if (typeof metrics.outboundConversations === "number") {
    chunks.push(`Outbound ${metrics.outboundConversations}`);
  }
  if (metrics.replyRateText) {
    chunks.push(`Reply ${metrics.replyRateText}`);
  }
  if (typeof metrics.booked === "number") {
    chunks.push(`Booked ${metrics.booked}`);
  }
  if (typeof metrics.optOuts === "number") {
    chunks.push(`Opt-outs ${metrics.optOuts}`);
  }
  return chunks.length > 0 ? chunks.join(" | ") : "Summary unavailable";
};

const formatCount = (value: number | undefined): string => {
  return typeof value === "number" ? value.toString() : "n/a";
};

const formatRate = (value: string | undefined): string => {
  return value && value.length > 0 ? value : "n/a";
};

const formatDecimal = (value: number | undefined): string => {
  return typeof value === "number" ? value.toFixed(1) : "n/a";
};

const parseRatePercent = (value: string | undefined): number | undefined => {
  if (!value) {
    return undefined;
  }
  const match = value.match(/([0-9]+(?:\.[0-9]+)?)\s*%/);
  if (!match?.[1]) {
    return undefined;
  }
  const parsed = Number.parseFloat(match[1]);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const hasMeaningfulPerformanceChange = (
  latest: ReportEntry,
  candidate: ReportEntry,
): boolean => {
  const compareNumber = (
    a: number | undefined,
    b: number | undefined,
  ): boolean => {
    if (typeof a === "number" || typeof b === "number") {
      return a !== b;
    }
    return false;
  };
  if (
    compareNumber(
      latest.metrics.outboundConversations,
      candidate.metrics.outboundConversations,
    )
  ) {
    return true;
  }
  if (compareNumber(latest.metrics.booked, candidate.metrics.booked)) {
    return true;
  }
  if (compareNumber(latest.metrics.optOuts, candidate.metrics.optOuts)) {
    return true;
  }

  const latestReplyRate = parseRatePercent(latest.metrics.replyRateText);
  const candidateReplyRate = parseRatePercent(candidate.metrics.replyRateText);
  if (
    typeof latestReplyRate === "number" ||
    typeof candidateReplyRate === "number"
  ) {
    if (
      typeof latestReplyRate !== "number" ||
      typeof candidateReplyRate !== "number"
    ) {
      return true;
    }
    if (Math.abs(latestReplyRate - candidateReplyRate) >= 0.5) {
      return true;
    }
  }

  const latestBookingRate = parseRatePercent(
    latest.metrics.bookingRatePerConversationText,
  );
  const candidateBookingRate = parseRatePercent(
    candidate.metrics.bookingRatePerConversationText,
  );
  if (
    typeof latestBookingRate === "number" ||
    typeof candidateBookingRate === "number"
  ) {
    if (
      typeof latestBookingRate !== "number" ||
      typeof candidateBookingRate !== "number"
    ) {
      return true;
    }
    if (Math.abs(latestBookingRate - candidateBookingRate) >= 0.5) {
      return true;
    }
  }

  if (
    compareNumber(
      latest.metrics.rolling7DayBookingPer100,
      candidate.metrics.rolling7DayBookingPer100,
    )
  ) {
    return true;
  }

  const latestSequenceFingerprint = latest.metrics.sequenceResponseRates
    .map(
      (row) =>
        `${row.label}:${row.messagesSent}:${row.repliesReceived}:${row.booked}:${row.optOuts}`,
    )
    .join("|");
  const candidateSequenceFingerprint = candidate.metrics.sequenceResponseRates
    .map(
      (row) =>
        `${row.label}:${row.messagesSent}:${row.repliesReceived}:${row.booked}:${row.optOuts}`,
    )
    .join("|");
  if (latestSequenceFingerprint !== candidateSequenceFingerprint) {
    return true;
  }

  const hasAnyMetric =
    typeof latest.metrics.outboundConversations === "number" ||
    typeof latest.metrics.booked === "number" ||
    typeof latest.metrics.optOuts === "number" ||
    typeof parseRatePercent(latest.metrics.replyRateText) === "number" ||
    typeof parseRatePercent(latest.metrics.bookingRatePerConversationText) ===
      "number" ||
    typeof latest.metrics.rolling7DayBookingPer100 === "number" ||
    typeof candidate.metrics.outboundConversations === "number" ||
    typeof candidate.metrics.booked === "number" ||
    typeof candidate.metrics.optOuts === "number" ||
    typeof parseRatePercent(candidate.metrics.replyRateText) === "number" ||
    typeof parseRatePercent(
      candidate.metrics.bookingRatePerConversationText,
    ) === "number" ||
    typeof candidate.metrics.rolling7DayBookingPer100 === "number" ||
    latest.metrics.sequenceResponseRates.length > 0 ||
    candidate.metrics.sequenceResponseRates.length > 0;
  if (!hasAnyMetric) {
    return (
      latest.report.replace(/\s+/g, " ").trim() !==
      candidate.report.replace(/\s+/g, " ").trim()
    );
  }

  return false;
};

const sanitizeInline = (value: string): string => {
  return value.replace(/\|/g, "\\|").replace(/\s+/g, " ").trim();
};

const stripBulletPrefix = (line: string): string => {
  return line.replace(/^[-*•]\s*/, "").trim();
};

const extractSectionBody = (
  report: string,
  sectionHeadingPattern: RegExp,
): string => {
  const match = report.match(sectionHeadingPattern);
  if (!match || typeof match.index !== "number") {
    return "";
  }
  const start = match.index + match[0].length;
  const nextSectionMatch = report
    .slice(start)
    .match(/\n\s*\*?\d+\)?\s+[A-Z][^\n]*\n/i);
  if (!nextSectionMatch?.index) {
    return report.slice(start).trim();
  }
  return report.slice(start, start + nextSectionMatch.index).trim();
};

const extractRecommendedActions = (report: string): string[] => {
  const sectionBody = extractSectionBody(
    report,
    /\n\s*\*?8\)?\s*RECOMMENDED ACTIONS[^\n]*\n/i,
  );
  if (!sectionBody) {
    return [];
  }

  return sectionBody
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^[-*•]\s+/.test(line))
    .map((line) => stripBulletPrefix(line))
    .filter((line) => line.length > 0)
    .slice(0, 8);
};

const isDailyReportMessage = (message: HistoryMessage): boolean => {
  return (
    typeof message.text === "string" &&
    DAILY_REPORT_TITLE_PATTERN.test(message.text)
  );
};

const isDailyReportRequestMessage = (message: HistoryMessage): boolean => {
  if (typeof message.text !== "string") {
    return false;
  }
  if (
    !DAILY_REPORT_REQUEST_PATTERN.test(message.text) &&
    !/\bdaily report\b/i.test(message.text)
  ) {
    return false;
  }
  return true;
};

const dedupeEntries = (entries: ReportEntry[]): ReportEntry[] => {
  const sorted = [...entries].sort((a, b) => a.ts - b.ts);
  const deduped: ReportEntry[] = [];

  for (const entry of sorted) {
    const last = deduped[deduped.length - 1];
    if (last && entry.ts - last.ts <= 180 && entry.report === last.report) {
      continue;
    }
    deduped.push(entry);
  }
  return deduped;
};

const isNearPrimaryRunTime = (ts: number, timezone: string): boolean => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(ts * 1000));
  const hour = Number.parseInt(
    parts.find((part) => part.type === "hour")?.value || "",
    10,
  );
  const minute = Number.parseInt(
    parts.find((part) => part.type === "minute")?.value || "",
    10,
  );
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return false;
  }
  if (hour !== 16) {
    return false;
  }
  return minute <= 15;
};

const classifyRunLabel = ({
  fromBot,
  triggerId,
  ts,
  timezone,
}: {
  fromBot: boolean;
  triggerId?: string;
  ts: number;
  timezone: string;
}): string => {
  if (triggerId && triggerId === getPrimaryTriggerId()) {
    return getPrimaryRunLabel();
  }
  if (triggerId && triggerId === getBackupTriggerId()) {
    return getBackupRunLabel();
  }
  if (fromBot && isNearPrimaryRunTime(ts, timezone)) {
    return getPrimaryRunLabel();
  }
  if (triggerId) {
    return "Scheduled (other)";
  }
  if (fromBot) {
    return getBackupRunLabel();
  }
  return getManualRunLabel();
};

const toEntry = (
  ts: number,
  report: string,
  signal: RequestSignal | undefined,
  timezone: string,
): ReportEntry => {
  const metrics = extractMetrics(report);
  return {
    ts,
    report,
    runLabel: classifyRunLabel({
      fromBot: signal?.fromBot || false,
      triggerId: signal?.triggerId,
      ts,
      timezone,
    }),
    dayKey: getDayKey(ts, timezone),
    dayLabel: getDayLabel(ts, timezone),
    monthKey: getMonthKey(ts, timezone),
    monthLabel: getMonthLabel(ts, timezone),
    metrics,
    compactSummary: buildCompactSummary(metrics),
  };
};

const toEntryWithRunLabel = (
  ts: number,
  report: string,
  runLabel: string | undefined,
  timezone: string,
): ReportEntry => {
  const metrics = extractMetrics(report);
  const normalizedRunLabel = runLabel?.trim();
  return {
    ts,
    report,
    runLabel:
      normalizedRunLabel && normalizedRunLabel.length > 0
        ? normalizedRunLabel
        : getManualRunLabel(),
    dayKey: getDayKey(ts, timezone),
    dayLabel: getDayLabel(ts, timezone),
    monthKey: getMonthKey(ts, timezone),
    monthLabel: getMonthLabel(ts, timezone),
    metrics,
    compactSummary: buildCompactSummary(metrics),
  };
};

const findBestSignalForTs = (
  signals: RequestSignal[],
  ts: number,
): RequestSignal | undefined => {
  if (signals.length === 0) {
    return undefined;
  }

  let low = 0;
  let high = signals.length - 1;
  let bestIndex = -1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (signals[mid].ts <= ts) {
      bestIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  if (bestIndex === -1) {
    return undefined;
  }

  const candidate = signals[bestIndex];
  if (ts - candidate.ts > REQUEST_MATCH_WINDOW_SECONDS) {
    return undefined;
  }
  return candidate;
};

const buildEntriesFromHistory = ({
  messages,
  currentReport,
  currentReportTs,
  timezone,
}: {
  messages: HistoryMessage[];
  currentReport: string;
  currentReportTs?: number;
  timezone: string;
}): ReportEntry[] => {
  const requestSignals = messages
    .filter(isDailyReportRequestMessage)
    .map((message) => ({
      fromBot: Boolean(message.bot_id) || message.subtype === "bot_message",
      ts: parseTs(message.ts),
      triggerId: message.trigger_id,
    }))
    .filter((signal) => signal.ts > 0)
    .sort((a, b) => a.ts - b.ts);

  const reportEntries = messages
    .filter(isDailyReportMessage)
    .map((message) => {
      const ts = parseTs(message.ts);
      if (ts <= 0 || !message.text) {
        return undefined;
      }
      const signal = findBestSignalForTs(requestSignals, ts);
      return toEntry(ts, message.text, signal, timezone);
    })
    .filter((entry): entry is ReportEntry => Boolean(entry));

  // Include the in-flight report in case history indexing is delayed.
  const currentTs =
    typeof currentReportTs === "number" && currentReportTs > 0
      ? currentReportTs
      : Math.floor(Date.now() / 1000);
  const signal = findBestSignalForTs(requestSignals, currentTs);
  reportEntries.push(toEntry(currentTs, currentReport, signal, timezone));

  return dedupeEntries(reportEntries);
};

const formatReportForCanvas = (report: string): string => {
  const rawLines = report.replaceAll("\r", "").split("\n");
  const lines: string[] = [];
  let previousBlank = false;

  for (const rawLine of rawLines) {
    const line = rawLine.trimEnd();
    if (line.length === 0) {
      if (!previousBlank) {
        lines.push("");
      }
      previousBlank = true;
      continue;
    }

    previousBlank = false;
    const fullyBold = line.match(/^\*(.+)\*$/);
    if (fullyBold?.[1]) {
      lines.push(`**${fullyBold[1].trim()}**`);
      continue;
    }

    lines.push(line);
  }

  while (lines.length > 0 && lines[lines.length - 1].length === 0) {
    lines.pop();
  }

  return lines.join("\n");
};

const buildMainManagedMarkdown = ({
  entries,
  timezone,
  retentionDays,
}: {
  entries: ReportEntry[];
  timezone: string;
  retentionDays: number;
}): string => {
  const sectionHeading = getManagedSectionHeading();
  const managedKey = getManagedCanvasKey();
  if (entries.length === 0) {
    return [
      `## ${sectionHeading}`,
      `Managed key: ${managedKey}`,
      "",
      "No report runs found in the current retention window.",
    ].join("\n");
  }

  const sorted = [...entries].sort((a, b) => b.ts - a.ts);
  const latest = sorted[0];
  const scheduledCount = sorted.filter((entry) => {
    return entry.runLabel !== getManualRunLabel();
  }).length;
  const manualCount = sorted.length - scheduledCount;
  const optOutSequenceRows = latest.metrics.sequenceResponseRates
    .filter((row) => row.optOuts > 0)
    .sort((a, b) => {
      if (b.optOuts !== a.optOuts) {
        return b.optOuts - a.optOuts;
      }
      return b.replyRatePct - a.replyRatePct;
    });

  const lines: string[] = [
    "# Analysis Log Report",
    "",
    `## ${sectionHeading}`,
    `Managed key: ${managedKey}`,
    "",
    `Last updated: ${formatDateTime(Math.floor(Date.now() / 1000), timezone)} (${timezone})`,
    `Retention window: ${retentionDays} day(s)`,
    `Runs in window: ${sorted.length} total (${scheduledCount} scheduled, ${manualCount} manual)`,
    "",
    "### What This Channel Is",
    "This channel is the operating feed for all inbound and outbound Aloware SMS activity, giving full visibility into both sides of every conversation.",
    "",
    "### What We Track Here",
    "- Reply rates by message and structure",
    "- Sequence-level send, reply, booking, and opt-out performance",
    "- Booking conversion by message structure",
    "- Opt-outs tied to specific campaigns and sequences",
    "- Booking-ready and high-intent lead signals",
    "",
    "### Canvases Used In This Channel",
    "1. Analysis Log Report (this canvas): managed archive of daily auto-generated SMS snapshots and KPI rollups.",
    "2. AI Summary Log: managed record of daily summary output plus Claude/ChatGPT analysis.",
    "3. Channel guide canvas (What This Channel Is): quick operating notes and ownership context.",
    "",
    "### Daily Report Run Time (CST)",
    `- Primary scheduled run: ${getPrimaryRunLabel()}`,
    "",
    "### How It Works",
    "1. Aloware sends or receives an SMS.",
    "2. The SMS event is posted in this channel.",
    "3. SMS Insights runs the daily analysis report on schedule.",
    "4. The report is posted in-channel, saved to a durable store, and full-rendered to this Analysis Log Report canvas.",
    "5. Daily summary and assistant analysis are rendered into AI Summary Log using the same managed refresh pattern.",
    "",
    "### What We Use It For",
    "- Spot booking-ready leads quickly",
    "- Identify high-intent growth signals",
    "- Catch opt-out spikes early",
    "- Improve message structure and sequence strategy based on real outcomes",
    "",
    "This channel is the operating layer for visibility and optimization.",
    "",
    "---",
    "",
    "## Latest Daily Run",
    `- Run time: ${formatDateTime(latest.ts, timezone)}`,
    `- Run type: ${latest.runLabel}`,
    `- Snapshot: ${latest.compactSummary}`,
    "",
    "| Metric | Latest Value |",
    "| --- | --- |",
    `| Outbound conversations | ${formatCount(latest.metrics.outboundConversations)} |`,
    `| Reply rate | ${sanitizeInline(formatRate(latest.metrics.replyRateText))} |`,
    `| Bookings | ${formatCount(latest.metrics.booked)} |`,
    `| Opt-outs | ${formatCount(latest.metrics.optOuts)} |`,
    `| Booking rate per reply | ${sanitizeInline(formatRate(latest.metrics.bookingRatePerReplyText))} |`,
    `| 7-day booking per 100 conv. | ${sanitizeInline(formatDecimal(latest.metrics.rolling7DayBookingPer100))} |`,
    "",
  ];

  if (latest.metrics.topBookingDriverLabel) {
    lines.push("## Booking Conversion By Message Structure (Latest Run)");
    lines.push("");
    lines.push(`- Message Type: ${latest.metrics.topBookingDriverLabel}`);
    if (latest.metrics.topBookingDriverReplyRateText) {
      lines.push(
        `- Reply Rate: ${latest.metrics.topBookingDriverReplyRateText}`,
      );
    }
    if (latest.metrics.topBookingDriverBookingWhenRepliedText) {
      lines.push(
        `- Booking When Replied: ${latest.metrics.topBookingDriverBookingWhenRepliedText}`,
      );
    }
    lines.push("");
  }

  lines.push("## Performance By Sequence (Latest Run)");
  lines.push("");
  if (latest.metrics.sequenceResponseRates.length === 0) {
    lines.push("- No sequence rows found in the latest report.");
    lines.push("");
  } else {
    lines.push("| Sequence | Sent | Replies | Reply % | Booked | Opt-outs |");
    lines.push("| --- | ---: | ---: | ---: | ---: | ---: |");
    for (const row of latest.metrics.sequenceResponseRates.slice(0, 20)) {
      lines.push(
        `| ${sanitizeInline(row.label)} | ${row.messagesSent} | ${row.repliesReceived} | ${row.replyRatePct.toFixed(
          1,
        )}% | ${row.booked} | ${row.optOuts} |`,
      );
    }
    lines.push("");
  }

  lines.push("## Opt-Outs Tied To Campaigns (Latest Run)");
  lines.push("");
  if (optOutSequenceRows.length === 0) {
    lines.push("- No sequence opt-outs found in the latest run.");
    lines.push("");
  } else {
    for (const row of optOutSequenceRows.slice(0, 10)) {
      lines.push(
        `- ${row.label}: ${row.optOuts} opt-outs from ${row.messagesSent} sent (${row.replyRatePct.toFixed(
          1,
        )}% reply rate)`,
      );
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("");
  lines.push("## Daily Report Archive (Newest First)");
  lines.push(
    "> This archive keeps every daily auto-generated SMS report in the retention window.",
  );
  lines.push("");

  for (const entry of sorted) {
    lines.push(
      `### ${entry.dayLabel} - ${formatTime(entry.ts, timezone)} (${entry.runLabel})`,
    );
    lines.push("");
    lines.push(`- Snapshot: ${entry.compactSummary}`);
    lines.push("");
    lines.push(formatReportForCanvas(entry.report));
    lines.push("");
    lines.push("---");
  }

  return lines.join("\n");
};

const findCanvasIdByTitle = async ({
  client,
  channelId,
  title,
  logger,
}: {
  client: WebClient;
  channelId: string;
  title: string;
  logger: Logger;
}): Promise<string | undefined> => {
  const normalizedTitle = title.toLowerCase();
  try {
    const response = (await client.files.list({
      types: "canvas",
      channel: channelId,
      count: 100,
    })) as { files?: SlackFile[] };

    const canvas = (response.files || []).find(
      (file) => file.title?.toLowerCase() === normalizedTitle,
    );
    return canvas?.id;
  } catch (error) {
    logger.warn(`Canvas lookup failed for "${title}".`);
    logger.error(error);
    return undefined;
  }
};

const fetchChannelHistory = async ({
  client,
  channelId,
  oldest,
}: {
  client: WebClient;
  channelId: string;
  oldest: number;
}): Promise<HistoryMessage[]> => {
  const messages: HistoryMessage[] = [];
  let cursor = "";

  do {
    const response = (await client.conversations.history({
      channel: channelId,
      cursor: cursor || undefined,
      inclusive: true,
      limit: 200,
      oldest: oldest.toString(),
    })) as {
      messages?: HistoryMessage[];
      response_metadata?: { next_cursor?: string };
    };

    messages.push(...(response.messages || []));
    cursor = response.response_metadata?.next_cursor || "";
  } while (cursor);

  return messages;
};

const fetchThreadReplies = async ({
  client,
  channelId,
  threadTs,
  oldest,
}: {
  client: WebClient;
  channelId: string;
  threadTs: string;
  oldest: number;
}): Promise<HistoryMessage[]> => {
  const replies: HistoryMessage[] = [];
  let cursor = "";

  do {
    const response = (await client.conversations.replies({
      channel: channelId,
      ts: threadTs,
      cursor: cursor || undefined,
      inclusive: true,
      limit: 200,
      oldest: oldest.toString(),
    })) as {
      messages?: HistoryMessage[];
      response_metadata?: { next_cursor?: string };
    };

    replies.push(...(response.messages || []));
    cursor = response.response_metadata?.next_cursor || "";
  } while (cursor);

  return replies;
};

const mapWithConcurrency = async <Input, Output>({
  concurrency,
  items,
  mapper,
}: {
  concurrency: number;
  items: Input[];
  mapper: (item: Input) => Promise<Output>;
}): Promise<Output[]> => {
  if (items.length === 0) {
    return [];
  }

  const results = new Array<Output>(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex;
        nextIndex += 1;
        if (currentIndex >= items.length) {
          return;
        }

        results[currentIndex] = await mapper(items[currentIndex]);
      }
    }),
  );

  return results;
};

const lookupSectionIdsByText = async ({
  client,
  canvasId,
  text,
  logger,
}: {
  client: WebClient;
  canvasId: string;
  text: string;
  logger: Logger;
}): Promise<string[]> => {
  try {
    const response = (await client.apiCall("canvases.sections.lookup", {
      canvas_id: canvasId,
      criteria: {
        contains_text: text,
      },
    })) as SectionLookupResponse;

    return (response.sections || [])
      .map((section) => section.id)
      .filter((id): id is string => Boolean(id));
  } catch (error) {
    logger.warn(`Unable to lookup canvas sections for "${text}".`);
    logger.error(error);
    return [];
  }
};

const deleteSectionById = async ({
  client,
  canvasId,
  sectionId,
  logger,
}: {
  client: WebClient;
  canvasId: string;
  sectionId: string;
  logger: Logger;
}): Promise<void> => {
  try {
    await client.apiCall("canvases.edit", {
      canvas_id: canvasId,
      changes: [
        {
          operation: "delete",
          section_id: sectionId,
        },
      ],
    });
  } catch (error) {
    logger.warn(`Unable to delete canvas section ${sectionId}.`);
    logger.error(error);
  }
};

const deleteSectionsMatchingText = async ({
  client,
  canvasId,
  text,
  logger,
}: {
  client: WebClient;
  canvasId: string;
  text: string;
  logger: Logger;
}): Promise<void> => {
  const pause = async (ms: number): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  };

  const maxPasses = 25;
  let emptyPasses = 0;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const ids = await lookupSectionIdsByText({
      client,
      canvasId,
      text,
      logger,
    });
    if (ids.length === 0) {
      emptyPasses += 1;
      if (emptyPasses >= 2) {
        return;
      }
      await pause(150);
      continue;
    }
    emptyPasses = 0;
    for (const sectionId of ids) {
      await deleteSectionById({
        client,
        canvasId,
        sectionId,
        logger,
      });
    }
    await pause(120);
  }
  logger.warn(`Reached section cleanup pass limit while removing "${text}".`);
};

export const upsertManagedSection = async ({
  client,
  canvasId,
  heading,
  managedKey,
  legacyContainsText,
  markdown,
  logger,
}: {
  client: WebClient;
  canvasId: string;
  heading: string;
  managedKey: string;
  legacyContainsText: string[];
  markdown: string;
  logger: Logger;
}): Promise<void> => {
  await deleteSectionsMatchingText({
    client,
    canvasId,
    text: heading,
    logger,
  });

  await deleteSectionsMatchingText({
    client,
    canvasId,
    text: `Managed key: ${managedKey}`,
    logger,
  });

  const additionalManagedLookupTexts = [
    managedKey,
    `| Managed key | ${managedKey} |`,
    `Managed key | ${managedKey}`,
  ];
  for (const markerText of additionalManagedLookupTexts) {
    await deleteSectionsMatchingText({
      client,
      canvasId,
      text: markerText,
      logger,
    });
  }

  for (const marker of legacyContainsText) {
    await deleteSectionsMatchingText({
      client,
      canvasId,
      text: marker,
      logger,
    });
  }

  await client.apiCall("canvases.edit", {
    canvas_id: canvasId,
    changes: [
      {
        operation: "insert_at_start",
        document_content: {
          type: "markdown",
          markdown,
        },
      },
    ],
  });
};

const buildArchiveManagedMarkdown = ({
  entries,
  timezone,
  lookbackDays,
  retentionDays,
}: {
  entries: ReportEntry[];
  timezone: string;
  lookbackDays: number;
  retentionDays: number;
}): string => {
  const sectionHeading = getArchiveSectionHeading();
  const managedKey = getArchiveCanvasKey();
  if (entries.length === 0) {
    return [
      `## ${sectionHeading}`,
      `Managed key: ${managedKey}`,
      "",
      `No runs older than ${retentionDays} days were found in the ${lookbackDays}-day history window.`,
    ].join("\n");
  }

  const groupedByMonth = new Map<string, ReportEntry[]>();
  for (const entry of entries) {
    const monthEntries = groupedByMonth.get(entry.monthKey) || [];
    monthEntries.push(entry);
    groupedByMonth.set(entry.monthKey, monthEntries);
  }

  const lines: string[] = [
    `## ${sectionHeading}`,
    `Managed key: ${managedKey}`,
    `Last updated: ${formatDateTime(Math.floor(Date.now() / 1000), timezone)} (${timezone})`,
    `Archive includes runs older than ${retentionDays} days (loaded from last ${lookbackDays} days).`,
    "",
  ];

  for (const [, monthEntries] of [...groupedByMonth.entries()].sort((a, b) =>
    b[0].localeCompare(a[0]),
  )) {
    const sorted = monthEntries.sort((a, b) => b.ts - a.ts);
    const monthLabel = sorted[0].monthLabel;
    const bookedTotal = sorted.reduce(
      (sum, entry) => sum + (entry.metrics.booked || 0),
      0,
    );
    const optOutTotal = sorted.reduce(
      (sum, entry) => sum + (entry.metrics.optOuts || 0),
      0,
    );
    lines.push(`### ${monthLabel} (${sorted.length} runs)`);
    lines.push(
      `Monthly totals: booked ${bookedTotal}, opt-outs ${optOutTotal}`,
    );
    for (const entry of sorted) {
      lines.push(
        `- ${formatDateTime(entry.ts, timezone)} | ${entry.runLabel} | ${entry.compactSummary}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
};

const resolveArchiveCanvasId = async ({
  client,
  channelId,
  logger,
}: {
  client: WebClient;
  channelId: string;
  logger: Logger;
}): Promise<string | undefined> => {
  const configuredId = getArchiveCanvasId();
  if (configuredId) {
    return configuredId;
  }

  const archiveTitle = getArchiveCanvasTitle();
  const existingId = await findCanvasIdByTitle({
    client,
    channelId,
    title: archiveTitle,
    logger,
  });
  if (existingId) {
    return existingId;
  }

  try {
    const response = (await client.apiCall("canvases.create", {
      title: archiveTitle,
      channel_id: channelId,
      document_content: {
        type: "markdown",
        markdown: `# ${archiveTitle}\n\nAuto-created by SMS Insights.\n`,
      },
    })) as CanvasCreateResponse;

    const createdId = response.canvas_id || response.canvas?.id || response.id;
    if (!createdId) {
      logger.warn(
        "Archive canvas creation succeeded but no canvas id was returned.",
      );
      return undefined;
    }
    return createdId;
  } catch (error) {
    logger.warn(`Failed to create archive canvas "${archiveTitle}".`);
    logger.error(error);
    return undefined;
  }
};

const upsertCanvasLogsFromEntries = async ({
  canvasId,
  channelId,
  client,
  entries,
  logger,
  lookbackDays,
  retentionDays,
  timezone,
}: {
  canvasId: string;
  channelId: string;
  client: WebClient;
  entries: ReportEntry[];
  logger: Logger;
  lookbackDays: number;
  retentionDays: number;
  timezone: string;
}): Promise<void> => {
  const cutoff = Math.floor(Date.now() / 1000) - retentionDays * DAY_SECONDS;
  const recentEntries = entries.filter((entry) => entry.ts >= cutoff);
  const archivedEntries = entries.filter((entry) => entry.ts < cutoff);
  const mainMarkdown = buildMainManagedMarkdown({
    entries: recentEntries,
    timezone,
    retentionDays,
  });

  await upsertManagedSection({
    client,
    canvasId,
    heading: getManagedSectionHeading(),
    managedKey: getManagedCanvasKey(),
    legacyContainsText: LEGACY_MAIN_SECTION_MARKERS,
    markdown: mainMarkdown,
    logger,
  });

  if (archivedEntries.length === 0) {
    return;
  }

  const archiveCanvasId = await resolveArchiveCanvasId({
    client,
    channelId,
    logger,
  });
  if (!archiveCanvasId) {
    return;
  }

  const archiveMarkdown = buildArchiveManagedMarkdown({
    entries: archivedEntries,
    timezone,
    lookbackDays,
    retentionDays,
  });
  await upsertManagedSection({
    client,
    canvasId: archiveCanvasId,
    heading: getArchiveSectionHeading(),
    managedKey: getArchiveCanvasKey(),
    legacyContainsText: LEGACY_ARCHIVE_SECTION_MARKERS,
    markdown: archiveMarkdown,
    logger,
  });
};

export const upsertDailyReportCanvasFromSeedEntries = async ({
  channelId,
  client,
  entries,
  logger,
}: {
  channelId: string;
  client: WebClient;
  entries: CanvasSeedEntry[];
  logger: Logger;
}): Promise<boolean> => {
  const filteredEntries = entries
    .filter((entry) => Number.isFinite(entry.ts) && entry.ts > 0)
    .filter((entry) => isDailyReportText(entry.report))
    .map((entry) => ({
      report: entry.report,
      runLabel: entry.runLabel,
      ts: Math.floor(entry.ts),
    }));
  if (filteredEntries.length === 0) {
    logger.warn(
      "No valid daily report seed entries were provided for canvas backfill.",
    );
    return false;
  }

  const canvasId =
    getReportCanvasId() ||
    (await findCanvasIdByTitle({
      client,
      channelId,
      title: getCanvasTitle(),
      logger,
    }));
  if (!canvasId) {
    logger.warn(
      "Daily report canvas not found. Set ALOWARE_REPORT_CANVAS_ID or verify canvas title.",
    );
    return false;
  }

  try {
    const timezone = getReportTimezone();
    const lookbackDays = getHistoryLookbackDays();
    const retentionDays = getRetentionDays();
    const normalizedEntries = dedupeEntries(
      filteredEntries.map((entry) =>
        toEntryWithRunLabel(entry.ts, entry.report, entry.runLabel, timezone),
      ),
    );

    await upsertCanvasLogsFromEntries({
      canvasId,
      channelId,
      client,
      entries: normalizedEntries,
      logger,
      lookbackDays,
      retentionDays,
      timezone,
    });
    return true;
  } catch (error) {
    logger.warn("Failed to upsert seeded daily report entries into canvas.");
    logger.error(error);
    return false;
  }
};

export const appendDailyReportToCanvas = async ({
  client,
  logger,
  channelId,
  prompt,
  report,
  reportMessageTs,
}: {
  client: WebClient;
  logger: Logger;
  channelId: string;
  prompt: string;
  report: string;
  reportMessageTs?: string;
}): Promise<void> => {
  if (!isDailyReportRequest(prompt) || !isDailyReportText(report)) {
    return;
  }

  const canvasId =
    getReportCanvasId() ||
    (await findCanvasIdByTitle({
      client,
      channelId,
      title: getCanvasTitle(),
      logger,
    }));
  if (!canvasId) {
    logger.warn(
      "Daily report canvas not found. Set ALOWARE_REPORT_CANVAS_ID or verify canvas title.",
    );
    return;
  }

  if (isDurableModeEnabled()) {
    await runSerializedTask({
      key: `report_canvas_durable:${canvasId}`,
      task: async () => {
        const timezone = getReportTimezone();
        const reportTs =
          parseTs(reportMessageTs) || Math.floor(Date.now() / 1000);
        const runLabel = classifyRunLabel({
          fromBot: true,
          ts: reportTs,
          timezone,
        });

        const storeEntries = await upsertReportStoreEntry({
          report,
          runLabel,
          ts: reportTs,
        });

        await upsertDailyReportCanvasFromSeedEntries({
          channelId,
          client,
          entries: storeEntries,
          logger,
        });
      },
    });
    return;
  }

  await runSerializedTask({
    key: `report_canvas:${canvasId}`,
    task: async () => {
      try {
        const now = Math.floor(Date.now() / 1000);
        const timezone = getReportTimezone();
        const lookbackDays = getHistoryLookbackDays();
        const retentionDays = getRetentionDays();
        const configuredOldest = now - lookbackDays * DAY_SECONDS;
        const syncStateLookup = await timeOperation({
          logger,
          name: "canvas.read_sync_state",
          context: {
            channel_id: channelId,
          },
          fn: async () =>
            readCanvasSyncState({
              channelId,
              client,
              logger,
            }),
        });
        const syncState = syncStateLookup.state;
        const shouldRunIncremental =
          Boolean(syncState) && !syncStateLookup.corrupted;
        const effectiveOldest =
          shouldRunIncremental && syncState
            ? Math.max(
                configuredOldest,
                syncState.last_processed_report_ts - getStateBufferSeconds(),
              )
            : configuredOldest;
        const history = await timeOperation({
          logger,
          name: "canvas.fetch_channel_history",
          context: {
            channel_id: channelId,
            oldest: effectiveOldest,
          },
          fn: async () =>
            fetchChannelHistory({
              client,
              channelId,
              oldest: effectiveOldest,
            }),
        });

        const requestThreadTimestamps = history
          .filter(isDailyReportRequestMessage)
          .map((message) => message.ts)
          .filter((ts): ts is string => Boolean(ts))
          .sort((a, b) => parseTs(b) - parseTs(a));

        const threadsToHydrate =
          shouldRunIncremental && syncState
            ? (() => {
                const processedThreads = new Set(syncState.processed_thread_ts);
                return requestThreadTimestamps
                  .filter((threadTs) => {
                    const threadTsNumber = parseTs(threadTs);
                    return (
                      threadTsNumber > syncState.last_processed_report_ts &&
                      !processedThreads.has(threadTs)
                    );
                  })
                  .slice(0, getMaxThreadsPerRun());
              })()
            : requestThreadTimestamps.slice(0, 500);

        const threadReplyBatches = await timeOperation({
          logger,
          name: "canvas.fetch_thread_replies",
          context: {
            channel_id: channelId,
            thread_count: threadsToHydrate.length,
          },
          fn: async () =>
            mapWithConcurrency({
              concurrency: getThreadFetchConcurrency(),
              items: threadsToHydrate,
              mapper: async (threadTs) =>
                fetchThreadReplies({
                  client,
                  channelId,
                  threadTs,
                  oldest: effectiveOldest,
                }),
            }),
        });

        const threadRootTimestamps = new Set(threadsToHydrate);
        const threadReplies = threadReplyBatches.flatMap((batch) =>
          batch.filter((reply) => {
            if (!reply.ts) {
              return true;
            }
            return !threadRootTimestamps.has(reply.ts);
          }),
        );

        const combinedMessages = [...history, ...threadReplies];

        const allEntries = buildEntriesFromHistory({
          messages: combinedMessages,
          currentReport: report,
          currentReportTs: parseTs(reportMessageTs),
          timezone,
        });

        const cutoff = Math.floor(Date.now() / 1000) - retentionDays * DAY_SECONDS;
        const recentEntries = allEntries.filter((entry) => entry.ts >= cutoff);
        const archivedEntries = allEntries.filter((entry) => entry.ts < cutoff);

        const mainMarkdown = buildMainManagedMarkdown({
          entries: recentEntries,
          timezone,
          retentionDays,
        });

        await upsertManagedSection({
          client,
          canvasId,
          heading: getManagedSectionHeading(),
          managedKey: getManagedCanvasKey(),
          legacyContainsText: LEGACY_MAIN_SECTION_MARKERS,
          markdown: mainMarkdown,
          logger,
        });

        const latestProcessedReportTs = allEntries.reduce((maxTs, entry) => {
          return Math.max(maxTs, entry.ts);
        }, syncState?.last_processed_report_ts || 0);
        const mergedProcessedThreads = [
          ...new Set([
            ...(syncState?.processed_thread_ts || []),
            ...threadsToHydrate,
          ]),
        ];
        await timeOperation({
          logger,
          name: "canvas.upsert_sync_state",
          context: {
            channel_id: channelId,
            processed_thread_count: mergedProcessedThreads.length,
          },
          fn: async () =>
            upsertCanvasSyncState({
              channelId,
              client,
              fallbackMessageText: report,
              fallbackMessageTs: reportMessageTs,
              logger,
              stateMessageTs: syncStateLookup.stateMessageTs,
              state: {
                version: 1,
                last_processed_report_ts: latestProcessedReportTs,
                processed_thread_ts: mergedProcessedThreads,
                updated_at: now,
              },
            }),
        });

        if (archivedEntries.length > 0) {
          const archiveCanvasId = await resolveArchiveCanvasId({
            client,
            channelId,
            logger,
          });
          if (archiveCanvasId) {
            const archiveMarkdown = buildArchiveManagedMarkdown({
              entries: archivedEntries,
              timezone,
              lookbackDays,
              retentionDays,
            });
            await upsertManagedSection({
              client,
              canvasId: archiveCanvasId,
              heading: getArchiveSectionHeading(),
              managedKey: getArchiveCanvasKey(),
              legacyContainsText: LEGACY_ARCHIVE_SECTION_MARKERS,
              markdown: archiveMarkdown,
              logger,
            });
          }
        }
      } catch (error) {
        logger.warn(
          "Failed to update managed canvas logs. Verify canvases:read/canvases:write scopes and canvas access.",
        );
        logger.error(error);
      }
    },
  });
};
