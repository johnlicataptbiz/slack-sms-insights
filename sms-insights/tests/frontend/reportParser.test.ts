import assert from 'node:assert/strict';
import test from 'node:test';

import { parseReport } from '../../../frontend/src/utils/reportParser.js';

const CANONICAL_REPORT_TEXT = [
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

test('parseReport: parses canonical daily report format', () => {
  const parsed = parseReport(CANONICAL_REPORT_TEXT);

  assert.equal(parsed.title, 'Daily SMS Snapshot');
  assert.equal(parsed.date, 'Feb 17, 2026');

  // Sequence totals
  assert.equal(parsed.totalMessagesSent, 12 + 8 + 4 + 2);
  assert.equal(parsed.totalRepliesReceived, 2 + 0 + 0 + 0);
  assert.equal(parsed.totalBooked, 1);
  assert.equal(parsed.totalOptOuts, 1);

  // Rep parsing
  assert.equal(parsed.reps.length, 2);
  assert.equal(parsed.reps[0]?.name, 'Brandon Erwin');
  assert.equal(parsed.reps[0]?.outboundConversations, 20);
  assert.equal(parsed.reps[0]?.bookings, 1);
  assert.equal(parsed.reps[0]?.optOuts, 1);
});

test('parseReport: tolerates Booked/Opt-outs variants and opt outs in sequence lines', () => {
  const variant = CANONICAL_REPORT_TEXT.replace('- Bookings: 1', '- Booked: 1')
    .replace('- Opt Outs: 1', '- Opt-outs: 1')
    .replaceAll('opt-outs', 'opt outs');

  const parsed = parseReport(variant);

  assert.equal(parsed.totalBooked, 1);
  assert.equal(parsed.totalOptOuts, 1);

  // Ensure sequences still parsed
  assert.ok(parsed.allSequences.length >= 3);
  assert.ok(parsed.allSequences.some((s) => s.label === 'Alpha Sequence'));
});
