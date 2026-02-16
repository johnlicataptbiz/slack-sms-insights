import fs from 'node:fs';
import { execSync } from 'node:child_process';
import type { Logger } from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import { buildAlowareAnalyticsReportFromHistoryMessages } from '../services/aloware-analytics.js';
import { upsertDailyReportCanvasFromSeedEntries, type CanvasSeedEntry } from '../services/canvas-log.js';

type HistoryMessage = {
  attachments?: Array<{
    fields?: Array<{ title?: string; value?: string }>;
    title?: string;
  }>;
  ts?: string;
};

type CsvSmsEvent = {
  body: string;
  contactName: string;
  contactNumber: string;
  direction: 'inbound' | 'outbound';
  lineName: string;
  sequenceName: string;
  ts: number;
};

const DAY_SECONDS = 24 * 60 * 60;
const WEEK_SECONDS = 7 * DAY_SECONDS;
const DEFAULT_CSV_PATH = '/Users/jl/Downloads/export-4876f0a9-aa86-4a07-886f-b3040d0f4697.csv';
const DEFAULT_DAYS = 7;
const DEFAULT_TIMEZONE = 'America/Chicago';
const DEFAULT_PRIMARY_RUN_LABEL = 'Scheduled 6:00 AM';
const DEFAULT_BACKUP_RUN_LABEL = 'Scheduled 4:00 PM';
const REPORT_PROMPT = 'daily report';

const sanitize = (value: string): string => value.replace(/\s+/g, ' ').trim();

const parsePositiveInt = (value: string | undefined, fallback: number, min: number, max: number): number => {
  const parsed = Number.parseInt(value || '', 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
};

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

const hydrateProcessEnvFromMap = (values: Map<string, string>): void => {
  for (const [key, value] of values.entries()) {
    if (process.env[key] === undefined || process.env[key] === '') {
      process.env[key] = value;
    }
  }
};

const resolveSlackBotToken = (): string => {
  if (process.env.SLACK_BOT_TOKEN?.trim()) {
    return process.env.SLACK_BOT_TOKEN.trim();
  }

  try {
    const pid = execSync("pgrep -f 'node /Users/jl/Desktop/SlackCLI/my-slack-app/dist/app.js' | head -n1", {
      encoding: 'utf8',
    }).trim();
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
    throw new Error('Unable to resolve SLACK_BOT_TOKEN from env or running app process.');
  }
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

const parseTimestampSeconds = (value: string): number => {
  const normalized = value.trim();
  if (!normalized) {
    return Number.NaN;
  }
  const parsed = Date.parse(normalized.replace(' ', 'T'));
  return Number.isNaN(parsed) ? Number.NaN : Math.floor(parsed / 1000);
};

const isTextType = (type: string): boolean => {
  const normalized = type.toLowerCase();
  return normalized === 'text' || normalized === 'sms' || normalized === 'mms';
};

const normalizeDirection = (value: string): 'inbound' | 'outbound' | undefined => {
  const normalized = sanitize(value).toLowerCase();
  if (normalized === 'inbound') {
    return 'inbound';
  }
  if (normalized === 'outbound') {
    return 'outbound';
  }
  return undefined;
};

const normalizeSequenceLabel = (value: string): string => {
  const normalized = sanitize(value);
  return normalized.length > 0 ? normalized : 'No sequence (manual/direct)';
};

const normalizeLineName = (value: string): string => {
  const normalized = sanitize(value);
  return normalized.length > 0 ? normalized : 'Unknown line';
};

const normalizeContactName = (firstName: string, lastName: string): string => {
  const full = sanitize(`${firstName} ${lastName}`);
  return full.length > 0 ? full : 'Unknown';
};

const normalizeContactNumber = (value: string): string => {
  const normalized = sanitize(value);
  return normalized.length > 0 ? normalized : '';
};

const normalizeBody = (value: string): string => {
  const normalized = sanitize(value);
  return normalized.length > 0 ? normalized : '(empty message)';
};

const parseCsvEvents = ({
  csvPath,
  maxTs,
  minTs,
}: {
  csvPath: string;
  maxTs: number;
  minTs: number;
}): CsvSmsEvent[] => {
  const raw = fs.readFileSync(csvPath, 'utf8');
  let headers: string[] | undefined;
  let indexStartedAt = -1;
  let indexType = -1;
  let indexDirection = -1;
  let indexSequence = -1;
  let indexLine = -1;
  let indexContactNumber = -1;
  let indexContactFirst = -1;
  let indexContactLast = -1;
  let indexBody = -1;

  const events: CsvSmsEvent[] = [];

  parseCsvWithQuotes(raw, (row) => {
    if (!headers) {
      headers = row.map((value) => sanitize(value).replace(/^"|"$/g, ''));
      indexStartedAt = headers.indexOf('Started At');
      indexType = headers.indexOf('Type');
      indexDirection = headers.indexOf('Direction');
      indexSequence = headers.indexOf('Sequence Name');
      indexLine = headers.indexOf('Line Name');
      indexContactNumber = headers.indexOf('Contact Number');
      indexContactFirst = headers.indexOf('Contact First Name');
      indexContactLast = headers.indexOf('Contact Last Name');
      indexBody = headers.indexOf('Body');
      return;
    }

    if (indexStartedAt < 0 || indexType < 0 || indexDirection < 0) {
      return;
    }

    const typeValue = sanitize(row[indexType] || '');
    if (!isTextType(typeValue)) {
      return;
    }

    const ts = parseTimestampSeconds(sanitize(row[indexStartedAt] || ''));
    if (!Number.isFinite(ts) || ts < minTs || ts > maxTs) {
      return;
    }

    const direction = normalizeDirection(row[indexDirection] || '');
    if (!direction) {
      return;
    }

    events.push({
      body: normalizeBody(row[indexBody] || ''),
      contactName: normalizeContactName(row[indexContactFirst] || '', row[indexContactLast] || ''),
      contactNumber: normalizeContactNumber(row[indexContactNumber] || ''),
      direction,
      lineName: normalizeLineName(row[indexLine] || ''),
      sequenceName: normalizeSequenceLabel(row[indexSequence] || ''),
      ts,
    });
  });

  return events.sort((a, b) => a.ts - b.ts);
};

const getDayKey = (ts: number, timezone: string): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: '2-digit',
    timeZone: timezone,
    year: 'numeric',
  }).formatToParts(new Date(ts * 1000));
  const year = parts.find((part) => part.type === 'year')?.value || '0000';
  const month = parts.find((part) => part.type === 'month')?.value || '00';
  const day = parts.find((part) => part.type === 'day')?.value || '00';
  return `${year}-${month}-${day}`;
};

