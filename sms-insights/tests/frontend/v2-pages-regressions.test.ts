import assert from 'node:assert/strict';
import test from 'node:test';
import type { RunV2, SalesMetricsV2 } from '../../../frontend/src/api/v2-types.js';
import { computeInsightsBookedBreakdown } from '../../../frontend/src/v2/pages/InsightsV2.js';
import { resolveSelectedRunViewModel } from '../../../frontend/src/v2/pages/RunsV2.js';
import { computeSequenceHeaderMetrics } from '../../../frontend/src/v2/pages/SequencesV2.js';

const baseRun = (overrides: Partial<RunV2> = {}): RunV2 => ({
  processing: {
    model: 'snapshot_report',
    derivedFrom: 'continuous_sms_events_and_booked_calls',
  },
  id: '11111111-1111-4111-8111-111111111111',
  createdAt: '2026-02-23T03:00:13.317Z',
  timestamp: '2026-02-23T03:00:13.317Z',
  reportDate: '2026-02-22',
  channelId: 'C09ULGH1BEC',
  channelName: 'alowaresmsupdates',
  reportType: 'daily',
  status: 'success',
  errorMessage: null,
  summaryText: 'Daily Setter Snapshot',
  fullReport: null,
  durationMs: null,
  isLegacy: false,
  ...overrides,
});

test('RunsV2 selected run view model ignores stale cached model and parses detailed fullReport', () => {
  const detailedRun = baseRun({
    fullReport: [
      '*PT BIZ - DAILY SMS SNAPSHOT*',
      'Date: Feb 22, 2026',
      '*Rep: Jack Licata*',
      '- Outbound Conversations: 20',
      '- Bookings: 2',
      '- Opt Outs: 1',
      '- Cash Practice Field Manual: sent 10, replies received 2 (20.0% response rate), bookings 1 (50.0% close rate (1/2 replied)), opt-outs 0 (0.0%)',
    ].join('\n'),
  });

  const staleCachedModel = {
    title: 'Daily Setter Snapshot',
    subtitle: 'stale',
    summaryPreview: null,
    summaryLines: [],
    messagesSent: null,
    repliesReceived: null,
    replyRatePct: null,
    booked: null,
    optOuts: null,
    outboundConversations: null,
    topSequences: [],
    repRows: [],
  };

  const cached = new Map([[detailedRun.id, staleCachedModel]]);
  const selectedView = resolveSelectedRunViewModel(detailedRun, cached);

  assert.ok(selectedView);
  assert.equal(selectedView.topSequences.length, 1);
  assert.equal(selectedView.repRows.length, 1);
  assert.equal(selectedView.messagesSent, 10);
  assert.equal(selectedView.booked, 1);
});

