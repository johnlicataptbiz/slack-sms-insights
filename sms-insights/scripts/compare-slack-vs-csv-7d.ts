import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { WebClient } from '@slack/web-api';
import {
  __debugAnalyzeRawMessagesForTests,
  buildAlowareAnalyticsReport,
} from '../services/aloware-analytics.js';

type HistoryMessage = {
  attachments?: Array<{
    fallback?: string;
    fields?: Array<{ title?: string; value?: string }>;
    title?: string;
  }>;
  text?: string;
  ts?: string;
};

type CsvTotals = {
  bySequence: Map<string, { inbound: number; outbound: number; total: number }>;
  consideredRows: number;
  nonTextRows: number;
  skippedRowsOutsideWindow: number;
  textRows: number;
  totals: { inbound: number; outbound: number; total: number };
  typeCounts: Map<string, number>;
};

type SequenceLine = {
  conversations: number;
  inbound: number;
  label: string;
  outbound: number;
  total: number;
};

const DAY_SECONDS = 24 * 60 * 60;
const WEEK_SECONDS = 7 * DAY_SECONDS;
const DEFAULT_CSV_PATH = '/Users/jl/Downloads/export-4876f0a9-aa86-4a07-886f-b3040d0f4697.csv';

const sanitize = (value: string): string => value.replace(/\s+/g, ' ').trim();

const parseEnvFile = (path: string): Map<string, string> => {
  const map = new Map<string, string>();
  if (!fs.existsSync(path)) {
    return map;
  }
  const text = fs.readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const equalsIndex = trimmed.indexOf('=');
    if (equalsIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, equalsIndex).trim();
    const value = trimmed.slice(equalsIndex + 1);
    map.set(key, value);
  }
  return map;
};

const resolveSlackBotToken = (): string => {
  if (process.env.SLACK_BOT_TOKEN?.trim()) {
    return process.env.SLACK_BOT_TOKEN.trim();
  }

  try {
    const pid = execSync(
      "pgrep -f 'node /Users/jl/Desktop/SlackCLI/my-slack-app/dist/app.js' | head -n1",
      { encoding: 'utf8' },
    ).trim();
    if (!pid) {
      throw new Error('no_running_process');
    }
    const command = execSync(`ps eww -p ${pid} -o command=`, { encoding: 'utf8' });
    const match = command.match(/SLACK_BOT_TOKEN=([^\s]+)/);
    if (!match?.[1]) {
      throw new Error('token_not_found_in_process_env');
    }
    return match[1];
  } catch {
    throw new Error(
      'Unable to resolve SLACK_BOT_TOKEN from env or running app process.',
    );
  }
};

const extractHistoryText = (message: HistoryMessage): string => {
  const direct = sanitize(message.text || '');
  if (direct.length > 0) {
    return direct;
  }
  const parts: string[] = [];
  for (const attachment of message.attachments || []) {
    if (attachment.title) {
      parts.push(sanitize(attachment.title));
    }
    for (const field of attachment.fields || []) {
      const title = sanitize(field.title || '');
      const value = sanitize((field.value || '').replace(/<[^|>]+\|([^>]+)>/g, '$1'));
      if (title && value) {
        parts.push(`${title}: ${value}`);
      } else if (value) {
        parts.push(value);
      }
    }
    if (!attachment.fields?.length && attachment.fallback) {
      parts.push(sanitize(attachment.fallback));
    }
  }
  return sanitize(parts.join(' '));
};

const parseReportTotals = (report: string) => {
  const lines = report.split('\n');
  const parseIntFromLine = (prefix: string): number => {
    const line = lines.find((candidate) => candidate.startsWith(prefix));
    if (!line) {
      return 0;
    }
    const match = line.match(/(\d+)/);
    return match ? Number(match[1]) : 0;
  };
  const parsePercentFromLine = (prefix: string): number => {
    const line = lines.find((candidate) => candidate.startsWith(prefix));
    if (!line) {
      return 0;
    }
    const match = line.match(/(-?\d+(?:\.\d+)?)%/);
    return match ? Number(match[1]) : 0;
  };

  return {
    bookings: parseIntFromLine('- Bookings:'),
    optOuts: parseIntFromLine('- Opt Outs:'),
    outboundConversations: parseIntFromLine('- Outbound Conversations:'),
    replyRatePct: parsePercentFromLine('- Reply Rate:'),
  };
};

const normalizeSequenceLabel = (value: string): string => {
  const normalized = sanitize(value);
  return normalized.length > 0 ? normalized : 'No sequence (manual/direct)';
};

const isTextType = (type: string): boolean => {
  const normalized = type.toLowerCase();
  return normalized === 'text' || normalized === 'sms' || normalized === 'mms';
};

const parseTimestampSeconds = (value: string): number => {
  const normalized = value.trim();
  if (!normalized) {
    return Number.NaN;
  }
  const parsed = Date.parse(normalized.replace(' ', 'T'));
  return Number.isNaN(parsed) ? Number.NaN : Math.floor(parsed / 1000);
};

