import 'dotenv/config';
import { buildDailyReportSummary } from '../services/daily-report-summary.js';
import { logDailyRun } from '../services/daily-run-logger.js';
import { closeDatabase, initDatabase } from '../services/db.js';

const DAILY_REPORT_TEXT = [
  '*PT BIZ - DAILY SMS SNAPSHOT*',
  'Date: Feb 17, 2026',
  'Time Range: Last 24 Hours',
  '',
  '*Split By Line / Rep (24h)*',
  '',
  '*Rep: Brandon Erwin*',
  '- Line: Main',
  '*Core Metrics*',
  '- Outbound Conversations: 20',
  '- Reply Rate: 10.0%',
  '- Bookings: 1',
  '- Opt Outs: 1',
  '*Sequence Specific KPIs (24h)*',
  '- Alpha Sequence: sent 12, replies received 2 (16.7% response rate), bookings 1 (50.0% close rate (1/2 replied)), opt-outs 1 (8.3%)',
  '- Beta Sequence: sent 8, replies received 0 (0.0% response rate), bookings 0 (n/a close rate (0 replies)), opt-outs 0 (0.0%)',
  '',
  '*Rep: Jack Licata*',
  '- Line: Main',
  '*Core Metrics*',
  '- Outbound Conversations: 6',
  '- Reply Rate: 0.0%',
  '- Bookings: 0',
  '- Opt Outs: 0',
  '*Sequence Specific KPIs (24h)*',
  '- Alpha Sequence: sent 4, replies received 0 (0.0% response rate), bookings 0 (n/a close rate (0 replies)), opt-outs 0 (0.0%)',
  '- Gamma Sequence: sent 2, replies received 0 (0.0% response rate), bookings 0 (n/a close rate (0 replies)), opt-outs 0 (0.0%)',
].join('\n');

async function seed() {
  console.log('Initializing database...');
  await initDatabase();

  const summary = buildDailyReportSummary(DAILY_REPORT_TEXT);

  const samples = [
    {
      channelId: 'C12345',
      channelName: 'general',
      reportType: 'daily' as const,
      status: 'success' as const,
      summaryText: summary,
      fullReport: DAILY_REPORT_TEXT,
      durationMs: 1200,
    },
    {
      channelId: 'C67890',
      channelName: 'marketing',
      reportType: 'daily' as const,
      status: 'success' as const,
      summaryText: summary,
      fullReport: DAILY_REPORT_TEXT,
      durationMs: 1500,
    },
  ];

  for (const sample of samples) {
    console.log(`Logging sample run for channel: ${sample.channelName}...`);
    const runId = await logDailyRun(sample);
    console.log(`Logged run with ID: ${runId}`);
  }

  console.log('Seeding complete.');
  await closeDatabase();
}

seed().catch(console.error);
