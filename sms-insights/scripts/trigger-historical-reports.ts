import 'dotenv/config';
import { WebClient } from '@slack/web-api';
import { initDatabase, closeDatabase } from '../services/db.js';
import { logDailyRun } from '../services/daily-run-logger.js';
import { buildAlowareAnalyticsReportBundle } from '../services/aloware-analytics.js';

const DAILY_REPORT_CHANNEL_ID = 'C09ULGH1BEC'; // #alowaresmsupdates

async function run() {
  console.log('Initializing database...');
  await initDatabase();

  const client = new WebClient(process.env.SLACK_BOT_TOKEN);
  
  const dates = [
    '2026-02-17', // Yesterday
    '2026-02-16', // Day prior
    '2026-02-15'  // Two days prior
  ];

  for (const date of dates) {
    console.log(`Generating report for ${date}...`);
    try {
      const bundle = await buildAlowareAnalyticsReportBundle({
        channelId: DAILY_REPORT_CHANNEL_ID,
        client,
        prompt: `daily report ${date}`,
        logger: console as any
      });

      if (bundle.summary) {
        console.log(`Logging report for ${date} to database...`);
        const runId = await logDailyRun({
          channelId: DAILY_REPORT_CHANNEL_ID,
          channelName: 'alowaresmsupdates',
          reportDate: date,
          reportType: 'daily',
          status: 'success',
          summaryText: bundle.reportText.split('\n').slice(0, 10).join('\n'), // Store a snippet
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
