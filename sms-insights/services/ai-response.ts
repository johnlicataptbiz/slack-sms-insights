const DEFAULT_OPENAI_MODEL = "gpt-4o-mini";
const DEFAULT_OPENAI_MAX_OUTPUT_TOKENS = 500;
const DEFAULT_OPENAI_TEMPERATURE = 0.7;
const DEFAULT_OPENAI_TIMEOUT_MS = 15_000;
const DEFAULT_OPENAI_MAX_RETRIES = 2;
const DEFAULT_OPENAI_RETRY_BASE_MS = 500;

type OpenAiErrorMeta = {
  cause?: unknown;
  retryable: boolean;
  statusCategory: "client" | "network" | "rate_limit" | "server" | "timeout";
  statusCode?: number;
};

const parsePositiveInt = (
  value: string | undefined,
  fallback: number,
): number => {
  const parsed = Number.parseInt(value || "", 10);
  if (Number.isNaN(parsed) || parsed < 0) {
    return fallback;
  }
  return parsed;
};

const getOpenAiTimeoutMs = (): number => {
  return parsePositiveInt(
    process.env.OPENAI_TIMEOUT_MS,
    DEFAULT_OPENAI_TIMEOUT_MS,
  );
};

const getOpenAiMaxRetries = (): number => {
  return parsePositiveInt(
    process.env.OPENAI_MAX_RETRIES,
    DEFAULT_OPENAI_MAX_RETRIES,
  );
};

const getOpenAiRetryBaseMs = (): number => {
  return parsePositiveInt(
    process.env.OPENAI_RETRY_BASE_MS,
    DEFAULT_OPENAI_RETRY_BASE_MS,
  );
};

const classifyStatus = (
  statusCode: number,
): OpenAiErrorMeta["statusCategory"] => {
  if (statusCode === 429) {
    return "rate_limit";
  }
  if (statusCode >= 500) {
    return "server";
  }
  return "client";
};

const isRetryableStatus = (statusCode: number): boolean => {
  return statusCode === 429 || statusCode >= 500;
};

const isAbortError = (error: unknown): boolean => {
  if (!error || typeof error !== "object") {
    return false;
  }
  return (error as { name?: string }).name === "AbortError";
};

const buildOpenAiError = (message: string, meta: OpenAiErrorMeta): Error => {
  const error = new Error(message) as Error & OpenAiErrorMeta;
  error.cause = meta.cause;
  error.retryable = meta.retryable;
  error.statusCategory = meta.statusCategory;
  if (typeof meta.statusCode === "number") {
    error.statusCode = meta.statusCode;
  }
  return error;
};

const sleep = async (ms: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const getRetryDelayMs = (attempt: number): number => {
  const exponentialDelay = getOpenAiRetryBaseMs() * 2 ** attempt;
  const jitter = Math.floor(Math.random() * 100);
  return exponentialDelay + jitter;
};

const requestOpenAiResponse = async ({
  apiKey,
  model,
  prompt,
}: {
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<Response> => {
  const timeoutMs = getOpenAiTimeoutMs();
  const controller = new AbortController();
  const timeoutHandle = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    return await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: DEFAULT_OPENAI_TEMPERATURE,
        max_tokens: DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutHandle);
  }
};

const extractOutputText = (payload: any): string | undefined => {
  if (typeof payload !== "object" || payload === null) {
    return undefined;
  }

  // Standard OpenAI Chat Completions response format
  const choice = payload.choices?.[0];
  const content = choice?.message?.content;

  if (typeof content === "string" && content.trim().length > 0) {
    return content.trim();
  }

  return undefined;
};

export const generateAiResponse = async (prompt: string): Promise<string> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return "Set OPENAI_API_KEY in your environment to enable AI replies.";
  }

  const model = process.env.OPENAI_MODEL || DEFAULT_OPENAI_MODEL;
  const maxRetries = getOpenAiMaxRetries();

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    let response: Response;
    try {
      response = await requestOpenAiResponse({
        apiKey,
        model,
        prompt,
      });
    } catch (error) {
      const timeoutError = isAbortError(error);
      if (attempt < maxRetries) {
        await sleep(getRetryDelayMs(attempt));
        continue;
      }

      throw buildOpenAiError(
        timeoutError
          ? `OpenAI request timed out after ${getOpenAiTimeoutMs()}ms`
          : "OpenAI request failed before a response was received",
        {
          cause: error,
          retryable: true,
          statusCategory: timeoutError ? "timeout" : "network",
        },
      );
    }

    if (!response.ok) {
      const retryable = isRetryableStatus(response.status);
      if (retryable && attempt < maxRetries) {
        await sleep(getRetryDelayMs(attempt));
        continue;
      }

      throw buildOpenAiError(
        `OpenAI request failed with status ${response.status}`,
        {
          retryable,
          statusCategory: classifyStatus(response.status),
          statusCode: response.status,
        },
      );
    }

    const payload = await response.json();
    const outputText = extractOutputText(payload);
    if (!outputText) {
      throw buildOpenAiError("OpenAI response did not contain output text", {
        retryable: false,
        statusCategory: "client",
      });
    }

    return outputText;
  }

  throw buildOpenAiError("OpenAI request failed after retries were exhausted", {
    retryable: true,
    statusCategory: "server",
  });
};
