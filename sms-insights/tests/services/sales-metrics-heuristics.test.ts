import assert from 'node:assert';
import { describe, it } from 'node:test';
import { isHighConfidenceBookingSignal } from '../../services/sales-metrics.js';

describe('sales metrics booking heuristic', () => {
  it('accepts high-confidence booking indicators', () => {
    assert.equal(isHighConfidenceBookingSignal('inbound', 'I just booked call for Tuesday morning.'), true);
    assert.equal(
      isHighConfidenceBookingSignal('outbound', 'https://vip.physicaltherapybiz.com/call-booked?foo=bar'),
      true,
    );
    assert.equal(isHighConfidenceBookingSignal('inbound', 'appointment confirmed, see you then'), true);
  });

  it('rejects broad false positives', () => {
    assert.equal(isHighConfidenceBookingSignal('inbound', 'Can we do a call this Friday?'), false);
    assert.equal(isHighConfidenceBookingSignal('inbound', 'Wednesday works best at 3:00 pm.'), false);
    assert.equal(isHighConfidenceBookingSignal('inbound', 'call me when you can'), false);
  });

  it('rejects cancellations even if booking words appear', () => {
    assert.equal(isHighConfidenceBookingSignal('inbound', 'Please cancel my appointment, remove me.'), false);
    assert.equal(isHighConfidenceBookingSignal('inbound', 'cancel booked call'), false);
  });
});
