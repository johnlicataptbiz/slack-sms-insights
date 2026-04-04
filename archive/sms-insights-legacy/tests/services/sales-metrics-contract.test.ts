import assert from 'node:assert';
import { describe, it } from 'node:test';
import type { BookedCallsSummary } from '../../services/booked-calls.js';
import type { SalesMetricsSummary } from '../../services/sales-metrics.js';
import { buildCanonicalSalesMetricsSlice } from '../../services/sales-metrics-contract.js';

const baseSummary = (): SalesMetricsSummary => ({
  timeRange: { from: '2026-02-20T06:00:00.000Z', to: '2026-02-21T05:59:59.999Z' },
  totals: {
    messagesSent: 10,
    manualMessagesSent: 4,
    sequenceMessagesSent: 6,
    peopleContacted: 9,
    manualPeopleContacted: 4,
    sequencePeopleContacted: 5,
    repliesReceived: 3,
    replyRatePct: 33.3,
    manualRepliesReceived: 1,
    manualReplyRatePct: 25,
    sequenceRepliesReceived: 2,
    sequenceReplyRatePct: 40,
    booked: 99,
    optOuts: 1,
  },
  trendByDay: [
    {
      day: '2026-02-20',
      messagesSent: 10,
      manualMessagesSent: 4,
      sequenceMessagesSent: 6,
      peopleContacted: 9,
      manualPeopleContacted: 4,
      sequencePeopleContacted: 5,
      repliesReceived: 3,
      replyRatePct: 33.3,
      manualRepliesReceived: 1,
      manualReplyRatePct: 25,
      sequenceRepliesReceived: 2,
      sequenceReplyRatePct: 40,
      booked: 99,
      optOuts: 1,
    },
  ],
  topSequences: [
    {
      label: 'A',
      messagesSent: 6,
      repliesReceived: 2,
      replyRatePct: 33.3,
      bookingSignalsSms: 2,
      booked: 0,
      optOuts: 1,
    },
  ],
  repLeaderboard: [
    { repName: 'Jack', outboundConversations: 3, bookingSignalsSms: 1, booked: 0, optOuts: 0, replyRatePct: null },
  ],
});

const bookedCalls = (): BookedCallsSummary => ({
  timeRange: { from: '2026-02-20T06:00:00.000Z', to: '2026-02-21T05:59:59.999Z' },
  totals: {
    booked: 2,
    jack: 1,
    brandon: 1,
    selfBooked: 0,
  },
  trendByDay: [{ day: '2026-02-20', booked: 2, jack: 1, brandon: 1, selfBooked: 0 }],
});

describe('sales metrics canonical contract', () => {
  it('forces Slack booked totals and trend to be consistent', () => {
    const merged = buildCanonicalSalesMetricsSlice(baseSummary(), bookedCalls());

    assert.equal(merged.totals.booked, 2);
    assert.equal(merged.bookedCalls.booked, 2);
    assert.equal(merged.consistency.totalsBookedMatches, true);
    assert.equal(merged.consistency.trendBookedSum, 2);
    assert.equal(merged.consistency.trendBookedMatches, true);
  });

  it('keeps deprecated booked aliases mapped to bookingSignalsSms', () => {
    const merged = buildCanonicalSalesMetricsSlice(baseSummary(), bookedCalls());

    assert.equal(merged.topSequences[0]?.bookingSignalsSms, 2);
    assert.equal(merged.topSequences[0]?.booked, 2);
    assert.equal(merged.repLeaderboard[0]?.bookingSignalsSms, 1);
    assert.equal(merged.repLeaderboard[0]?.booked, 1);
  });
});
