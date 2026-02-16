import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';
import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { sampleCommandCallback } from '../../listeners/commands/sample-command.js';
import { __resetAlowareAnalyticsCachesForTests } from '../../services/aloware-analytics.js';
import { __resetChannelAccessCacheForTests } from '../../services/channel-access.js';
import { fakeAck, fakeClient, fakeLogger } from '../helpers.js';

const fakeRespond = mock.fn();
const fakeCommand = {
  text: 'What is a healthy on-call handoff format?',
  channel_id: 'C09ULGH1BEC',
};

const buildArguments = ({
  ack = fakeAck,
  client = fakeClient,
  command = fakeCommand,
  logger = fakeLogger,
  respond = fakeRespond,
}: {
  ack?: typeof fakeAck;
  client?: WebClient;
  command?: Record<string, unknown>;
  logger?: typeof fakeLogger;
  respond?: typeof fakeRespond;
}): AllMiddlewareArgs & SlackCommandMiddlewareArgs => {
  return {
    ack,
    client,
    command,
    logger,
    respond,
  } as unknown as AllMiddlewareArgs & SlackCommandMiddlewareArgs;
};

describe('commands', () => {
  beforeEach(() => {
    mock.restoreAll();
    __resetChannelAccessCacheForTests();
    __resetAlowareAnalyticsCachesForTests();
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'gpt-4.1-mini';
    process.env.ALLOWED_CHANNEL_IDS = 'C09ULGH1BEC';
    process.env.ALOWARE_CHANNEL_ID = 'C09ULGH1BEC';
  });

  beforeEach(() => {
    fakeAck.mock.resetCalls();
    fakeLogger.resetCalls();
    fakeRespond.mock.resetCalls();
  });

  it('should acknowledge and respond with aloware analytics report', async () => {
    const historySpy = mock.method(fakeClient.conversations, 'history', async () => ({
      ok: true,
      messages: [
        {
          ts: '1730000001.000100',
          thread_ts: '1730000001.000100',
          text: 'An agent has sent an SMS ContactAlex (+1 555-111-1111) Message Want to schedule a strategy call?',
        },
        {
          ts: '1730000002.000100',
          thread_ts: '1730000001.000100',
          text: 'An agent has received an SMS ContactAlex (+1 555-111-1111) Message Yes, Wednesday works.',
        },
      ],
      response_metadata: { next_cursor: '' },
    }));

    await sampleCommandCallback(buildArguments({}));

    assert(fakeAck.mock.callCount() === 1);
    assert(fakeRespond.mock.callCount() === 1);
    assert(historySpy.mock.callCount() === 1);

    const callArgs = fakeRespond.mock.calls[0]?.arguments[0] as string;
    assert(callArgs.includes('*SMS Insights Core KPI Report*'));
    assert(callArgs.includes('*1) REQUIRED: REPLY RATES BY MESSAGE (7d)*'));
  });

  it('should prompt for usage when command text is missing', async () => {
    const historySpy = mock.method(fakeClient.conversations, 'history', async () => ({
      ok: true,
      messages: [],
      response_metadata: { next_cursor: '' },
    }));

    await sampleCommandCallback(
      buildArguments({
        command: { text: '' },
      }),
    );

    assert(fakeAck.mock.callCount() === 1);
    assert(fakeRespond.mock.callCount() === 1);
    assert(historySpy.mock.callCount() === 0);
    assert.equal(fakeRespond.mock.calls[0]?.arguments[0], 'Usage: `/ask <question>`');
  });

  it('should log error when ack throws exception', async () => {
    const testError = new Error('test exception');
    const ack = mock.fn(async () => {
      throw testError;
    });

    await sampleCommandCallback(
      buildArguments({
        ack: ack,
      }),
    );

    assert(ack.mock.callCount() === 1);
    assert.deepEqual(fakeLogger.error.mock.calls[0].arguments, [testError]);
    assert(fakeRespond.mock.callCount() === 0);
  });

  it('should block reply-generation requests in aloware channel', async () => {
    const historySpy = mock.method(fakeClient.conversations, 'history', async () => ({
      ok: true,
      messages: [],
      response_metadata: { next_cursor: '' },
    }));

    await sampleCommandCallback(
      buildArguments({
        command: {
          text: 'draft a reply to this lead',
          channel_id: 'C09ULGH1BEC',
        },
      }),
    );

    assert(fakeAck.mock.callCount() === 1);
    assert(historySpy.mock.callCount() === 0);
    assert(fakeRespond.mock.callCount() === 1);
    assert.equal(fakeRespond.mock.calls[0]?.arguments[0], 'Reply generation is disabled for this channel.');
  });

  it('should not generate AI output in disallowed channels', async () => {
    const historySpy = mock.method(fakeClient.conversations, 'history', async () => ({
      ok: true,
      messages: [],
      response_metadata: { next_cursor: '' },
    }));

    await sampleCommandCallback(
      buildArguments({
        command: {
          text: 'Will not run',
          channel_id: 'C123NOTALLOWED',
        },
      }),
    );

    assert(fakeAck.mock.callCount() === 1);
    assert(historySpy.mock.callCount() === 0);
    assert(fakeRespond.mock.callCount() === 1);
    assert.equal(fakeRespond.mock.calls[0]?.arguments[0], 'This app is currently enabled only in selected channels.');
  });

  it('should log and respond when analytics request fails', async () => {
    const testError = new Error('history failed');
    mock.method(fakeClient.conversations, 'history', async () => {
      throw testError;
    });

    await sampleCommandCallback(buildArguments({}));

    assert(fakeAck.mock.callCount() === 1);
    assert(fakeRespond.mock.callCount() === 1);
    assert.deepEqual(fakeLogger.error.mock.calls[0].arguments, [testError]);
    assert.equal(
      fakeRespond.mock.calls[0]?.arguments[0],
      'I ran into an error while generating analytics. Please verify channel access and try again.',
    );
  });

  it('should use OpenAI path outside aloware channel', async () => {
    process.env.ALOWARE_CHANNEL_ID = 'COTHER';
    let requestBody = '';
    const fetchSpy = mock.method(globalThis, 'fetch', async (...args: unknown[]) => {
      const init = args[1] as { body?: unknown } | undefined;
      requestBody = typeof init?.body === 'string' ? init.body : '';
      return {
        ok: true,
        status: 200,
        json: async () => ({ output_text: 'AI answer' }),
      } as Response;
    });
    const historySpy = mock.method(fakeClient.conversations, 'history', async () => ({
      ok: true,
      messages: [],
      response_metadata: { next_cursor: '' },
    }));

    await sampleCommandCallback(buildArguments({}));

    assert(fetchSpy.mock.callCount() === 1);
    assert(historySpy.mock.callCount() === 0);
    assert(requestBody.includes('What is a healthy on-call handoff format?'));
    assert.equal(fakeRespond.mock.calls[0]?.arguments[0], 'AI answer');
  });
});