const parseOffsetMinutes = (offsetText: string): number => {
  const match = offsetText.match(/(?:GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (!match) {
    return 0;
  }
  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2] || '0', 10);
  const minutes = Number.parseInt(match[3] || '0', 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }
  return sign * (hours * 60 + minutes);
};

const getOffsetMinutesAt = (date: Date, timezone: string): number => {
  const formatter = new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    month: '2-digit',
    second: '2-digit',
    timeZone: timezone,
    timeZoneName: 'shortOffset',
    year: 'numeric',
  });
  const offsetName = formatter.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value || 'GMT+0';
  return parseOffsetMinutes(offsetName);
};

const toEpochSecondsInTimezone = ({
  dayKey,
  hour,
  minute,
  timezone,
}: {
  dayKey: string;
  hour: number;
  minute: number;
  timezone: string;
}): number => {
  const [yearText, monthText, dayText] = dayKey.split('-');
  const year = Number.parseInt(yearText || '', 10);
  const month = Number.parseInt(monthText || '', 10);
  const day = Number.parseInt(dayText || '', 10);
  if ([year, month, day].some((value) => Number.isNaN(value))) {
    throw new Error(`Invalid day key: ${dayKey}`);
  }

  const localMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  let utcMs = localMs;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const offsetMinutes = getOffsetMinutesAt(new Date(utcMs), timezone);
    const nextUtcMs = localMs - offsetMinutes * 60_000;
    if (nextUtcMs === utcMs) {
      break;
    }
    utcMs = nextUtcMs;
  }

  return Math.floor(utcMs / 1000);
};

