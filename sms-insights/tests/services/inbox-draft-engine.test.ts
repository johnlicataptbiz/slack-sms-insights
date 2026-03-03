import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  buildContextualFallbackDraft,
  classifyEscalationLevel,
  lintDraft,
} from '../../services/inbox-draft-engine.js';
import type { ConversationStateRow, InboxMessageRow } from '../../services/inbox-store.js';

const makeMessage = (params: {
  id: string;
  body: string;
  direction?: InboxMessageRow['direction'];
  tsOffsetMinutes?: number;
}): InboxMessageRow => ({
  id: params.id,
  conversation_id: 'c1',
  event_ts: new Date(Date.now() + (params.tsOffsetMinutes || 0) * 60_000).toISOString(),
  direction: params.direction || 'inbound',
  body: params.body,
  sequence: null,
  line: null,
  aloware_user: null,
  slack_channel_id: 'C1',
  slack_message_ts: `${params.id}.000`,
});

const baseMessage = (body: string): InboxMessageRow => makeMessage({ id: 'm1', body });

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
      qualification_delivery_model: 'unknown',
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

  it('flags unicode and overlength drafts for SMS reliability', () => {
    const text = `Hey Jason 👋 ${'a'.repeat(340)}?`;
    const lint = lintDraft(text);
    assert.ok(lint.issues.some((issue) => issue.code === 'unicode_risky_for_sms'));
    assert.ok(lint.issues.some((issue) => issue.code === 'overlength_sms'));
  });

  it('golden: soft deferral reply does not hard-close and does not restart thread intro', () => {
    const draft = buildContextualFallbackDraft({
      messages: [
        makeMessage({
          id: 'm1',
          direction: 'outbound',
          body: 'Jason that context helps a lot. What weekdays work best and AM or PM?',
          tsOffsetMinutes: -45,
        }),
        makeMessage({
          id: 'm2',
          direction: 'inbound',
          body: "I have some more research, a few meetings, and revisions before taking that step, but I'll keep this in mind for when I'm ready.",
          tsOffsetMinutes: -10,
        }),
      ],
      state: null,
      escalationLevel: 2,
      missingFields: ['coaching_interest'],
      contact: { name: 'Jason Karstens', ownerLabel: 'jack' },
      preferredOwnerVoice: 'jack',
      rankedExamples: [],
    });

    assert.ok(!/^hey jason/i.test(draft));
    assert.ok(!/what weekday works best|am or pm/i.test(draft));
    assert.match(draft.toLowerCase(), /check back|ping me/);
  });

  it('golden: new thread can include name naturally', () => {
    const draft = buildContextualFallbackDraft({
      messages: [makeMessage({ id: 'm1', direction: 'inbound', body: 'I am mostly cash and part time right now.' })],
      state: null,
      escalationLevel: 2,
      missingFields: ['niche'],
      contact: { name: 'Jason', ownerLabel: 'jack' },
      preferredOwnerVoice: 'jack',
      rankedExamples: [],
    });
    assert.match(draft.toLowerCase(), /^jason,/);
  });
});
