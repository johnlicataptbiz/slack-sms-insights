import 'dotenv/config';
import { WebClient } from '@slack/web-api';
import { buildAlowareAnalyticsReportBundle } from '../services/aloware-analytics.js';
import { buildDailyReportSummary, isDailySnapshotReport } from '../services/daily-report-summary.js';
import { logDailyRun } from '../services/daily-run-logger.js';
import { closeDatabase, getPool, initDatabase, initializeSchema } from '../services/db.js';

const DEFAULT_CHANNEL_ID = 'C09ULGH1BEC';
const DEFAULT_CHANNEL_NAME = 'alowaresmsupdates';
const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

type Args = {
  start?: string;
  end?: string;
  channelId: string;
  channelName: string;
  dryRun: boolean;
};

const parseArgs = (): Args => {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const idx = argv.indexOf(name);
    if (idx === -1) return undefined;
    return argv[idx + 1];
  };

  const start = get('--start');
  const end = get('--end');
  const channelId = get('--channel-id') || process.env.DAILY_REPORT_CHANNEL_ID || DEFAULT_CHANNEL_ID;
  const channelName = get('--channel-name') || process.env.DAILY_REPORT_CHANNEL_NAME || DEFAULT_CHANNEL_NAME;
  const dryRun = argv.includes('--dry-run');

  return { start, end, channelId, channelName, dryRun };
};

const assertIsoDay = (day: string, label: string): void => {
  if (!ISO_DAY_PATTERN.test(day)) {
    throw new Error(`Invalid ${label}: ${day}. Expected YYYY-MM-DD.`);
  }
  const parsed = new Date(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`Invalid ${label}: ${day}`);
  }
};

const addDays = (day: string, delta: number): string => {
  const d = new Date(`${day}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const enumerateDays = (start: string, end: string): string[] => {
  const result: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) {
    result.push(d);
  }
  return result;
};

const isPlaceholderText = (text: string | null | undefined): boolean => {
  return (text || '').trim().toLowerCase().startsWith('backfilled placeholder');
};

const summarize = (report: string): string => {
  if (isDailySnapshotReport(report)) {
    return buildDailyReportSummary(report);
  }
  return report.split('\n').slice(0, 5).join('\n');
};

const resolveDefaultWindow = async (channelId: string): Promise<{ start: string; end: string } | null> => {
  const pool = getPool();
  if (!pool) return null;

  const { rows } = await pool.query<{ start_day: string | null; end_day: string | null }>(
    `
    SELECT
      MIN(COALESCE(report_date, (timestamp AT TIME ZONE 'UTC')::date))::text AS start_day,
      MAX(COALESCE(report_date, (timestamp AT TIME ZONE 'UTC')::date))::text AS end_day
    FROM daily_runs
    WHERE channel_id = $1
      AND report_type = 'daily'
      AND COALESCE(is_legacy, FALSE) = FALSE
    `,
    [channelId],
  );

  const start = rows[0]?.start_day || null;
  const end = rows[0]?.end_day || null;
  if (!start || !end) return null;
  return { start, end };
};

const archiveExistingRuns = async (input: {
  channelId: string;
  start: string;
  end: string;
  dryRun: boolean;
}): Promise<number> => {
  const pool = getPool();
  if (!pool) return 0;

  if (input.dryRun) {
    const countResult = await pool.query<{ n: string }>(
      `
      SELECT COUNT(*)::text AS n
      FROM daily_runs
      WHERE channel_id = $1
        AND report_type = 'daily'
        AND COALESCE(report_date, (timestamp AT TIME ZONE 'UTC')::date) BETWEEN $2::date AND $3::date
        AND COALESCE(is_legacy, FALSE) = FALSE
      `,
      [input.channelId, input.start, input.end],
    );
    return Number.parseInt(countResult.rows[0]?.n || '0', 10) || 0;
  }

  const updateResult = await pool.query(
    `
    UPDATE daily_runs
    SET is_legacy = TRUE
    WHERE channel_id = $1
      AND report_type = 'daily'
      AND COALESCE(report_date, (timestamp AT TIME ZONE 'UTC')::date) BETWEEN $2::date AND $3::date
      AND COALESCE(is_legacy, FALSE) = FALSE
    `,
    [input.channelId, input.start, input.end],
  );

  return updateResult.rowCount || 0;
};

const run = async () => {
  const args = parseArgs();
  await initDatabase(console);
  await initializeSchema();

  const slackToken = (process.env.SLACK_BOT_TOKEN || '').trim();
  if (!slackToken) {
    throw new Error('SLACK_BOT_TOKEN is not set.');
  }

  let start = args.start;
  let end = args.end;

  if (!start || !end) {
    const window = await resolveDefaultWindow(args.channelId);
    if (!window) {
      throw new Error('No existing non-legacy daily runs found. Provide --start and --end.');
    }
    start = window.start;
    end = window.end;
  }

  assertIsoDay(start, 'start');
  assertIsoDay(end, 'end');
  if (start > end) {
    throw new Error(`Invalid range: start (${start}) must be <= end (${end}).`);
  }

  console.log(`Regenerating daily runs for ${start}..${end} (${args.channelId})`);
  if (args.dryRun) {
    console.log('Mode: DRY RUN');
  }

  const archived = await archiveExistingRuns({
    channelId: args.channelId,
    start,
    end,
    dryRun: args.dryRun,
  });
  console.log(args.dryRun ? `Would archive ${archived} existing runs.` : `Archived ${archived} existing runs.`);

  const client = new WebClient(slackToken);
  const days = enumerateDays(start, end);
  let success = 0;
  let errors = 0;
  let placeholders = 0;

  for (const day of days) {
    console.log(`Generating ${day}...`);
    try {
      const bundle = await buildAlowareAnalyticsReportBundle({
        channelId: args.channelId,
        client,
        prompt: `daily report ${day}`,
        logger: console,
      });

      const summary = summarize(bundle.reportText);
      const isPlaceholder = isPlaceholderText(summary) || isPlaceholderText(bundle.reportText);
      if (isPlaceholder) placeholders += 1;

      if (args.dryRun) {
        console.log(`[dry-run] ${day}: generated (${bundle.reportText.length} chars)${isPlaceholder ? ' [placeholder]' : ''}`);
        success += 1;
        continue;
      }

      await logDailyRun({
        channelId: args.channelId,
        channelName: args.channelName,
        reportDate: day,
        reportType: 'daily',
        status: 'success',
        summaryText: summary,
        fullReport: bundle.reportText,
        durationMs: 0,
        isLegacy: false,
      });
      success += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors += 1;
      console.error(`Failed ${day}: ${message}`);

      if (!args.dryRun) {
        await logDailyRun({
          channelId: args.channelId,
          channelName: args.channelName,
          reportDate: day,
          reportType: 'daily',
          status: 'error',
          errorMessage: message,
          summaryText: `Regeneration failed for ${day}`,
          fullReport: '',
          durationMs: 0,
          isLegacy: false,
        });
      }
    }
  }

  console.log(
    [
      'Done.',
      `Days processed: ${days.length}`,
      `Success: ${success}`,
      `Errors: ${errors}`,
      `Placeholder outputs: ${placeholders}`,
    ].join('\n'),
  );

  await closeDatabase();
};

run().catch(async (error) => {
  console.error(error);
  try {
    await closeDatabase();
  } catch {
    // ignore
  }
  process.exit(1);
});