const formatDayLabel = (dayKey: string, timezone: string): string => {
  const ts = toEpochSecondsInTimezone({
    dayKey,
    hour: 12,
    minute: 0,
    timezone,
  });
  return new Intl.DateTimeFormat('en-US', {
    day: '2-digit',
    month: 'short',
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
  }).format(new Date(ts * 1000));
};

const buildPastDayKeys = ({
  days,
  includeToday,
  nowTs,
  timezone,
}: {
  days: number;
  includeToday: boolean;
  nowTs: number;
  timezone: string;
}): string[] => {
  const keys: string[] = [];
  const seen = new Set<string>();
  const startOffset = includeToday ? 0 : 1;
  for (let offset = startOffset; keys.length < days && offset < days + 14; offset += 1) {
    const key = getDayKey(nowTs - offset * DAY_SECONDS, timezone);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    keys.push(key);
  }
  return keys.sort((a, b) => a.localeCompare(b));
};

const csvEventToHistoryMessage = (event: CsvSmsEvent): HistoryMessage => {
  const title = `${event.sequenceName} has ${event.direction === 'outbound' ? 'sent' : 'received'} an SMS`;
  const contactValue = event.contactNumber
    ? `${event.contactName} (${event.contactNumber})`
    : event.contactName;
  return {
    attachments: [
      {
        fields: [
          { title: 'Line', value: event.lineName },
          { title: 'Contact', value: contactValue },
          { title: 'Sequence', value: event.sequenceName },
          { title: 'Message', value: event.body },
        ],
        title,
      },
    ],
    ts: `${event.ts}.000000`,
  };
};

const buildSeedEntries = ({
  events,
  dayKeys,
  timezone,
}: {
  events: CsvSmsEvent[];
  dayKeys: string[];
  timezone: string;
}): CanvasSeedEntry[] => {
  const primaryRunLabel = process.env.ALOWARE_PRIMARY_RUN_LABEL?.trim() || DEFAULT_PRIMARY_RUN_LABEL;
  const backupRunLabel = process.env.ALOWARE_BACKUP_RUN_LABEL?.trim() || DEFAULT_BACKUP_RUN_LABEL;
  const seedEntries: CanvasSeedEntry[] = [];

  for (const dayKey of dayKeys) {
    const backupRunTs = toEpochSecondsInTimezone({
      dayKey,
      hour: 16,
      minute: 0,
      timezone,
    });
    const weekStart = backupRunTs - WEEK_SECONDS;
    const messages = events
      .filter((event) => event.ts >= weekStart && event.ts <= backupRunTs)
      .map(csvEventToHistoryMessage);
    const report = buildAlowareAnalyticsReportFromHistoryMessages({
      nowTs: backupRunTs,
      prompt: REPORT_PROMPT,
      rawMessages: messages,
    });
    const primaryRunTs = toEpochSecondsInTimezone({
      dayKey,
      hour: 6,
      minute: 0,
      timezone,
    });

    seedEntries.push({
      report,
      runLabel: primaryRunLabel,
      ts: primaryRunTs,
    });
    seedEntries.push({
      report,
      runLabel: backupRunLabel,
      ts: backupRunTs,
    });
  }

  return seedEntries.sort((a, b) => a.ts - b.ts);
};

const parseTotalsLine = (report: string): string => {
  const lines = report.split('\n');
  const outbound = lines.find((line) => /^- Outbound Conversations:/i.test(line));
  const replyRate = lines.find((line) => /^- Reply Rate:/i.test(line));
  const bookings = lines.find((line) => /^- Bookings:/i.test(line));
  const optOuts = lines.find((line) => /^- Opt Outs:/i.test(line));

  if (!outbound || !replyRate || !bookings || !optOuts) {
    return '- Snapshot metrics unavailable';
  }

  return `${outbound}; ${replyRate}; ${bookings}; ${optOuts}`;
};

