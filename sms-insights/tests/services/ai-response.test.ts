import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('generateAiResponse prompt truncation guardrail', () => {
  it('truncates oversized prompts before sending to OpenAI', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'gpt-4o-mini';
    process.env.OPENAI_MAX_PROMPT_CHARS = '100';

    const originalFetch = globalThis.fetch;

    const fetchMock = async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      const content = body?.messages?.[0]?.content as string;

      assert.equal(typeof content, 'string');
      assert.ok(content.length <= 100 + 200); // allow truncation marker overhead
      assert.ok(content.includes('[TRUNCATED: original_length='));

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'ok' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    // @ts-expect-error - test stub
    globalThis.fetch = fetchMock;

    try {
      const { generateAiResponse } = await import('../../services/ai-response.js');

      const hugePrompt = 'A'.repeat(1000);
      const result = await generateAiResponse(hugePrompt);

      assert.equal(result, 'ok');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('does not modify prompts under the limit', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    process.env.OPENAI_MODEL = 'gpt-4o-mini';
    process.env.OPENAI_MAX_PROMPT_CHARS = '1000';

    const originalFetch = globalThis.fetch;

    const fetchMock = async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'));
      const content = body?.messages?.[0]?.content as string;

      assert.equal(content, 'hello');

      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'ok' } }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };

    // @ts-expect-error - test stub
    globalThis.fetch = fetchMock;

    try {
      const { generateAiResponse } = await import('../../services/ai-response.js');

      const result = await generateAiResponse('hello');

      assert.equal(result, 'ok');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
