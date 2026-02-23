import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { toEnvelope, toRunsListV2, toSalesMetricsV2, toWeeklyManagerSummaryV2 } from '../../api/v2-contract.js';
import type { DailyRunRow } from '../../services/daily-run-logger.js';

describe('v2 contract mappers', () => {
  it('maps sales metrics into canonical/diagnostic split without deprecated aliases', () => {
    const v2 = toSalesMetricsV2({
      timeRange: { from: '2026-02-20T06:00:00.000Z', to: '2026-02-21T05:59:59.999Z' },
      totals: {
        messagesSent: 100,
        manualMessagesSent: 20,
        sequenceMessagesSent: 80,
        peopleContacted: 75,
        manualPeopleContacted: 15,
        sequencePeopleContacted: 60,
        repliesReceived: 12,
        replyRatePct: 16,
        manualRepliesReceived: 4,
        manualReplyRatePct: 26.6,
        sequenceRepliesReceived: 8,
        sequenceReplyRatePct: 13.3,
        booked: 9,
        optOuts: 3,
      },
      trendByDay: [
        {
          day: '2026-02-20',
          messagesSent: 100,
          manualMessagesSent: 20,
          sequenceMessagesSent: 80,
          peopleContacted: 75,
          repliesReceived: 12,
          replyRatePct: 16,
          manualRepliesReceived: 4,
          manualReplyRatePct: 26.6,
          sequenceRepliesReceived: 8,
          sequenceReplyRatePct: 13.3,
          booked: 9,
          optOuts: 3,
        },
      ],
      topSequences: [
        {
          label: 'A',
          messagesSent: 50,
          repliesReceived: 10,
          replyRatePct: 20,
          bookingSignalsSms: 5,
          optOuts: 2,
          slackBookedCalls: 3,
          slackBookedJack: 2,
          slackBookedBrandon: 1,
          slackBookedSelf: 0,
        },
      ],
      repLeaderboard: [
        {
          repName: 'Jack',
          outboundConversations: 40,
          bookingSignalsSms: 4,
          replyRatePct: 10,
          optOuts: 1,
        },
      ],
      bookedCalls: {
        booked: 9,
        jack: 5,
        brandon: 2,
        selfBooked: 2,
      },
      meta: {
        sequenceBookedAttribution: {
          source: 'slack_booked_calls',
          model: 'hubspot_first_conversion_fuzzy_v1',
          totalCalls: 9,
          matchedCalls: 8,
          unattributedCalls: 1,
          manualCalls: 2,
        },
      },
    });

    assert.equal(v2.totals.canonicalBookedCalls, 9);
    assert.equal(v2.processing.model, 'live_rolling_metrics');
    assert.equal(v2.processing.source, 'continuous_sms_events_and_booked_calls');
    assert.equal(v2.bookedCredit.jack, 5);
    assert.equal(v2.sequences[0]?.diagnosticSmsBookingSignals, 5);
    assert.equal(v2.sequences[0]?.canonicalBookedCalls, 3);
  });

  it('builds envelope metadata and run list pagination', () => {
    const row: DailyRunRow = {
      id: 'run_1',
      timestamp: '2026-02-20T17:00:00.000Z',
      channel_id: 'C123',
      channel_name: 'ops',
      report_date: '2026-02-20',
      report_type: 'daily',
      status: 'success',
      error_message: null,
      summary_text: 'ok',
      full_report: 'report',
      duration_ms: 100,
      is_legacy: false,
      created_at: '2026-02-20T17:01:00.000Z',
    };

    const payload = toRunsListV2({
      rows: [row],
      limit: 50,
      offset: 0,
      daysBack: 7,
      legacyMode: 'exclude',
    });

    const envelope = toEnvelope({ data: payload, timeZone: 'America/Chicago', requestedMode: 'range' });

    assert.equal(envelope.meta.schemaVersion, '2026.1');
    assert.equal(envelope.meta.timeZone, 'America/Chicago');
    assert.equal(envelope.data.pagination.count, 1);
    assert.equal(envelope.data.items[0]?.processing.model, 'snapshot_report');
    assert.equal(envelope.data.items[0]?.processing.derivedFrom, 'continuous_sms_events_and_booked_calls');
    assert.equal(envelope.data.items[0]?.isLegacy, false);
  });

  it('maps weekly manager summary shape into v2 type', () => {
    const weekly = toWeeklyManagerSummaryV2({
      window: {
        weekStart: '2026-02-16',
        weekEnd: '2026-02-22',
        timeZone: 'America/Chicago',
      },
      sources: {
        monday: {
          boardId: '5077164868',
          status: 'ready',
          enabled: true,
          lastSyncAt: '2026-02-22T12:00:00.000Z',
          staleThresholdHours: 24,
        },
        generatedAt: '2026-02-22T12:00:00.000Z',
      },
      teamTotals: {
        messagesSent: 1100,
        peopleContacted: 900,
        repliesReceived: 120,
        replyRatePct: 13.3,
        canonicalBookedCalls: 46,
        optOuts: 12,
      },
      setters: {
        jack: {
          outboundConversations: 100,
          replyRatePct: 12.5,
          diagnosticSmsBookingSignals: 4,
          canonicalBookedCalls: 21,
          optOuts: 4,
        },
        brandon: {
          outboundConversations: 40,
          replyRatePct: 11.2,
          diagnosticSmsBookingSignals: 3,
          canonicalBookedCalls: 7,
          optOuts: 2,
        },
      },
      mondayPipeline: {
        totalCalls: 60,
        booked: 46,
        noShow: 9,
        cancelled: 5,
        stageBreakdown: [{ stage: 'Booked', count: 46 }],
      },
      topWins: [
        {
          sequence: 'Cash Practice Field Manual - 2026 v1.2',
          canonicalBookedCalls: 7,
          messagesSent: 122,
          replyRatePct: 13.9,
        },
      ],
      atRiskFlags: [
        { severity: 'med', title: 'Sequence opt-out risk', detail: 'No sequence has elevated opt-out rate.' },
      ],
      actionsNextWeek: ['Reduce volume on high opt-out sequences'],
    });

    assert.equal(weekly.sources.monday.status, 'ready');
    assert.equal(weekly.teamTotals.canonicalBookedCalls, 46);
    assert.equal(weekly.topWins[0]?.canonicalBookedCalls, 7);
  });
});
