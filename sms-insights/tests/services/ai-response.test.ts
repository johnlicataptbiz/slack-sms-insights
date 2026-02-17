import assert from 'node:assert';
import { beforeEach, describe, it, mock } from 'node:test';
import { generateAiResponse } from '../../services/ai-response.js';

describe('ai response', () => {
  beforeEach(() => {
    mock.restoreAll();
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'gpt-4.1-mini';
    process.env.OPENAI_MAX_RETRIES = '2';
    process.env.OPENAI_RETRY_BASE_MS = '1';
    process.env.OPENAI_TIMEOUT_MS = '1000';
  });

  it('should retry on 429 responses and eventually succeed', async () => {
    let calls = 0;
    const fetchSpy = mock.method(globalThis, 'fetch', async () => {
      calls += 1;
      if (calls === 1) {
        return {
          ok: false,
          status: 429,
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'ok after retry',
              },
            },
          ],
        }),
      } as Response;
    });

    const response = await generateAiResponse('hello');

    assert.equal(response, 'ok after retry');
    assert.equal(fetchSpy.mock.callCount(), 2);
  });

  it('should fail immediately on non-retryable client errors', async () => {
    const fetchSpy = mock.method(globalThis, 'fetch', async () => {
      return {
        ok: false,
        status: 400,
      } as Response;
    });

    await assert.rejects(
      async () => generateAiResponse('hello'),
      (error: Error & { statusCategory?: string }) => {
        assert.equal(error.statusCategory, 'client');
        return true;
      },
    );

    assert.equal(fetchSpy.mock.callCount(), 1);
  });

  it('should surface timeout errors when request exceeds timeout', async () => {
    process.env.OPENAI_MAX_RETRIES = '0';
    process.env.OPENAI_TIMEOUT_MS = '10';

    const fetchSpy = mock.method(globalThis, 'fetch', (...args: unknown[]) => {
      const init = args[1] as { signal?: AbortSignal } | undefined;
      return new Promise<Response>((resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new DOMException('aborted', 'AbortError'));
        });
        setTimeout(() => resolve({ ok: true, status: 200 } as Response), 1000);
      });
    });

    await assert.rejects(
      async () => generateAiResponse('slow request'),
      (error: Error & { statusCategory?: string }) => {
        assert.equal(error.statusCategory, 'timeout');
        return true;
      },
    );

    assert.equal(fetchSpy.mock.callCount(), 1);
  });
});