const parseArgs = (): {
  apply: boolean;
  csvPath: string;
  days: number;
  includeToday: boolean;
} => {
  const args = process.argv.slice(2);
  let apply = false;
  let csvPath = DEFAULT_CSV_PATH;
  let includeToday = false;
  let days = DEFAULT_DAYS;

  for (const arg of args) {
    if (arg === '--apply') {
      apply = true;
      continue;
    }
    if (arg === '--include-today') {
      includeToday = true;
      continue;
    }
    if (arg.startsWith('--days=')) {
      days = parsePositiveInt(arg.split('=')[1], DEFAULT_DAYS, 1, 30);
      continue;
    }
    if (!arg.startsWith('-')) {
      csvPath = arg;
      continue;
    }
  }

  return { apply, csvPath, days, includeToday };
};

const main = async (): Promise<void> => {
  const { apply, csvPath, days, includeToday } = parseArgs();
  if (!fs.existsSync(csvPath)) {
    throw new Error(`CSV not found: ${csvPath}`);
  }

  const envFile = parseEnvFile('/Users/jl/Desktop/SlackCLI/my-slack-app/.env');
  hydrateProcessEnvFromMap(envFile);
  const timezone = process.env.ALOWARE_REPORT_TIMEZONE?.trim() || envFile.get('ALOWARE_REPORT_TIMEZONE') || DEFAULT_TIMEZONE;
  const nowTs = Math.floor(Date.now() / 1000);
  const dayKeys = buildPastDayKeys({
    days,
    includeToday,
    nowTs,
    timezone,
  });
  if (dayKeys.length === 0) {
    throw new Error('No day keys generated for backfill.');
  }

  const oldestBackupRunTs = toEpochSecondsInTimezone({
    dayKey: dayKeys[0],
    hour: 16,
    minute: 0,
    timezone,
  });
  const newestBackupRunTs = toEpochSecondsInTimezone({
    dayKey: dayKeys[dayKeys.length - 1],
    hour: 16,
    minute: 0,
    timezone,
  });
  const csvEvents = parseCsvEvents({
    csvPath,
    maxTs: newestBackupRunTs,
    minTs: oldestBackupRunTs - WEEK_SECONDS,
  });
  const entries = buildSeedEntries({
    events: csvEvents,
    dayKeys,
    timezone,
  });

  console.log('=== CSV Canvas Backfill Preview ===');
  console.log(`csv_path=${csvPath}`);
  console.log(`timezone=${timezone}`);
  console.log(`days=${dayKeys.length}`);
  console.log(`events_loaded=${csvEvents.length}`);
  console.log(`seed_entries=${entries.length}`);
  console.log(`apply=${apply}`);
  console.log('');
  for (const dayKey of dayKeys) {
    const backupRunTs = toEpochSecondsInTimezone({
      dayKey,
      hour: 16,
      minute: 0,
      timezone,
    });
    const report = entries.find(
      (entry) => entry.ts === backupRunTs && entry.runLabel === (process.env.ALOWARE_BACKUP_RUN_LABEL?.trim() || DEFAULT_BACKUP_RUN_LABEL),
    )?.report;
    console.log(`${formatDayLabel(dayKey, timezone)} | ${parseTotalsLine(report || '')}`);
  }

  if (!apply) {
    console.log('');
    console.log('Dry run only. Re-run with --apply to write to the managed canvas section.');
    return;
  }

  const channelId = process.env.ALOWARE_CHANNEL_ID || envFile.get('ALOWARE_CHANNEL_ID');
  if (!channelId) {
    throw new Error('ALOWARE_CHANNEL_ID not set in env or .env file.');
  }

  const token = resolveSlackBotToken();
  const client = new WebClient(token);
  const logger = {
    debug: (...args: unknown[]) => console.log(...args),
    error: (...args: unknown[]) => console.error(...args),
    info: (...args: unknown[]) => console.log(...args),
    warn: (...args: unknown[]) => console.warn(...args),
  } as unknown as Logger;

  const applied = await upsertDailyReportCanvasFromSeedEntries({
    channelId,
    client,
    entries,
    logger,
  });
  if (!applied) {
    throw new Error('Canvas backfill failed before write. Check canvas ID/title and app scopes.');
  }

  console.log('');
  console.log(`Backfill applied to canvas for channel ${channelId}.`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
