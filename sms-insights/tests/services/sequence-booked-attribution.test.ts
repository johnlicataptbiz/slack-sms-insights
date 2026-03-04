import assert from 'node:assert';
import { describe, it } from 'node:test';
import {
  attributeSlackBookedCallsToSequences,
  MANUAL_SEQUENCE_LABEL,
} from '../../services/sequence-booked-attribution.js';

describe('sequence booked-call attribution', () => {
  it('maps HubSpot first-conversion text to the closest sequence label and keeps bucket credit', () => {
    const rows = [
      {
        label: 'Cash Practice Field Manual - 2026 v1.2',
        messagesSent: 42,
        repliesReceived: 7,
        replyRatePct: 16.7,
        bookingSignalsSms: 0,
        booked: 0,
        optOuts: 1,
      },
      {
        label: 'Cash Practice Field Manual - 2026 v1.0',
        messagesSent: 8,
        repliesReceived: 1,
        replyRatePct: 12.5,
        bookingSignalsSms: 0,
        booked: 0,
        optOuts: 0,
      },
      {
        label: MANUAL_SEQUENCE_LABEL,
        messagesSent: 10,
        repliesReceived: 2,
        replyRatePct: 20,
        bookingSignalsSms: 0,
        booked: 0,
        optOuts: 0,
      },
    ];

    const calls = [
      {
        eventTs: '2026-02-20T21:00:00.000Z',
        bucket: 'jack' as const,
        firstConversion: 'The Cash-Based Practice Field Manual: Cash Practice Field Manual',
        text: 'New booked call.',
      },
      {
        eventTs: '2026-02-20T21:05:00.000Z',
        bucket: 'brandon' as const,
        firstConversion: 'Meetings Link: pt-biz/discovery-call-open-schedule',
        text: 'New booked call.',
      },
      {
        eventTs: '2026-02-20T21:10:00.000Z',
        bucket: 'selfBooked' as const,
        firstConversion: 'Unknown source that does not match',
        text: 'New booked call.',
      },
    ];

    const result = attributeSlackBookedCallsToSequences(rows, calls);

    const cpfm = result.byLabel.get('Cash Practice Field Manual - 2026 v1.2');
    assert.equal(cpfm?.booked, 1);
    assert.equal(cpfm?.jack, 1);

    const manual = result.byLabel.get(MANUAL_SEQUENCE_LABEL);
    assert.equal(manual?.booked, 1);
    assert.equal(manual?.brandon, 1);

    assert.equal(result.totals.totalCalls, 3);
    assert.equal(result.totals.matchedCalls, 2);
    assert.equal(result.totals.unattributedCalls, 1);
    assert.equal(result.totals.manualCalls, 1);
    assert.equal(result.totals.booked, 3);
    assert.equal(result.totals.jack, 1);
    assert.equal(result.totals.brandon, 1);
    assert.equal(result.totals.selfBooked, 1);
  });

  it('keeps booking credit on originating sequence even when latest SMS sequence differs', () => {
    const rows = [
      {
        label: 'Cash Practice Field Manual - 2026 v1.2',
        messagesSent: 60,
        repliesReceived: 12,
        replyRatePct: 20,
        bookingSignalsSms: 0,
        booked: 0,
        optOuts: 1,
      },
      {
        label: 'Call Pitched NO Reply - 2026 v1.0',
        messagesSent: 30,
        repliesReceived: 5,
        replyRatePct: 16.7,
        bookingSignalsSms: 0,
        booked: 0,
        optOuts: 0,
      },
    ];

    const calls = [
      {
        bookedCallId: 'bc_123',
        eventTs: '2026-03-01T18:00:00.000Z',
        bucket: 'jack' as const,
        firstConversion: 'Cash Practice Field Manual',
        rep: 'Jack',
        line: null,
        contactName: 'Test Lead',
        contactPhone: '+1 (555) 111-2222',
        slackChannelId: 'C_BOOKED',
        slackMessageTs: '1700000000.000100',
        text: 'Booked call',
      },
    ];

    const smsReplyLinks = new Map([
      [
        'C_BOOKED::1700000000.000100',
        {
          hasPriorReply: true,
          latestReplyAt: '2026-02-28T14:21:00.000Z',
          reason: 'matched_reply_before_booking' as const,
        },
      ],
    ]);

    const smsSequenceLookup = new Map([
      [
        'bc_123',
        {
          // Simulates the lead being in a later follow-up sequence at booking time.
          sequenceLabel: 'Call Pitched NO Reply - 2026 v1.0',
          latestOutboundAt: '2026-03-01T16:12:00.000Z',
        },
      ],
    ]);

    const result = attributeSlackBookedCallsToSequences(rows, calls, smsReplyLinks, smsSequenceLookup);

    const originating = result.byLabel.get('Cash Practice Field Manual - 2026 v1.2');
    assert.equal(originating?.booked, 1);
    assert.equal(originating?.jack, 1);
    assert.equal(originating?.bookedAfterSmsReply, 1);

    const followUp = result.byLabel.get('Call Pitched NO Reply - 2026 v1.0');
    assert.equal(followUp?.booked ?? 0, 0);

    const audit = originating?.auditRows[0];
    assert.ok(audit);
    assert.equal(audit?.attributionSource, 'fuzzy_text_match');
    assert.equal(audit?.convertedViaSequence, 'Call Pitched NO Reply - 2026 v1.0');
    assert.equal(audit?.smsSequenceLabel, 'Call Pitched NO Reply - 2026 v1.0');
  });
});
