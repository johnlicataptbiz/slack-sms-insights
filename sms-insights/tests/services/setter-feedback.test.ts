import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';
import type { WebClient } from '@slack/web-api';
import { requestSetterFeedback, __resetSetterFeedbackCacheForTests } from '../../services/setter-feedback.js';
import { fakeClient, fakeLogger } from '../helpers.js';

describe('setter-feedback service', () => {
  beforeEach(() => {
    mock.restoreAll();
    process.env.CLAUDE_ASSISTANT_USER_ID = 'UCLAUDE';
    process.env.ALOWARE_WATCHER_JACK_USER_ID = 'UJACK';
    process.env.ALOWARE_SETTER_FEEDBACK_ENABLED = 'true';
  });

  it('should NOT post feedback for automated sequence outbound messages', async () => {
    const postSpy = mock.method((fakeClient as unknown as WebClient).chat, 'postMessage', async () => ({ ok: true }));

    const fields = {
      direction: 'outbound',
      user: 'Jack',
      body: 'Quick follow-up from sequence',
      contactName: 'Taylor',
      contactPhone: '+15552223333',
      contactId: '1',
      line: 'Line A',
      sequence: 'BOOK- BUYER Intro Flow',
    } as any;

    await requestSetterFeedback({ client: fakeClient as unknown as WebClient, fields, logger: fakeLogger, ts: '171000.100', channelId: 'C1234' });

    assert.equal(postSpy.mock.callCount(), 0);
  });

  it('should post feedback for manual outbound messages (no sequence)', async () => {
    __resetSetterFeedbackCacheForTests();
    const postSpy = mock.method((fakeClient as unknown as WebClient).chat, 'postMessage', async () => ({ ok: true }));

    const fields = {
      direction: 'outbound',
      user: 'Jack',
      body: 'Manual reply sent by Jack',
      contactName: 'Taylor',
      contactPhone: '+15552223333',
      contactId: '1',
      line: 'Line A',
      sequence: '',
    } as any;

    await requestSetterFeedback({ client: fakeClient as unknown as WebClient, fields, logger: fakeLogger, ts: '171000.101', channelId: 'C1234' });

    assert.equal(postSpy.mock.callCount(), 1);
    const callArgs = postSpy.mock.calls[0]?.arguments[0] as { text?: string };
    assert(callArgs.text?.includes('*Setter Coaching Feedback Request*'));
  });

  it('should dedupe repeated setter-feedback requests for the same thread within TTL', async () => {
    __resetSetterFeedbackCacheForTests();
    process.env.ALOWARE_SETTER_FEEDBACK_ENABLED = 'true';
    process.env.ALOWARE_SETTER_FEEDBACK_DEDUPE_MINUTES = '10';

    const postSpy = mock.method((fakeClient as unknown as WebClient).chat, 'postMessage', async () => ({ ok: true }));

    const fields = {
      direction: 'outbound',
      user: 'Jack',
      body: 'Manual reply sent by Jack',
      contactName: 'Taylor',
      contactPhone: '+15552223333',
      contactId: '1',
      line: 'Line A',
      sequence: '',
    } as any;

    // first call -> should post
    await requestSetterFeedback({ client: fakeClient as unknown as WebClient, fields, logger: fakeLogger, ts: '171000.200', channelId: 'C1234' });
    // second call within dedupe window -> should NOT post
    await requestSetterFeedback({ client: fakeClient as unknown as WebClient, fields, logger: fakeLogger, ts: '171000.200', channelId: 'C1234' });

    assert.equal(postSpy.mock.callCount(), 1);

    // different thread -> should post again
    await requestSetterFeedback({ client: fakeClient as unknown as WebClient, fields, logger: fakeLogger, ts: '171000.201', channelId: 'C1234' });
    assert.equal(postSpy.mock.callCount(), 2);
  });
});