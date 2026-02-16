import assert from 'node:assert';
import { describe, it } from 'node:test';
import { isReplyGenerationRequest } from '../../services/aloware-policy.js';

describe('aloware policy', () => {
  it('should flag direct reply-generation phrasings', () => {
    const blockedPrompts = [
      'draft a reply to this lead',
      'what should i say to this prospect?',
      'can you write a text message for this follow up',
      'suggest reply options',
      'send a text to the customer',
      'how should i respond to them',
      'message draft please',
    ];

    for (const prompt of blockedPrompts) {
      assert.equal(isReplyGenerationRequest(prompt), true, `expected blocked: ${prompt}`);
    }
  });

  it('should allow analysis-only phrasings', () => {
    const allowedPrompts = [
      'classify this lead by intent and risk',
      'summarize this thread and next internal action',
      'analyze response rate trend from these updates',
      'what compliance risks are present in this message',
      'who should own next action on this lead',
    ];

    for (const prompt of allowedPrompts) {
      assert.equal(isReplyGenerationRequest(prompt), false, `expected allowed: ${prompt}`);
    }
  });
});