const parseCsvWithQuotes = (raw: string, onRow: (row: string[]) => void): void => {
  let field = '';
  let inQuotes = false;
  let row: string[] = [];

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (inQuotes) {
      if (char === '"') {
        const next = raw[index + 1];
        if (next === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }
    if (char === ',') {
      row.push(field);
      field = '';
      continue;
    }
    if (char === '\n') {
      row.push(field);
      field = '';
      if (!(row.length === 1 && row[0] === '')) {
        onRow(row);
      }
      row = [];
      continue;
    }
    if (char === '\r') {
      continue;
    }
    field += char;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    onRow(row);
  }
};

const aggregateCsv = ({
  csvPath,
  nowTs,
  weekStart,
}: {
  csvPath: string;
  nowTs: number;
  weekStart: number;
}): CsvTotals => {
  const raw = fs.readFileSync(csvPath, 'utf8');
  let headers: string[] | undefined;
  let indexStartedAt = -1;
  let indexType = -1;
  let indexDirection = -1;
  let indexSequence = -1;

  const totals = { inbound: 0, outbound: 0, total: 0 };
  let consideredRows = 0;
  let nonTextRows = 0;
  let skippedRowsOutsideWindow = 0;
  let textRows = 0;
  const bySequence = new Map<string, { inbound: number; outbound: number; total: number }>();
  const typeCounts = new Map<string, number>();

  parseCsvWithQuotes(raw, (row) => {
    if (!headers) {
      headers = row.map((value) => sanitize(value).replace(/^"|"$/g, ''));
      indexStartedAt = headers.indexOf('Started At');
      indexType = headers.indexOf('Type');
      indexDirection = headers.indexOf('Direction');
      indexSequence = headers.indexOf('Sequence Name');
      return;
    }

    consideredRows += 1;
    const type = sanitize(row[indexType] || '').toLowerCase();
    typeCounts.set(type, (typeCounts.get(type) || 0) + 1);
    if (!isTextType(type)) {
      nonTextRows += 1;
      return;
    }
    textRows += 1;

    const startedAtTs = parseTimestampSeconds(sanitize(row[indexStartedAt] || ''));
    if (!Number.isFinite(startedAtTs) || startedAtTs < weekStart || startedAtTs > nowTs) {
      skippedRowsOutsideWindow += 1;
      return;
    }

    const direction = sanitize(row[indexDirection] || '').toLowerCase();
    const sequenceLabel = normalizeSequenceLabel(row[indexSequence] || '');
    const current = bySequence.get(sequenceLabel) || { inbound: 0, outbound: 0, total: 0 };
    if (direction === 'inbound') {
      current.inbound += 1;
      totals.inbound += 1;
    } else if (direction === 'outbound') {
      current.outbound += 1;
      totals.outbound += 1;
    } else {
      return;
    }
    current.total += 1;
    totals.total += 1;
    bySequence.set(sequenceLabel, current);
  });

  return {
    bySequence,
    consideredRows,
    nonTextRows,
    skippedRowsOutsideWindow,
    textRows,
    totals,
    typeCounts,
  };
};

const fetchSlackHistory = async ({
  channelId,
  client,
  weekStart,
}: {
  channelId: string;
  client: WebClient;
  weekStart: number;
}): Promise<HistoryMessage[]> => {
  const messages: HistoryMessage[] = [];
  let cursor: string | undefined;
  do {
    const result = await client.conversations.history({
      channel: channelId,
      cursor,
      inclusive: true,
      limit: 200,
      oldest: weekStart.toString(),
    });
    messages.push(...(((result.messages || []) as unknown as HistoryMessage[]) || []));
    cursor = result.response_metadata?.next_cursor || undefined;
  } while (cursor);
  return messages;
};

const topDiffLines = ({
  csvBySequence,
  slackBySequence,
}: {
  csvBySequence: Map<string, { inbound: number; outbound: number; total: number }>;
  slackBySequence: SequenceLine[];
}) => {
  const slackMap = new Map(
    slackBySequence.map((row) => [
      row.label,
      { inbound: row.inbound, outbound: row.outbound, total: row.total },
    ]),
  );
  const labels = new Set<string>([
    ...csvBySequence.keys(),
    ...slackMap.keys(),
  ]);
  const diffs = [...labels].map((label) => {
    const csv = csvBySequence.get(label) || { inbound: 0, outbound: 0, total: 0 };
    const slack = slackMap.get(label) || { inbound: 0, outbound: 0, total: 0 };
    const totalDiff = slack.total - csv.total;
    return {
      label,
      csv,
      slack,
      totalDiff,
    };
  });

  return diffs
    .sort((a, b) => Math.abs(b.totalDiff) - Math.abs(a.totalDiff))
    .slice(0, 12);
};

const main = async () => {
  const envFile = parseEnvFile('/Users/jl/Desktop/SlackCLI/my-slack-app/.env');
  const channelId = process.env.ALOWARE_CHANNEL_ID || envFile.get('ALOWARE_CHANNEL_ID');
  if (!channelId) {
    throw new Error('ALOWARE_CHANNEL_ID not set.');
  }

  const csvPath = process.argv[2] || DEFAULT_CSV_PATH;
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const token = resolveSlackBotToken();
  const client = new WebClient(token);
  const nowTs = Math.floor(Date.now() / 1000);
  const weekStart = nowTs - WEEK_SECONDS;

  const slackHistory = await fetchSlackHistory({ channelId, client, weekStart });
  const slackDebug = __debugAnalyzeRawMessagesForTests({ rawMessages: slackHistory, nowTs });
  const report = await buildAlowareAnalyticsReport({
    channelId,
    client,
    prompt: 'Please send a daily report with new inbound leads and booking requests',
  });
  const parsedReport = parseReportTotals(report);
  const csvTotals = aggregateCsv({ csvPath, nowTs, weekStart });
  const diffs = topDiffLines({
    csvBySequence: csvTotals.bySequence,
    slackBySequence: slackDebug.sequenceRows.map((row) => ({
      conversations: row.conversations,
      inbound: row.inboundTexts,
      label: row.label,
      outbound: row.outboundTexts,
      total: row.totalTexts,
    })),
  });

  const slackTrackableTotal =
    slackDebug.directionCounts.inbound + slackDebug.directionCounts.outbound;
  const csvTotal = csvTotals.totals.total;

  console.log('=== Window ===');
  console.log(`now_ts=${nowTs}`);
  console.log(`week_start_ts=${weekStart}`);
  console.log('');

  console.log('=== Slack Source ===');
  console.log(`slack_history_rows=${slackHistory.length}`);
  console.log(`slack_trackable_inbound=${slackDebug.directionCounts.inbound}`);
  console.log(`slack_trackable_outbound=${slackDebug.directionCounts.outbound}`);
  console.log(`slack_trackable_total=${slackTrackableTotal}`);
  console.log(`slack_unknown_direction_rows=${slackDebug.directionCounts.unknown}`);
  console.log(`slack_inbound_only_conversations=${slackDebug.inboundOnlyConversationCount}`);
  console.log(`slack_inbound_only_messages=${slackDebug.inboundOnlyMessageCount}`);
  console.log(`slack_missing_sequence_rows=${slackDebug.missingSequenceRows}`);
  console.log(`slack_unknown_contact_rows=${slackDebug.unknownContactRows}`);
  console.log('');

  console.log('=== Report Snapshot (Current Formatter) ===');
  console.log(`report_outbound_conversations=${parsedReport.outboundConversations}`);
  console.log(`report_reply_rate_pct=${parsedReport.replyRatePct}`);
  console.log(`report_bookings=${parsedReport.bookings}`);
  console.log(`report_opt_outs=${parsedReport.optOuts}`);
  console.log('');

  console.log('=== CSV Totals (Text/SMS/MMS Only) ===');
  console.log(`csv_text_rows_total=${csvTotals.textRows}`);
  console.log(`csv_rows_outside_7d=${csvTotals.skippedRowsOutsideWindow}`);
  console.log(`csv_7d_sent=${csvTotals.totals.outbound}`);
  console.log(`csv_7d_received=${csvTotals.totals.inbound}`);
  console.log(`csv_7d_total=${csvTotal}`);
  console.log(`csv_non_text_rows=${csvTotals.nonTextRows}`);
  const topTypes = [...csvTotals.typeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([type, count]) => `${type || '(empty)'}:${count}`)
    .join(', ');
  console.log(`csv_type_top=${topTypes}`);
  console.log('');

  console.log('=== Delta ===');
  console.log(`slack_trackable_minus_csv_total=${slackTrackableTotal - csvTotal}`);
  console.log('');

  console.log('=== Top Sequence Diffs (Slack normalized - CSV) ===');
  for (const row of diffs) {
    console.log(
      `${row.label} | delta_total=${row.totalDiff} | slack(sent=${row.slack.outbound},recv=${row.slack.inbound},total=${row.slack.total}) | csv(sent=${row.csv.outbound},recv=${row.csv.inbound},total=${row.csv.total})`,
    );
  }
  console.log('');

  console.log('=== Likely Root Cause Signals ===');
  if (csvTotal - slackTrackableTotal > 0) {
    console.log(
      `source_gap=CSV has ${csvTotal - slackTrackableTotal} more text events than Slack-trackable events in same 7d window.`,
    );
  } else {
    console.log('source_gap=none_detected');
  }

  const aggregationDrop = slackTrackableTotal - slackDebug.includedMessageCount;
  if (aggregationDrop > 0) {
    console.log(
      `aggregation_drop=${aggregationDrop} trackable events are excluded by outbound-first conversation rules.`,
    );
    if (slackDebug.inboundOnlyMessageCount > 0) {
      console.log(
        `aggregation_drop_hint=inbound-only conversations contribute ${slackDebug.inboundOnlyMessageCount} messages.`,
      );
    }
  } else {
    console.log('aggregation_drop=none_detected');
  }

  if (slackDebug.directionCounts.unknown > 0) {
    console.log(
      `classification_gap=${slackDebug.directionCounts.unknown} Slack messages are SMS-like but direction is unknown.`,
    );
  } else {
    console.log('classification_gap=none_detected');
  }
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
