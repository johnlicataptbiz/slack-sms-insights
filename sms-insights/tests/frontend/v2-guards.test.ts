import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertRunsListV2Envelope,
  assertSalesMetricsBatchV2Envelope,
  assertSalesMetricsV2Envelope,
  assertWeeklySummaryV2Envelope,
} from '../../../frontend/src/api/v2Guards.js';

test('v2 guards accept minimally valid sales metrics envelope', () => {
  const response = {
    meta: {
      schemaVersion: '2026.1',
      generatedAt: new Date().toISOString(),
      timeZone: 'America/Chicago',
      requestedMode: 'range',
    },
    data: {
      timeRange: { from: '2026-02-20T00:00:00Z', to: '2026-02-21T00:00:00Z' },
      totals: { messagesSent: 1, canonicalBookedCalls: 1 },
      bookedCredit: { total: 1, jack: 1, brandon: 0, selfBooked: 0 },
      trendByDay: [],
      sequences: [],
      reps: [],
      provenance: { canonicalBookedSource: 'slack', diagnosticBookingSignalsSource: 'sms_heuristics' },
    },
  };

  assert.doesNotThrow(() => assertSalesMetricsV2Envelope(response));
});

test('v2 guards reject malformed runs envelope', () => {
  const bad = {
    meta: { schemaVersion: '2026.1', generatedAt: new Date().toISOString(), timeZone: 'America/Chicago' },
    data: {
      items: [{ id: 'r1', timestamp: '2026-02-20T00:00:00Z', channelId: 'C', reportType: 'daily', status: 'success' }],
      pagination: { count: 1 },
      filters: { daysBack: 7, channelId: null, legacyMode: 'exclude' },
    },
  };

  assert.throws(() => assertRunsListV2Envelope(bad));
});

test('v2 guards accept weekly summary envelope', () => {
  const response = {
    meta: {
      schemaVersion: '2026.1',
      generatedAt: new Date().toISOString(),
      timeZone: 'America/Chicago',
    },
    data: {
      window: { weekStart: '2026-02-16', weekEnd: '2026-02-22', timeZone: 'America/Chicago' },
      sources: {
        monday: {
          boardId: '5077164868',
          status: 'ready',
          enabled: true,
          lastSyncAt: new Date().toISOString(),
          staleThresholdHours: 24,
        },
        generatedAt: new Date().toISOString(),
      },
      teamTotals: {
        messagesSent: 100,
        peopleContacted: 80,
        repliesReceived: 10,
        replyRatePct: 12.5,
        canonicalBookedCalls: 7,
        optOuts: 2,
      },
      setters: {
        jack: {
          outboundConversations: 50,
          replyRatePct: 10,
          diagnosticSmsBookingSignals: 2,
          canonicalBookedCalls: 4,
          optOuts: 1,
        },
        brandon: {
          outboundConversations: 20,
          replyRatePct: 15,
          diagnosticSmsBookingSignals: 1,
          canonicalBookedCalls: 3,
          optOuts: 1,
        },
      },
      mondayPipeline: {
        totalCalls: 10,
        booked: 7,
        noShow: 2,
        cancelled: 1,
        stageBreakdown: [{ stage: 'Booked', count: 7 }],
      },
      topWins: [{ sequence: 'Guide v1', canonicalBookedCalls: 2, messagesSent: 20, replyRatePct: 10 }],
      atRiskFlags: [{ severity: 'med', title: 'Sequence opt-out risk', detail: 'Example risk' }],
      actionsNextWeek: ['Adjust sequence copy'],
    },
  };

  assert.doesNotThrow(() => assertWeeklySummaryV2Envelope(response));
});

test('v2 guards accept sales metrics batch envelope', () => {
  const response = {
    meta: {
      schemaVersion: '2026.1',
      generatedAt: new Date().toISOString(),
      timeZone: 'America/Chicago',
      requestedMode: 'day',
    },
    data: {
      items: [
        {
          day: '2026-02-20',
          metrics: {
            timeRange: { from: '2026-02-20T00:00:00Z', to: '2026-02-20T23:59:59Z' },
            totals: { messagesSent: 1, canonicalBookedCalls: 1 },
            bookedCredit: { total: 1, jack: 1, brandon: 0, selfBooked: 0 },
            trendByDay: [],
            sequences: [],
            reps: [],
            provenance: { canonicalBookedSource: 'slack', diagnosticBookingSignalsSource: 'sms_heuristics' },
          },
        },
      ],
    },
  };

  assert.doesNotThrow(() => assertSalesMetricsBatchV2Envelope(response));
});
