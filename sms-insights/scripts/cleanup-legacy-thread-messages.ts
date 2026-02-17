import { WebClient } from "@slack/web-api";
import "dotenv/config";

type SlackMessage = {
  reply_count?: number;
  text?: string;
  thread_ts?: string;
  ts?: string;
  user?: string;
};

type DeletionClient = {
  client: WebClient;
  label: string;
  userId: string;
};

const DEFAULT_LOOKBACK_DAYS = 45;
const DEFAULT_CHANNEL = process.env.ALOWARE_CHANNEL_ID?.trim() || "";

const LEGACY_PATTERNS = [
  "daily ai analysis request",
  "setter coaching feedback request",
  "inbound lead response suggestion",
  "acts as a high-performance sales coach",
  "acts as our physical therapy business growth analyst",
  "suppress repo mode",
  "psychological trigger:",
  "recommended script:",
  "claude routed this message to claude.ai chat",
  "no horizontal separators or divider lines",
];

const CHATGPT_PATTERNS = ["chatgpt", "<@u09tut5fjma>", "u09tut5fjma"];

const getChannelId = (): string => {
  if (!DEFAULT_CHANNEL) {
    throw new Error("ALOWARE_CHANNEL_ID is required in .env");
  }
  return DEFAULT_CHANNEL;
};

const getLookbackDays = (): number => {
  const parsed = Number.parseInt(process.env.CLEANUP_LOOKBACK_DAYS || "", 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_LOOKBACK_DAYS;
  }
  return Math.max(1, Math.min(parsed, 180));
};

const getBeforeTs = (): number => {
  const configured = process.env.CLEANUP_BEFORE_TS?.trim() || "";
  const parsed = Number.parseFloat(configured);
  if (!Number.isNaN(parsed) && parsed > 0) {
    return parsed;
  }
  return Date.now() / 1000;
};

const isApply = (): boolean => process.env.APPLY === "true";

const isThreadReply = (message: SlackMessage): boolean => {
  return Boolean(message.thread_ts) && message.thread_ts !== message.ts;
};

const hasLegacyPattern = (text: string): boolean => {
  const normalized = text.toLowerCase();
  if (LEGACY_PATTERNS.some((pattern) => normalized.includes(pattern))) {
    return true;
  }
  return CHATGPT_PATTERNS.some((pattern) => normalized.includes(pattern));
};

const shouldDelete = ({
  beforeTs,
  message,
}: {
  beforeTs: number;
  message: SlackMessage;
}): boolean => {
  if (!isThreadReply(message)) {
    return false;
  }
  const text = (message.text || "").trim();
  if (!text) {
    return false;
  }
  const ts = Number.parseFloat(message.ts || "0");
  if (!Number.isFinite(ts) || ts <= 0 || ts >= beforeTs) {
    return false;
  }
  return hasLegacyPattern(text);
};

const fetchHistory = async ({
  channelId,
  client,
  oldestTs,
}: {
  channelId: string;
  client: WebClient;
  oldestTs: string;
}): Promise<SlackMessage[]> => {
  const messages: SlackMessage[] = [];
  let cursor = "";
  do {
    const response = await client.conversations.history({
      channel: channelId,
      cursor: cursor || undefined,
      inclusive: true,
      limit: 200,
      oldest: oldestTs,
    });
    messages.push(...((response.messages || []) as SlackMessage[]));
    cursor = response.response_metadata?.next_cursor || "";
  } while (cursor);
  return messages;
};

const fetchReplies = async ({
  channelId,
  client,
  threadTs,
}: {
  channelId: string;
  client: WebClient;
  threadTs: string;
}): Promise<SlackMessage[]> => {
  const replies: SlackMessage[] = [];
  let cursor = "";
  do {
    const response = await client.conversations.replies({
      channel: channelId,
      cursor: cursor || undefined,
      inclusive: true,
      limit: 200,
      ts: threadTs,
    });
    replies.push(...((response.messages || []) as SlackMessage[]));
    cursor = response.response_metadata?.next_cursor || "";
  } while (cursor);
  return replies;
};

