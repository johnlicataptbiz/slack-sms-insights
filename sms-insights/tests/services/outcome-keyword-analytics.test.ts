import assert from 'node:assert';
import { describe, it } from 'node:test';
import { buildOutcomeKeywordAnalytics } from '../../services/outcome-keyword-analytics.js';

describe('outcome keyword analytics', () => {
  it('finds phrases that over-index for a specific outcome', () => {
    const result = buildOutcomeKeywordAnalytics(
      [
        { conversationId: 'c1', outcome: 'budget', body: 'This is too expensive for me right now.' },
        { conversationId: 'c2', outcome: 'budget', body: 'Honestly the price is too expensive.' },
        { conversationId: 'c3', outcome: 'joined', body: 'This sounds great. I am ready to join.' },
        { conversationId: 'c4', outcome: 'joined', body: 'Ready to join. This sounds great.' },
      ],
      { minConversations: 2, minWords: 1, maxWords: 2, limitPerOutcome: 10 },
    );

    const budget = result.outcomes.find((row) => row.outcome === 'budget');
    assert.ok(budget);
    assert.equal(budget?.conversationCount, 2);
    assert.ok(budget?.topKeywords.some((row) => row.phrase === 'expensive'));

    const joined = result.outcomes.find((row) => row.outcome === 'joined');
    assert.ok(joined?.topKeywords.some((row) => row.phrase === 'ready join' || row.phrase === 'sounds great'));
  });

  it('counts phrases once per conversation to avoid message spam inflation', () => {
    const result = buildOutcomeKeywordAnalytics(
      [
        { conversationId: 'c1', outcome: 'ghosted', body: 'Following up next week.' },
        { conversationId: 'c1', outcome: 'ghosted', body: 'Following up again next week.' },
        { conversationId: 'c2', outcome: 'ghosted', body: 'Next week works better.' },
      ],
      { minConversations: 2, minWords: 1, maxWords: 2, limitPerOutcome: 10 },
    );

    const ghosted = result.outcomes.find((row) => row.outcome === 'ghosted');
    const nextWeek = ghosted?.topKeywords.find((row) => row.phrase === 'next week');
    assert.ok(nextWeek);
    assert.equal(nextWeek?.outcomeConversations, 2);
  });
});
