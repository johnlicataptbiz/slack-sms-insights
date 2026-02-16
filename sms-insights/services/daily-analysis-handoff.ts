import type { Logger } from "@slack/bolt";
import { WebClient } from "@slack/web-api";

const ANALYSIS_REQUEST_MARKER = "*Daily AI Analysis Request*";
const DEFAULT_POST_DELAY_MS = 2_000;
const DEFAULT_HANDOFF_ENABLED = true;

type AssistantTarget = {
  label: string;
  userId: string;
};

type ThreadMessage = {
  text?: string;
  thread_ts?: string;
  ts?: string;
  user?: string;
};

type PostingClient = {
  client: WebClient;
  source: "bot" | "user";
};

const parseBoolean = (
  value: string | undefined,
  fallback: boolean,
): boolean => {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return fallback;
};

const isHandoffEnabled = (): boolean => {
  return parseBoolean(
    process.env.ALOWARE_DAILY_ANALYSIS_HANDOFF_ENABLED,
    DEFAULT_HANDOFF_ENABLED,
  );
};

const getPostDelayMs = (): number => {
  const parsed = Number.parseInt(
    process.env.ALOWARE_DAILY_ANALYSIS_POST_DELAY_MS || "",
    10,
  );
  if (Number.isNaN(parsed)) {
    return DEFAULT_POST_DELAY_MS;
  }
  return Math.max(0, Math.min(parsed, 30_000));
};

const getAssistantTargets = (): AssistantTarget[] => {
  const chatgptId = process.env.CHATGPT_ASSISTANT_USER_ID?.trim() || "";
  const claudeId = process.env.CLAUDE_ASSISTANT_USER_ID?.trim() || "";

  const targets: AssistantTarget[] = [
    {
      label: "Claude",
      userId: claudeId,
    },
    {
      label: "ChatGPT",
      userId: chatgptId,
    },
  ];

  return targets.filter((target) => target.userId.length > 0);
};

const getPostingClients = ({
  botClient,
}: {
  botClient: WebClient;
}): PostingClient[] => {
  const clients: PostingClient[] = [];
  const userToken = process.env.SLACK_USER_TOKEN?.trim() || "";

  if (userToken.length > 0) {
    clients.push({
      client: new WebClient(userToken),
      source: "user",
    });
  }

  clients.push({
    client: botClient,
    source: "bot",
  });

  return clients;
};

const fetchThreadReplies = async ({
  channelId,
  client,
  threadTs,
}: {
  channelId: string;
  client: WebClient;
  threadTs: string;
}): Promise<ThreadMessage[]> => {
  const replies: ThreadMessage[] = [];
  let cursor = "";

  do {
    const response = await client.conversations.replies({
      channel: channelId,
      cursor: cursor || undefined,
      inclusive: true,
      limit: 200,
      ts: threadTs,
    });

    replies.push(...((response.messages || []) as ThreadMessage[]));
    cursor = response.response_metadata?.next_cursor || "";
  } while (cursor);

  return replies;
};

const buildPrompt = ({
  assistant,
  summaryText,
}: {
  assistant: AssistantTarget;
  summaryText: string;
}): string => {
  return [
    ANALYSIS_REQUEST_MARKER,
    `<@${assistant.userId}> analyze this 4:00 PM SMS snapshot and reply in this thread using the exact structure below.`,
    "Keep it concise and tactical.",
    "",
    "Required output format:",
    "*Snapshot Verdict:* <one sentence>",
    "",
    "*Best/Worst Sequences*",
    "- Best: <sequence + why>",
    "- Worst: <sequence + why>",
    "",
    "*Booking Conversion Moves*",
    "- <highest-leverage message-structure adjustment>",
    "- <second adjustment>",
    "",
    "*Opt-Out Watch*",
    "- <specific risk signal to monitor tomorrow>",
    "",
    "*Tomorrow Plan (3 actions)*",
    "1. <action>",
    "2. <action>",
    "3. <action>",
    "",
    "Style constraints:",
    "- No horizontal separators or divider lines.",
    "- No HTML entities (for example, write 'and', not '&amp;').",
    "- No intro/outro text outside the required sections.",
    "",
    "Snapshot:",
    summaryText,
  ].join("\n");
};

