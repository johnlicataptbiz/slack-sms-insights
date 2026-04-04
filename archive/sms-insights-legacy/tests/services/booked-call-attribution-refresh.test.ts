import assert from 'node:assert';
import { describe, it } from 'node:test';
import { resolveBestConversationCandidate } from '../../services/booked-call-attribution-refresh.js';

describe('booked-call attribution refresh', () => {
  it('prefers email-backed profile matches over phone-only proximity', () => {
    const bookingTs = new Date('2026-03-18T18:00:00.000Z').getTime();
    const result = resolveBestConversationCandidate(bookingTs, [
      {
        conversationId: 'conv_phone_only',
        lastTouchAtMs: new Date('2026-03-18T17:59:20.000Z').getTime(),
        evidence: new Set(['conversation_phone']),
      },
      {
        conversationId: 'conv_email_profile',
        lastTouchAtMs: new Date('2026-03-18T16:30:00.000Z').getTime(),
        evidence: new Set(['profile_email']),
      },
    ]);

    assert.equal(result.conversationId, 'conv_email_profile');
    assert.equal(result.evidence, 'profile_email');
    assert.ok((result.confidence || 0) > 0.95);
  });

  it('boosts candidates confirmed by multiple signals', () => {
    const bookingTs = new Date('2026-03-18T18:00:00.000Z').getTime();
    const result = resolveBestConversationCandidate(bookingTs, [
      {
        conversationId: 'conv_name_only',
        lastTouchAtMs: new Date('2026-03-18T17:50:00.000Z').getTime(),
        evidence: new Set(['profile_name']),
      },
      {
        conversationId: 'conv_multi_signal',
        lastTouchAtMs: new Date('2026-03-18T15:00:00.000Z').getTime(),
        evidence: new Set(['profile_phone', 'conversation_phone']),
      },
    ]);

    assert.equal(result.conversationId, 'conv_multi_signal');
    assert.equal(result.evidence, 'profile_phone');
    assert.ok((result.confidence || 0) > 0.93);
  });
});
