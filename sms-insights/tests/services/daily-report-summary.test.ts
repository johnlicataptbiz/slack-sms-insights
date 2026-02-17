import assert from 'node:assert';
import { describe, it } from 'node:test';
import { buildDailyReportSummary, isDailySnapshotReport } from '../../services/daily-report-summary.js';

const DAILY_REPORT_TEXT = [
  '*PT BIZ - DAILY SMS SNAPSHOT*',
  'Date: Feb 14, 2026',
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

describe('daily report summary', () => {
  it('should detect daily snapshot reports', () => {
    assert.equal(isDailySnapshotReport(DAILY_REPORT_TEXT), true);
    assert.equal(isDailySnapshotReport('*SMS Insights Core KPI Report*'), false);
  });

  it('should build message/reply-first summary output', () => {
    const summary = buildDailyReportSummary(DAILY_REPORT_TEXT);
    assert(summary.includes('- Messages sent: 26'));
    assert(summary.includes('- Replies received: 2 (7.7%)'));
    assert(summary.includes('- Calls booked: 1'));
    assert(summary.includes('- Opt-outs: 1'));
    assert(summary.includes('- Outbound conversations: 26'));
    assert(summary.includes('Alpha Sequence: 16 sent, 2 replies (12.5%), 1 booked, 1 opt-outs'));
  });
});
