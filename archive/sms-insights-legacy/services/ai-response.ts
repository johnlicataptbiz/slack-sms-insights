const DEFAULT_OPENAI_MODEL = 'gpt-4o-mini';
const DEFAULT_XAI_MODEL = 'grok-4-latest';
const DEFAULT_MAX_OUTPUT_TOKENS = 2000;
const DEFAULT_TEMPERATURE = 0.7;
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_BASE_MS = 500;

// Guardrail: prevent accidentally sending huge prompts (e.g. full reports / logs)
// Default is conservative; override via OPENAI_MAX_PROMPT_CHARS if needed.
const DEFAULT_MAX_PROMPT_CHARS = 24_000;

const getMaxPromptChars = (): number => {
  return parsePositiveInt(process.env.OPENAI_MAX_PROMPT_CHARS, DEFAULT_MAX_PROMPT_CHARS);
};

const truncatePrompt = (prompt: string): { prompt: string; truncated: boolean; originalLength: number } => {
  const maxChars = getMaxPromptChars();
  if (prompt.length <= maxChars) {
    return { prompt, truncated: false, originalLength: prompt.length };
  }

  // Keep the *end* too (often contains the actual question / instructions).
  const headChars = Math.floor(maxChars * 0.7);
  const tailChars = maxChars - headChars;

  const head = prompt.slice(0, headChars);
  const tail = prompt.slice(prompt.length - tailChars);

  return {
    prompt: `${head}\n\n[TRUNCATED: original_length=${prompt.length} max_chars=${maxChars}]\n\n${tail}`,
    truncated: true,
    originalLength: prompt.length,
  };
};

type OpenAiErrorMeta = {
  cause?: unknown;
  retryable: boolean;
  statusCategory: 'client' | 'network' | 'rate_limit' | 'server' | 'timeout';
  statusCode?: number;
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value || '', 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
};

const getTimeoutMs = (): number => {
  return parsePositiveInt(process.env.OPENAI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
};

const getMaxRetries = (): number => {
  return parsePositiveInt(process.env.OPENAI_MAX_RETRIES, DEFAULT_MAX_RETRIES);
};

const getRetryBaseMs = (): number => {
  return parsePositiveInt(process.env.OPENAI_RETRY_BASE_MS, DEFAULT_RETRY_BASE_MS);
};

type AiProvider = 'openai' | 'xai';

const getAiProvider = (): AiProvider => {
  const provider = (process.env.AI_PROVIDER || '').trim().toLowerCase();
  if (provider === 'xai') return 'xai';
  return 'openai';
};

const getApiKey = (provider: AiProvider): string | undefined => {
  if (provider === 'xai') {
    return process.env.XAI_API_KEY || process.env.OPENAI_API_KEY;
  }
  return process.env.OPENAI_API_KEY;
};

const getModel = (provider: AiProvider): string => {
  if (provider === 'xai') {
    return process.env.XAI_MODEL || DEFAULT_XAI_MODEL;
  }
  return process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
};

const getApiUrl = (provider: AiProvider): string => {
  if (provider === 'xai') {
    return 'https://api.x.ai/v1/chat/completions';
  }
  return 'https://api.openai.com/v1/chat/completions';
};

const classifyStatus = (statusCode: number): OpenAiErrorMeta['statusCategory'] => {
  if (statusCode === 429) {
    return 'rate_limit';
  }
  if (statusCode >= 500) {
    return 'server';
  }
  return 'client';
};

const isRetryableStatus = (statusCode: number): boolean => {
  return statusCode === 429 || statusCode >= 500;
};

const isAbortError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return (error as { name?: string }).name === 'AbortError';
};

const buildOpenAiError = (message: string, meta: OpenAiErrorMeta): Error => {
  const error = new Error(message) as Error & OpenAiErrorMeta;
  error.cause = meta.cause;
  error.retryable = meta.retryable;
  error.statusCategory = meta.statusCategory;
  if (typeof meta.statusCode === 'number') {
    error.statusCode = meta.statusCode;
  }
  return error;
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const getRetryDelayMs = (attempt: number): number => {
  const exponentialDelay = getRetryBaseMs() * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 100);
  return exponentialDelay + jitter;
};

const requestAiResponse = async ({
  apiKey,
  model,
  prompt,
  provider,
}: {
  apiKey: string;
  model: string;
  prompt: string;
  provider: AiProvider;
}): Promise<Response> => {
  const timeoutMs = getTimeoutMs();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  const { prompt: safePrompt } = truncatePrompt(prompt);

  try {
    return await fetch(getApiUrl(provider), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: safePrompt }],
        temperature: DEFAULT_TEMPERATURE,
        max_tokens: DEFAULT_MAX_OUTPUT_TOKENS,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
};

type ChatCompletionPayload = {
  choices?: Array<{
    message?: {
      content?: unknown;
    };
  }>;
};

const extractOutputText = (payload: unknown): string | undefined => {
  if (typeof payload !== 'object' || payload === null) {
    return undefined;
  }

  const typed = payload as ChatCompletionPayload;

  // Standard OpenAI/xAI Chat Completions response format
  const choice = typed.choices?.[0];
  const content = choice?.message?.content;

  if (typeof content === 'string' && content.trim().length > 0) {
    return content.trim();
  }

  return undefined;
};

export const generateAiResponse = async (prompt: string): Promise<string> => {
  const provider = getAiProvider();
  const apiKey = getApiKey(provider);
  if (!apiKey) {
    return `Set ${provider === 'xai' ? 'XAI_API_KEY' : 'OPENAI_API_KEY'} in your environment to enable AI replies.`;
  }

  const model = getModel(provider);
  const maxRetries = getMaxRetries();

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let response: Response;
    try {
      response = await requestAiResponse({
        apiKey,
        model,
        prompt,
        provider,
      });
    } catch (error) {
      const timeoutError = isAbortError(error);
      if (attempt < maxRetries) {
        await sleep(getRetryDelayMs(attempt));
        continue;
      }

      throw buildOpenAiError(
        timeoutError
          ? `${provider.toUpperCase()} request timed out after ${getTimeoutMs()}ms`
          : `${provider.toUpperCase()} request failed before a response was received`,
        {
          cause: error,
          retryable: true,
          statusCategory: timeoutError ? 'timeout' : 'network',
        },
      );
    }

    if (!response.ok) {
      const retryable = isRetryableStatus(response.status);
      if (retryable && attempt < maxRetries) {
        await sleep(getRetryDelayMs(attempt));
        continue;
      }

      throw buildOpenAiError(`${provider.toUpperCase()} request failed with status ${response.status}`, {
        retryable,
        statusCategory: classifyStatus(response.status),
        statusCode: response.status,
      });
    }

    const payload = await response.json();
    const outputText = extractOutputText(payload);
    if (!outputText) {
      throw buildOpenAiError(`${provider.toUpperCase()} response did not contain output text`, {
        retryable: false,
        statusCategory: 'client',
      });
    }

    return outputText;
  }

  throw buildOpenAiError(`${provider.toUpperCase()} request failed after retries were exhausted`, {
    retryable: true,
    statusCategory: 'server',
  });
};