test('SequencesV2 header metrics use all-channel booked total and keep unattributed separate', () => {
  const payload: SalesMetricsV2 = {
    processing: {
      model: 'live_rolling_metrics',
      source: 'continuous_sms_events_and_booked_calls',
    },
    timeRange: { from: '2026-02-22T06:00:00.000Z', to: '2026-02-23T05:59:59.999Z' },
    totals: {
      messagesSent: 100,
      manualMessagesSent: 20,
      sequenceMessagesSent: 80,
      peopleContacted: 70,
      manualPeopleContacted: 10,
      sequencePeopleContacted: 60,
      repliesReceived: 8,
      replyRatePct: 11.4,
      manualRepliesReceived: 1,
      manualReplyRatePct: 10,
      sequenceRepliesReceived: 7,
      sequenceReplyRatePct: 11.7,
      canonicalBookedCalls: 12,
      optOuts: 3,
    },
    bookedCredit: { total: 12, jack: 5, brandon: 4, selfBooked: 3 },
    trendByDay: [],
    sequences: [
      {
        label: 'Seq A',
        firstSeenAt: '2026-01-10',
        messagesSent: 60,
        uniqueContacted: 48,
        repliesReceived: 6,
        replyRatePct: 10,
        canonicalBookedCalls: 2,
        bookingRatePct: 4.2,
        canonicalBookedAfterSmsReply: 1,
        canonicalBookedJack: 1,
        canonicalBookedBrandon: 1,
        canonicalBookedSelf: 0,
        bookedAuditRows: [],
        diagnosticSmsBookingSignals: 2,
        optOuts: 1,
        optOutRatePct: 1.7,
      },
      {
        label: 'Seq B',
        firstSeenAt: '2026-01-20',
        messagesSent: 40,
        uniqueContacted: 22,
        repliesReceived: 2,
        replyRatePct: 5,
        canonicalBookedCalls: 1,
        bookingRatePct: 4.5,
        canonicalBookedAfterSmsReply: 0,
        canonicalBookedJack: 0,
        canonicalBookedBrandon: 0,
        canonicalBookedSelf: 1,
        bookedAuditRows: [],
        diagnosticSmsBookingSignals: 1,
        optOuts: 2,
        optOutRatePct: 5,
      },
    ],
    reps: [],
    provenance: {
      canonicalBookedSource: 'slack',
      diagnosticBookingSignalsSource: 'sms_heuristics',
      sequenceBookedAttribution: {
        source: 'slack_booked_calls',
        model: 'hubspot_first_conversion_fuzzy_v1',
        totalCalls: 12,
        matchedCalls: 3,
        unattributedCalls: 9,
        manualCalls: 1,
        strictSmsReplyLinkedCalls: 1,
        nonSmsOrUnknownCalls: 11,
      },
    },
  };

  const metrics = computeSequenceHeaderMetrics(payload, payload.sequences);

  assert.equal(metrics.totalBookedAllChannels, 12);
  assert.equal(metrics.totalBookedAttributedToRows, 3);
  assert.equal(metrics.unattributedCalls, 9);
  assert.equal(metrics.totalBookedAfterReply, 1);
  assert.equal(metrics.totalBookedNonSmsOrUnknown, 11);
});

test('InsightsV2 booked breakdown separates self-booked from non-SMS/unknown rollup', () => {
  const payload: SalesMetricsV2 = {
    processing: {
      model: 'live_rolling_metrics',
      source: 'continuous_sms_events_and_booked_calls',
    },
    timeRange: { from: '2026-02-16T06:00:00.000Z', to: '2026-02-23T05:59:59.999Z' },
    totals: {
      messagesSent: 1446,
      manualMessagesSent: 100,
      sequenceMessagesSent: 1346,
      peopleContacted: 1064,
      manualPeopleContacted: 40,
      sequencePeopleContacted: 1024,
      repliesReceived: 106,
      replyRatePct: 10,
      manualRepliesReceived: 12,
      manualReplyRatePct: 30,
      sequenceRepliesReceived: 94,
      sequenceReplyRatePct: 9.2,
      canonicalBookedCalls: 42,
      optOuts: 11,
    },
    bookedCredit: { total: 42, jack: 20, brandon: 8, selfBooked: 14 },
    trendByDay: [],
    sequences: [],
    reps: [],
    provenance: {
      canonicalBookedSource: 'slack',
      diagnosticBookingSignalsSource: 'sms_heuristics',
      sequenceBookedAttribution: {
        source: 'slack_booked_calls',
        model: 'hubspot_first_conversion_fuzzy_v1',
        totalCalls: 42,
        matchedCalls: 30,
        unattributedCalls: 12,
        manualCalls: 8,
        strictSmsReplyLinkedCalls: 14,
        nonSmsOrUnknownCalls: 28,
      },
    },
  };

  const metrics = computeInsightsBookedBreakdown(payload);

  assert.equal(metrics.bookedTotalAllChannels, 42);
  assert.equal(metrics.bookedSmsLinkedStrict, 14);
  assert.equal(metrics.bookedSelf, 14);
  assert.equal(metrics.bookedNonSmsOrUnknown, 28);
  assert.equal(metrics.bookedNonSmsOrUnknownExcludingSelf, 14);
});
