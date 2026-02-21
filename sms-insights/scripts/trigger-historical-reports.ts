import 'dotenv/config';
import { WebClient } from '@slack/web-api';
import { buildAlowareAnalyticsReportBundle } from '../services/aloware-analytics.js';
import { logDailyRun } from '../services/daily-run-logger.js';
import { closeDatabase, getPool, initDatabase } from '../services/db.js';

const DAILY_REPORT_CHANNEL_ID = 'C09ULGH1BEC'; // #alowaresmsupdates

const isPlaceholderText = (text: string | null | undefined): boolean =>
  (text || '').trim().toLowerCase().startsWith('backfilled placeholder');

const hasRealRunForDay = async (input: {
  channelId: string;
  reportType: 'daily' | 'manual' | 'test';
  reportDate: string;
}): Promise<boolean> => {
  const pool = getPool();
  if (!pool) return false;

  // "Real" = not placeholder, and success/pending (treat error as non-canonical for backfill purposes)
  const result = await pool.query<{ exists: boolean }>(
    `
    SELECT EXISTS (
      SELECT 1
      FROM daily_runs
      WHERE channel_id = $1
        AND report_type = $2
        AND report_date = $3
        AND status IN ('success', 'pending')
        AND NOT (
          COALESCE(summary_text, '') ILIKE 'backfilled placeholder%'
          OR COALESCE(full_report, '') ILIKE 'backfilled placeholder%'
        )
    ) AS exists
  `,
    [input.channelId, input.reportType, input.reportDate],
  );

  return Boolean(result.rows[0]?.exists);
};

async function run() {
  console.log('Initializing database...');
  await initDatabase();

  const client = new WebClient(process.env.SLACK_BOT_TOKEN);

  const dates = [
    '2026-02-18', // Backfill missing day
    '2026-02-17', // Yesterday
    '2026-02-16', // Day prior
    '2026-02-15', // Two days prior
  ];

  for (const date of dates) {
    console.log(`Generating report for ${date}...`);

    // If a real run already exists for this day, do not insert another run (prevents duplicates/placeholders).
    if (
      await hasRealRunForDay({
        channelId: DAILY_REPORT_CHANNEL_ID,
        reportType: 'daily',
        reportDate: date,
      })
    ) {
      console.log(`Skipping ${date}: real run already exists in daily_runs.`);
      continue;
    }

    try {
      const bundle = await buildAlowareAnalyticsReportBundle({
        channelId: DAILY_REPORT_CHANNEL_ID,
        client,
        prompt: `daily report ${date}`,
        logger: console,
      });

      const summarySnippet = bundle.reportText.split('\n').slice(0, 10).join('\n'); // Store a snippet
      const looksPlaceholder = isPlaceholderText(summarySnippet) || isPlaceholderText(bundle.reportText);

      // If the generated output is a placeholder and a real run exists, skip logging.
      // (This is defensive; the pre-check above should already catch the common case.)
      if (
        looksPlaceholder &&
        (await hasRealRunForDay({
          channelId: DAILY_REPORT_CHANNEL_ID,
          reportType: 'daily',
          reportDate: date,
        }))
      ) {
        console.log(`Skipping ${date}: generated placeholder but real run exists.`);
        continue;
      }

      if (bundle.summary) {
        console.log(`Logging report for ${date} to database...`);
        const runId = await logDailyRun({
          channelId: DAILY_REPORT_CHANNEL_ID,
          channelName: 'alowaresmsupdates',
          reportDate: date,
          reportType: 'daily',
          status: 'success',
          summaryText: summarySnippet,
          fullReport: bundle.reportText,
          durationMs: 0, // We don't have the timing here easily
        });
        console.log(`Successfully logged report for ${date} with ID: ${runId}`);
      } else {
        console.warn(`No summary generated for ${date}. Report text length: ${bundle.reportText.length}`);
      }
    } catch (error) {
      console.error(`Failed to generate report for ${date}:`, error);
    }
  }

  console.log('Historical report generation complete.');
  await closeDatabase();
}

run().catch(console.error);
