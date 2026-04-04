import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeContactNameKey, resolveBookedCallSmsReplyLink } from '../../services/booked-calls.js';

describe('booked-calls reply-link helpers', () => {
  it('normalizes contact names for fallback matching', () => {
    assert.equal(normalizeContactNameKey('  John   Doe  '), 'john doe');
    assert.equal(normalizeContactNameKey(''), null);
    assert.equal(normalizeContactNameKey(null), null);
  });

  it('matches prior inbound reply by contact name when phone is missing', () => {
    const bookingTs = Date.parse('2026-02-22T18:00:00.000Z');
    const link = resolveBookedCallSmsReplyLink(
      {
        key: 'row-1',
        phoneKey: null,
        contactNameKey: 'jane smith',
        bookingTs,
      },
      {
        inboundByPhone: new Map(),
        inboundByName: new Map([['jane smith', [Date.parse('2026-02-20T10:00:00.000Z')]]]),
      },
    );

    assert.equal(link.hasPriorReply, true);
    assert.equal(link.reason, 'matched_reply_before_booking');
    assert.equal(link.latestReplyAt, '2026-02-20T10:00:00.000Z');
  });

  it('returns no_contact_phone when no phone and no name are available', () => {
    const link = resolveBookedCallSmsReplyLink(
      {
        key: 'row-2',
        phoneKey: null,
        contactNameKey: null,
        bookingTs: Date.parse('2026-02-22T18:00:00.000Z'),
      },
      {
        inboundByPhone: new Map(),
        inboundByName: new Map(),
      },
    );

    assert.equal(link.hasPriorReply, false);
    assert.equal(link.reason, 'no_contact_phone');
    assert.equal(link.latestReplyAt, null);
  });

  it('returns no_reply_before_booking when reply is outside lookback window', () => {
    const link = resolveBookedCallSmsReplyLink(
      {
        key: 'row-3',
        phoneKey: null,
        contactNameKey: 'jane smith',
        bookingTs: Date.parse('2026-02-22T18:00:00.000Z'),
      },
      {
        inboundByPhone: new Map(),
        inboundByName: new Map([['jane smith', [Date.parse('2026-01-20T10:00:00.000Z')]]]),
      },
    );

    assert.equal(link.hasPriorReply, false);
    assert.equal(link.reason, 'no_reply_before_booking');
    assert.equal(link.latestReplyAt, null);
  });
});
