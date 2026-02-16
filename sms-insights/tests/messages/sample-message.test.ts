import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';
import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import {
  __resetLeadWatcherMessageCacheForTests,
  sampleMessageCallback,
} from '../../listeners/messages/sample-message.js';
import { __resetChannelAccessCacheForTests } from '../../services/channel-access.js';
import { __resetLeadWatcherConfigCacheForTests } from '../../services/lead-watcher.js';
import { fakeClient, fakeLogger } from '../helpers.js';

const buildArguments = ({
  client = fakeClient,
  context = {},
  event = { ts: '171234.001', channel: 'C1234' },
  logger = fakeLogger,
}: {
  client?: WebClient;
  context?: Record<string, unknown>;
  event?: Record<string, unknown>;
  logger?: typeof fakeLogger;
}): AllMiddlewareArgs & SlackEventMiddlewareArgs<'message'> => {
  return {
    client,
    context,
    event,
    logger,
  } as unknown as AllMiddlewareArgs & SlackEventMiddlewareArgs<'message'>;
};

describe('messages', () => {
  beforeEach(() => {
    mock.restoreAll();
    __resetChannelAccessCacheForTests();
    __resetLeadWatcherConfigCacheForTests();
    __resetLeadWatcherMessageCacheForTests();
    process.env.ALLOWED_CHANNEL_IDS = 'C1234';
    process.env.ALOWARE_CHANNEL_ID = 'C1234';
    process.env.ALOWARE_CANVAS_DURABLE_MODE = 'false';
    process.env.ALOWARE_WATCHER_ENABLED = 'true';
    process.env.ALOWARE_WATCHER_BRANDON_USER_ID = 'UBRANDON';
    process.env.ALOWARE_WATCHER_JACK_USER_ID = 'UJACK';
    process.env.ALOWARE_WATCHER_DEFAULT_ASSIGNEE = 'brandon';
    process.env.ALOWARE_SUMMARY_CANVAS_ENABLED = 'true';
    process.env.ALOWARE_SUMMARY_CANVAS_ID = 'FSUM123';
    process.env.ALOWARE_SUMMARY_CANVAS_LOOKUP_PERMALINK = 'false';
    process.env.ALOWARE_DAILY_ANALYSIS_HANDOFF_ENABLED = 'false';
    fakeLogger.resetCalls();
  });

  it('should post alert for promising inbound lead reply', async () => {
    const postSpy = mock.method(fakeClient.chat, 'postMessage', async () => ({ ok: true }));

    await sampleMessageCallback(buildArguments({}));

    assert.equal(postSpy.mock.callCount(), 0);
    await sampleMessageCallback(
      buildArguments({
        event: {
          channel: 'C1234',
          ts: '171234.111',
          text: 'An agent has received an SMS ContactTaylor (+1 555-222-2222) Message Yes, Friday at 2:30pm works for a call.',
        },
      }),
    );

    assert.equal(postSpy.mock.callCount(), 1);
    const callArgs = postSpy.mock.calls[0]?.arguments[0] as { text?: string; thread_ts?: string };
    assert(callArgs.text?.includes('<@UBRANDON>'));
    assert(callArgs.text?.includes('[Lead Watcher]'));
    assert.equal(callArgs.thread_ts, '171234.111');
  });

  it('should skip outbound and low-signal inbound messages', async () => {
    const postSpy = mock.method(fakeClient.chat, 'postMessage', async () => ({ ok: true }));

    await sampleMessageCallback(
      buildArguments({
        event: {
          channel: 'C1234',
          ts: '171234.002',
          text: 'An agent has sent an SMS ContactTaylor (+1 555-222-2222) Message Want to book?',
        },
      }),
    );
    await sampleMessageCallback(
      buildArguments({
        event: {
          channel: 'C1234',
          ts: '171234.003',
          text: 'An agent has received an SMS ContactTaylor (+1 555-222-2222) Message Thanks!',
        },
      }),
    );

    assert.equal(postSpy.mock.callCount(), 0);
  });

  it('should log error when chat.postMessage throws', async () => {
    const testError = new Error('test exception');
    mock.method(fakeClient.chat, 'postMessage', async () => {
      throw testError;
    });

    await sampleMessageCallback(
      buildArguments({
        event: {
          channel: 'C1234',
          ts: '171234.004',
          text: 'An agent has received an SMS ContactTaylor (+1 555-222-2222) Message I am interested and can do Tuesday.',
        },
      }),
    );

    assert.deepEqual(fakeLogger.error.mock.calls[0].arguments, [testError]);
  });

  it('should not re-alert for duplicate message ts', async () => {
    const postSpy = mock.method(fakeClient.chat, 'postMessage', async () => ({ ok: true }));
    const event = {
      channel: 'C1234',
      ts: '171234.005',
      text: 'An agent has received an SMS ContactTaylor (+1 555-222-2222) Message I am available Wednesday morning.',
    };

    await sampleMessageCallback(buildArguments({ event }));
    await sampleMessageCallback(buildArguments({ event }));

    assert.equal(postSpy.mock.callCount(), 1);
  });

  it('should write daily snapshot replies to summary canvas as compact daily summaries', async () => {
    mock.method(fakeClient.chat, 'postMessage', async () => ({ ok: true }));
    const apiCallSpy = mock.method(fakeClient, 'apiCall', async (method: string) => {
      if (method === 'canvases.sections.lookup') {
        return { ok: true, sections: [] };
      }
      return { ok: true };
    });

    await sampleMessageCallback(
      buildArguments({
        event: {
          channel: 'C1234',
          ts: '171234.006',
          thread_ts: '171234.001',
          user: 'U_SMS_INSIGHTS',
          text: [
            '*PT BIZ - DAILY SMS SNAPSHOT*',
            '*Rep: Jack Licata*',
            '- Outbound Conversations: 26',
            '- Bookings: 1',
            '- Opt Outs: 1',
            '*Sequence Specific KPIs (24h)*',
            '- Alpha Sequence: sent 26, replies received 2 (7.7% response rate), bookings 1 (3.8% per conversation), opt-outs 1 (3.8%)',
          ].join('\n'),
        },
      }),
    );

    const editCalls = apiCallSpy.mock.calls.filter((call) => call.arguments[0] === 'canvases.edit');
    assert(editCalls.length > 0);

    const summaryInsertCall = editCalls.find((call) => {
      const payload = call.arguments[1] as
        | { canvas_id?: string; changes?: Array<{ document_content?: { markdown?: string } }> }
        | undefined;
      const markdown = payload?.changes?.[0]?.document_content?.markdown || '';
      return (
        payload?.canvas_id === 'FSUM123' &&
        markdown.includes('Daily Report Summary') &&
        markdown.includes('Messages sent:')
      );
    });
    assert(summaryInsertCall);
  });
});