const hasAssistantReply = ({
  assistant,
  replies,
  threadTs,
}: {
  assistant: AssistantTarget;
  replies: ThreadMessage[];
  threadTs: string;
}): boolean => {
  return replies.some((message) => {
    if (!message.user || message.user !== assistant.userId) {
      return false;
    }
    if (!message.thread_ts || message.thread_ts !== threadTs) {
      return false;
    }
    return (message.text || "").trim().length > 0;
  });
};

const hasExistingRequest = ({
  assistant,
  replies,
  threadTs,
}: {
  assistant: AssistantTarget;
  replies: ThreadMessage[];
  threadTs: string;
}): boolean => {
  return replies.some((message) => {
    if (!message.thread_ts || message.thread_ts !== threadTs) {
      return false;
    }
    const text = message.text || "";
    return (
      text.includes(ANALYSIS_REQUEST_MARKER) &&
      text.includes(`<@${assistant.userId}>`)
    );
  });
};

const postPromptWithFallback = async ({
  assistant,
  channelId,
  logger,
  postingClients,
  summaryText,
  threadTs,
}: {
  assistant: AssistantTarget;
  channelId: string;
  logger: Logger;
  postingClients: PostingClient[];
  summaryText: string;
  threadTs: string;
}): Promise<boolean> => {
  const text = buildPrompt({
    assistant,
    summaryText,
  });

  for (const { client, source } of postingClients) {
    try {
      await client.chat.postMessage({
        channel: channelId,
        link_names: true,
        text,
        thread_ts: threadTs,
      });
      logger.info(
        `AI Handoff: ${assistant.label} tagged for daily analysis via ${source} token.`,
      );
      return true;
    } catch (error) {
      logger.warn(
        `AI Handoff: failed via ${source} token for ${assistant.label}; trying fallback if available.`,
      );
      logger.error(error);
    }
  }

  logger.warn(
    `AI Handoff: unable to tag ${assistant.label} after all posting attempts.`,
  );
  return false;
};

const pause = async (ms: number): Promise<void> => {
  if (ms <= 0) {
    return;
  }
  await new Promise((resolve) => setTimeout(resolve, ms));
};

export const requestDailyAnalysisHandoff = async ({
  botClient,
  channelId,
  logger,
  summaryText,
  threadTs,
}: {
  botClient: WebClient;
  channelId: string;
  logger: Logger;
  summaryText: string;
  threadTs: string;
}): Promise<void> => {
  if (!isHandoffEnabled()) {
    return;
  }

  const assistants = getAssistantTargets();
  if (assistants.length === 0) {
    logger.warn(
      "AI Handoff skipped: CHATGPT_ASSISTANT_USER_ID / CLAUDE_ASSISTANT_USER_ID are not configured.",
    );
    return;
  }

  const postingClients = getPostingClients({
    botClient,
  });

  let replies: ThreadMessage[] = [];
  try {
    replies = await fetchThreadReplies({
      channelId,
      client: botClient,
      threadTs,
    });
  } catch (error) {
    logger.warn("AI Handoff: unable to preload thread replies for dedupe.");
    logger.error(error);
  }

  const postDelayMs = getPostDelayMs();
  for (const [index, assistant] of assistants.entries()) {
    if (
      hasAssistantReply({
        assistant,
        replies,
        threadTs,
      })
    ) {
      logger.info(
        `AI Handoff: skipping ${assistant.label}; analysis reply already exists in thread.`,
      );
      continue;
    }

    if (
      hasExistingRequest({
        assistant,
        replies,
        threadTs,
      })
    ) {
      logger.info(
        `AI Handoff: skipping ${assistant.label}; existing request message already posted in thread.`,
      );
      continue;
    }

    await postPromptWithFallback({
      assistant,
      channelId,
      logger,
      postingClients,
      summaryText,
      threadTs,
    });

    if (index < assistants.length - 1) {
      await pause(postDelayMs);
    }
  }
};