const getDeletionClients = async (): Promise<DeletionClient[]> => {
  const clients: DeletionClient[] = [];

  const botToken = process.env.SLACK_BOT_TOKEN?.trim() || "";
  if (botToken) {
    const client = new WebClient(botToken);
    const auth = await client.auth.test();
    if (auth.user_id) {
      clients.push({
        client,
        label: "bot",
        userId: auth.user_id,
      });
    }
  }

  const userToken = process.env.SLACK_USER_TOKEN?.trim() || "";
  if (userToken) {
    const client = new WebClient(userToken);
    const auth = await client.auth.test();
    if (auth.user_id) {
      clients.push({
        client,
        label: "user",
        userId: auth.user_id,
      });
    }
  }

  if (clients.length === 0) {
    throw new Error("No Slack clients available for deletion.");
  }
  return clients;
};

const main = async (): Promise<void> => {
  const channelId = getChannelId();
  const lookbackDays = getLookbackDays();
  const oldestTs = `${Math.floor(Date.now() / 1000) - lookbackDays * 24 * 60 * 60}`;
  const beforeTs = getBeforeTs();
  const apply = isApply();

  const deletionClients = await getDeletionClients();
  const scanClient = deletionClients[0].client;

  console.log(
    `Scanning legacy thread replies in ${channelId} (lookback=${lookbackDays}d, before=${beforeTs}, apply=${apply})`,
  );

  const history = await fetchHistory({
    channelId,
    client: scanClient,
    oldestTs,
  });

  const threadRoots = history
    .filter((message) => Number(message.reply_count || 0) > 0)
    .map((message) => message.ts || "")
    .filter((ts) => ts.length > 0);

  const candidatesByTs = new Map<string, SlackMessage>();
  for (const rootTs of threadRoots) {
    const replies = await fetchReplies({
      channelId,
      client: scanClient,
      threadTs: rootTs,
    });

    for (const message of replies) {
      if (!message.ts) {
        continue;
      }
      if (shouldDelete({ beforeTs, message })) {
        candidatesByTs.set(message.ts, message);
      }
    }
  }

  const candidates = [...candidatesByTs.values()].sort(
    (a, b) => Number.parseFloat(a.ts || "0") - Number.parseFloat(b.ts || "0"),
  );

  console.log(`Found ${candidates.length} legacy threaded message(s).`);
  if (candidates.length === 0) {
    return;
  }

  let deleted = 0;
  let skipped = 0;
  let failed = 0;

  for (const message of candidates) {
    const ts = message.ts || "";
    const owner = message.user || "";
    const snippet = (message.text || "").replace(/\s+/g, " ").slice(0, 140);

    if (!apply) {
      console.log(`[DRY RUN] ts=${ts} owner=${owner || "unknown"} text="${snippet}"`);
      continue;
    }

    const preferred = deletionClients.find((client) => client.userId === owner);
    const orderedClients = preferred
      ? [preferred, ...deletionClients.filter((client) => client.userId !== owner)]
      : deletionClients;

    let deletedBy = "";
    let lastError = "";

    for (const deletionClient of orderedClients) {
      try {
        await deletionClient.client.chat.delete({
          channel: channelId,
          ts,
        });
        deletedBy = deletionClient.label;
        break;
      } catch (error: any) {
        lastError = error?.data?.error || error?.message || String(error);
      }
    }

    if (deletedBy) {
      deleted += 1;
      console.log(`[DELETED] ts=${ts} via=${deletedBy} text="${snippet}"`);
      continue;
    }

    if (lastError.includes("cant_delete_message")) {
      skipped += 1;
      console.log(`[SKIPPED] ts=${ts} reason=${lastError} text="${snippet}"`);
      continue;
    }

    failed += 1;
    console.log(`[FAILED] ts=${ts} reason=${lastError} text="${snippet}"`);
  }

  if (!apply) {
    console.log("Dry run complete. Re-run with APPLY=true to delete.");
    return;
  }

  console.log(`Cleanup complete. deleted=${deleted}, skipped=${skipped}, failed=${failed}`);
};

main().catch((error) => {
  console.error("Cleanup failed:", error);
  process.exit(1);
});
