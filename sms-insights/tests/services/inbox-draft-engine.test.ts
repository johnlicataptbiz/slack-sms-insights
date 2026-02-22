import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { classifyEscalationLevel, lintDraft } from '../../services/inbox-draft-engine.js';
import type { ConversationStateRow, InboxMessageRow } from '../../services/inbox-store.js';

const baseMessage = (body: string): InboxMessageRow => ({
  id: 'm1',
  conversation_id: 'c1',
  event_ts: new Date().toISOString(),
  direction: 'inbound',
  body,
  sequence: null,
  line: null,
  aloware_user: null,
  slack_channel_id: 'C1',
  slack_message_ts: '1.000',
});

describe('inbox draft engine', () => {
  it('classifies objection messages as escalation level 2', () => {
    const result = classifyEscalationLevel([baseMessage('I want this but it feels too expensive right now')], null);
    assert.equal(result.level, 2);
  });

  it('classifies scaling signals as escalation level 4', () => {
    const result = classifyEscalationLevel(
      [baseMessage('we are stuck with hiring and systems are breaking down')],
      null,
    );
    assert.equal(result.level, 4);
  });

  it('respects manual escalation override from conversation state', () => {
    const state: ConversationStateRow = {
      conversation_id: 'c1',
      qualification_full_or_part_time: 'unknown',
      qualification_niche: null,
      qualification_revenue_mix: 'unknown',
      qualification_coaching_interest: 'unknown',
      qualification_progress_step: 0,
      escalation_level: 3,
      escalation_reason: 'manual override',
      escalation_overridden: true,
      last_podcast_sent_at: null,
      next_followup_due_at: null,
      cadence_status: 'idle',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const result = classifyEscalationLevel([baseMessage('student, still curious')], state);
    assert.equal(result.level, 3);
    assert.match(result.reason, /manual/i);
  });

  it('fails lint when draft includes hyphen characters', () => {
    const lint = lintDraft('Sounds good - are you full time right now?');
    assert.equal(lint.passed, false);
    assert.ok(lint.issues.some((issue) => issue.code === 'forbidden_dash_character'));
  });

  it('fails lint when draft includes bullet formatting', () => {
    const lint = lintDraft('- First point\n- Second point\nAre you open to a call?');
    assert.equal(lint.passed, false);
    assert.ok(lint.issues.some((issue) => issue.code === 'forbidden_bullet_list'));
  });

  it('passes lint for plain conversational draft with CTA question', () => {
    const lint = lintDraft('Love where you are headed. Are you full time right now or still part time in clinic?');
    assert.equal(lint.passed, true);
  });
});
