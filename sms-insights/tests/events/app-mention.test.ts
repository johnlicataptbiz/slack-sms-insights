import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';
import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { __resetAppMentionConfigCacheForTests, appMentionCallback } from '../../listeners/events/app-mention.js';
import { __resetAlowareAnalyticsCachesForTests } from '../../services/aloware-analytics.js';
import { __resetChannelAccessCacheForTests } from '../../services/channel-access.js';
import { fakeClient, fakeLogger } from '../helpers.js';

const fakeEvent = {
  channel: 'C1234',
  text: '<@UAPP123> summarize this incident',
  ts: '171234.100',
};

const buildArguments = ({
  client = fakeClient,
  event = fakeEvent,
  logger = fakeLogger,
}: {
  client?: WebClient;
  event?: Record<string, unknown>;
  logger?: typeof fakeLogger;
}): AllMiddlewareArgs & SlackEventMiddlewareArgs<'app_mention'> => {
  return {
    client,
    event,
    logger,
  } as unknown as AllMiddlewareArgs & SlackEventMiddlewareArgs<'app_mention'>;
};

describe('app mention events', () => {
  beforeEach(() => {
    mock.restoreAll();
    __resetAppMentionConfigCacheForTests();
    __resetChannelAccessCacheForTests();
    __resetAlowareAnalyticsCachesForTests();
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'gpt-4.1-mini';
    process.env.ALOWARE_CANVAS_DURABLE_MODE = 'false';
    process.env.ALLOWED_CHANNEL_IDS = 'C1234';
    process.env.ALOWARE_CHANNEL_ID = 'C1234';
    process.env.ALOWARE_DAILY_ANALYSIS_HANDOFF_ENABLED = 'false';
    process.env.ALOWARE_REPORT_CANVAS_ID = '';
    process.env.ALOWARE_REPORT_ARCHIVE_CANVAS_ID = '';
    process.env.ALOWARE_REPORT_HISTORY_LOOKBACK_DAYS = '45';
    delete process.env.ALOWARE_REPORT_CANVAS_TITLE;
    delete process.env.ALOWARE_REPORT_ARCHIVE_CANVAS_TITLE;
    process.env.ALLOW_BOT_APP_MENTIONS = 'false';
    process.env.ALLOWED_BOT_MENTION_IDS = '';
    fakeLogger.resetCalls();
  });

  it('should post aloware analytics reply as broadcast thread reply', async () => {
    const historySpy = mock.method(fakeClient.conversations, 'history', async () => ({
      ok: true,
      messages: [
        {
          ts: '1730000001.000100',
          thread_ts: '1730000001.000100',
          text: 'An agent has sent an SMS ContactTaylor (+1 555-222-2222) Message Want to book a strategy call?',
        },
        {
          ts: '1730000002.000100',
          thread_ts: '1730000001.000100',
          text: 'An agent has received an SMS ContactTaylor (+1 555-222-2222) Message Yes, I am free Friday.',
        },
      ],
      response_metadata: { next_cursor: '' },
    }));
    const postSpy = mock.method(fakeClient.chat, 'postMessage', async () => ({ ok: true }));

    await appMentionCallback(buildArguments({}));

    assert(historySpy.mock.callCount() === 1);
    assert(postSpy.mock.callCount() >= 1);
    const callArgs = postSpy.mock.calls[0].arguments[0] as {
      channel?: string;
      thread_ts?: string;
      reply_broadcast?: boolean;
      text?: string;
    };
    assert(callArgs);
    assert.equal(callArgs.channel, fakeEvent.channel);
    assert.equal(callArgs.thread_ts, fakeEvent.ts);
    assert.equal(callArgs.reply_broadcast, false);
    assert(callArgs.text?.includes('*SMS Insights Core KPI Report*'));
  });

  it('should ignore bot-generated mention events', async () => {
    const historySpy = mock.method(fakeClient.conversations, 'history', async () => ({
      ok: true,
      messages: [],
      response_metadata: { next_cursor: '' },
    }));
    const postSpy = mock.method(fakeClient.chat, 'postMessage', async () => ({ ok: true }));

    await appMentionCallback(
      buildArguments({
        event: {
          ...fakeEvent,
          bot_id: 'B1234',
        },
      }),
    );

    assert(historySpy.mock.callCount() === 0);
    assert(postSpy.mock.callCount() === 0);
  });

  it('should process bot-generated mention events when bot mentions are enabled', async () => {
    process.env.ALLOW_BOT_APP_MENTIONS = 'true';
    const historySpy = mock.method(fakeClient.conversations, 'history', async () => ({
      ok: true,
      messages: [
        {
          ts: '1730000001.000100',
          thread_ts: '1730000001.000100',
          text: 'An agent has sent an SMS ContactJordan (+1 555-333-3333) Message Quick check-in.',
        },
        {
          ts: '1730000002.000100',
          thread_ts: '1730000001.000100',
          text: 'An agent has received an SMS ContactJordan (+1 555-333-3333) Message Thanks.',
        },
      ],
      response_metadata: { next_cursor: '' },
    }));
    const postSpy = mock.method(fakeClient.chat, 'postMessage', async () => ({ ok: true }));

    await appMentionCallback(
      buildArguments({
        event: {
          ...fakeEvent,
          bot_id: 'B1234',
        },
      }),
    );

    assert(historySpy.mock.callCount() === 1);
    assert(postSpy.mock.callCount() >= 1);
  });

  it('should ignore mention events in disallowed channels', async () => {
    const historySpy = mock.method(fakeClient.conversations, 'history', async () => ({
      ok: true,
      messages: [],
      response_metadata: { next_cursor: '' },
    }));
    const postSpy = mock.method(fakeClient.chat, 'postMessage', async () => ({ ok: true }));

    await appMentionCallback(
      buildArguments({
        event: {
          ...fakeEvent,
          channel: 'C9999',
        },
      }),
    );

    assert(historySpy.mock.callCount() === 0);
    assert(postSpy.mock.callCount() === 0);
  });

  it('should block reply-generation requests in aloware channel', async () => {
    const historySpy = mock.method(fakeClient.conversations, 'history', async () => ({
      ok: true,
      messages: [],
      response_metadata: { next_cursor: '' },
    }));
    const postSpy = mock.method(fakeClient.chat, 'postMessage', async () => ({ ok: true }));

    await appMentionCallback(
      buildArguments({
        event: {
          ...fakeEvent,
          text: '<@UAPP123> write a reply for this prospect',
        },
      }),
    );

    assert(historySpy.mock.callCount() === 0);
    assert(postSpy.mock.callCount() === 1);
    const callArgs = postSpy.mock.calls[0].arguments[0] as {
      text?: string;
      thread_ts?: string;
      reply_broadcast?: boolean;
    };
    assert(callArgs);
    assert.equal(callArgs.thread_ts, fakeEvent.ts);
    assert.equal(callArgs.reply_broadcast, false);
    assert.equal(callArgs.text, 'Reply generation is disabled for this channel.');
  });

  it('should append daily report output to canvas when configured', async () => {
    process.env.ALOWARE_REPORT_CANVAS_ID = 'F099CANVAS';

    mock.method(fakeClient.conversations, 'history', async () => ({
      ok: true,
      messages: [
        {
          ts: '1730000001.000100',
          thread_ts: '1730000001.000100',
          text: 'An agent has sent an SMS ContactTaylor (+1 555-222-2222) Message Want to book a strategy call?',
        },
        {
          ts: '1730000002.000100',
          thread_ts: '1730000001.000100',
          text: 'An agent has received an SMS ContactTaylor (+1 555-222-2222) Message Yes, I am free Friday.',
        },
      ],
      response_metadata: { next_cursor: '' },
    }));
    const postSpy = mock.method(fakeClient.chat, 'postMessage', async () => ({ ok: true }));
    const apiCallSpy = mock.method(fakeClient, 'apiCall', async (method: string) => {
      if (method === 'canvases.sections.lookup') {
        return { ok: true, sections: [] };
      }
      return { ok: true };
    });

    await appMentionCallback(
      buildArguments({
        event: {
          ...fakeEvent,
          text: '<@UAPP123> daily report',
        },
      }),
    );

    assert(postSpy.mock.callCount() >= 1);
    assert(apiCallSpy.mock.callCount() >= 1);
    const editCall = apiCallSpy.mock.calls.find((call) => call.arguments[0] === 'canvases.edit');
    assert(editCall);
    const payload = editCall.arguments[1] as { canvas_id?: string };
    assert.equal(payload.canvas_id, 'F099CANVAS');
  });

  it('should append daily report summary to separate summary canvas when enabled', async () => {
    process.env.ALOWARE_REPORT_CANVAS_ID = 'F099CANVAS';
    process.env.ALOWARE_SUMMARY_CANVAS_ENABLED = 'true';
    process.env.ALOWARE_SUMMARY_CANVAS_ID = 'FSUMCANVAS';
    process.env.ALOWARE_SUMMARY_CANVAS_LOOKUP_PERMALINK = 'false';

    mock.method(fakeClient.conversations, 'history', async () => ({
      ok: true,
      messages: [
        {
          ts: '1730000001.000100',
          thread_ts: '1730000001.000100',
          text: 'An agent has sent an SMS ContactTaylor (+1 555-222-2222) Message Want to book a strategy call?',
        },
        {
          ts: '1730000002.000100',
          thread_ts: '1730000001.000100',
          text: 'An agent has received an SMS ContactTaylor (+1 555-222-2222) Message Yes, I am free Friday.',
        },
      ],
      response_metadata: { next_cursor: '' },
    }));
    mock.method(fakeClient.chat, 'postMessage', async () => ({ ok: true, ts: '1730000003.000100' }));
    const apiCallSpy = mock.method(fakeClient, 'apiCall', async (method: string) => {
      if (method === 'canvases.sections.lookup') {
        return { ok: true, sections: [] };
      }
      return { ok: true };
    });

    await appMentionCallback(
      buildArguments({
        event: {
          ...fakeEvent,
          text: '<@UAPP123> daily report',
        },
      }),
    );

    const editCalls = apiCallSpy.mock.calls.filter((call) => call.arguments[0] === 'canvases.edit');
    assert(editCalls.length > 0);
    const summaryCanvasCall = editCalls.find((call) => {
      const payload = call.arguments[1] as { canvas_id?: string };
      return payload.canvas_id === 'FSUMCANVAS';
    });
    assert(summaryCanvasCall);
  });

  it('should look up canvas by title when canvas id is not configured', async () => {
    process.env.ALOWARE_REPORT_CANVAS_ID = '';
    process.env.ALOWARE_REPORT_CANVAS_TITLE = 'Analysis Log Report';

    mock.method(fakeClient.conversations, 'history', async () => ({
      ok: true,
      messages: [
        {
          ts: '1730000001.000100',
          thread_ts: '1730000001.000100',
          text: 'An agent has sent an SMS ContactTaylor (+1 555-222-2222) Message Want to book a strategy call?',
        },
        {
          ts: '1730000002.000100',
          thread_ts: '1730000001.000100',
          text: 'An agent has received an SMS ContactTaylor (+1 555-222-2222) Message Yes, I am free Friday.',
        },
      ],
      response_metadata: { next_cursor: '' },
    }));
    const filesListSpy = mock.method(fakeClient.files, 'list', async () => ({
      ok: true,
      files: [
        {
          id: 'F_LOOKUP',
          title: 'Analysis Log Report',
        },
      ],
    }));
    const postSpy = mock.method(fakeClient.chat, 'postMessage', async () => ({ ok: true }));
    const apiCallSpy = mock.method(fakeClient, 'apiCall', async (method: string) => {
      if (method === 'canvases.sections.lookup') {
        return { ok: true, sections: [] };
      }
      return { ok: true };
    });

    await appMentionCallback(
      buildArguments({
        event: {
          ...fakeEvent,
          text: '<@UAPP123> daily report',
        },
      }),
    );

    assert(postSpy.mock.callCount() >= 1);
    assert(filesListSpy.mock.callCount() === 1);
    assert(apiCallSpy.mock.callCount() >= 1);
    const editCall = apiCallSpy.mock.calls.find((call) => call.arguments[0] === 'canvases.edit');
    assert(editCall);
    const payload = editCall.arguments[1] as { canvas_id?: string };
    assert.equal(payload.canvas_id, 'F_LOOKUP');
  });

  it('should log errors from chat post', async () => {
    const testError = new Error('post failed');
    mock.method(fakeClient.conversations, 'history', async () => ({
      ok: true,
      messages: [
        {
          ts: '1730000001.000100',
          thread_ts: '1730000001.000100',
          text: 'An agent has sent an SMS ContactMorgan (+1 555-444-4444) Message Hello there',
        },
      ],
      response_metadata: { next_cursor: '' },
    }));
    const postSpy = mock.method(fakeClient.chat, 'postMessage', async () => {
      throw testError;
    });

    await appMentionCallback(buildArguments({}));

    assert(postSpy.mock.callCount() === 1);
    assert.deepEqual(fakeLogger.error.mock.calls[0].arguments, [testError]);
  });
});
