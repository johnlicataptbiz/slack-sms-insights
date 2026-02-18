import { WebClient } from '@slack/web-api';
import 'dotenv/config';

type SlackMessage = {
  bot_id?: string;
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

const DEFAULT_LOOKBACK_DAYS = 30;
const OLD_CHATGPT_USER_ID = 'U09TUT5FJMA';
const PROMPT_MARKERS = ['daily ai analysis request', 'acts as our physical therapy business growth analyst'];

const getChannelId = (): string => {
  const configured = process.env.ALOWARE_CHANNEL_ID?.trim();
  if (!configured) {
    throw new Error('ALOWARE_CHANNEL_ID is required in .env');
  }
  return configured;
};

const getLookbackDays = (): number => {
  const parsed = Number.parseInt(process.env.CLEANUP_LOOKBACK_DAYS || '', 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_LOOKBACK_DAYS;
  }
  return Math.max(1, Math.min(parsed, 180));
};

const isApplyMode = (): boolean => {
  return process.env.APPLY === 'true';
};

const hasChatGptReference = (text: string): boolean => {
  const normalized = text.toLowerCase();
  if (normalized.includes('chatgpt')) {
    return true;
  }
  return normalized.includes(`<@${OLD_CHATGPT_USER_ID.toLowerCase()}>`);
};

const isChatGptPromptMessage = (message: SlackMessage): boolean => {
  const text = (message.text || '').trim();
  if (!text) {
    return false;
  }
  const normalized = text.toLowerCase();
  if (!hasChatGptReference(text)) {
    return false;
  }
  return PROMPT_MARKERS.some((marker) => normalized.includes(marker));
};

const fetchHistory = async ({
  channelId,
  client,
  oldest,
}: {
  channelId: string;
  client: WebClient;
  oldest: string;
}): Promise<SlackMessage[]> => {
  const messages: SlackMessage[] = [];
  let cursor = '';

  do {
    const response = await client.conversations.history({
      channel: channelId,
      cursor: cursor || undefined,
      inclusive: true,
      limit: 200,
      oldest,
    });
    messages.push(...((response.messages || []) as SlackMessage[]));
    cursor = response.response_metadata?.next_cursor || '';
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
  const messages: SlackMessage[] = [];
  let cursor = '';

  do {
    const response = await client.conversations.replies({
      channel: channelId,
      cursor: cursor || undefined,
      inclusive: true,
      limit: 200,
      ts: threadTs,
    });
    messages.push(...((response.messages || []) as SlackMessage[]));
    cursor = response.response_metadata?.next_cursor || '';
  } while (cursor);

  return messages;
};

const getDeletionClients = async (): Promise<DeletionClient[]> => {
  const clients: DeletionClient[] = [];

  const botToken = process.env.SLACK_BOT_TOKEN?.trim() || '';
  if (botToken) {
    const botClient = new WebClient(botToken);
    const auth = await botClient.auth.test();
    if (auth.user_id) {
      clients.push({
        client: botClient,
        label: 'bot',
        userId: auth.user_id,
      });
    }
  }

  const userToken = process.env.SLACK_USER_TOKEN?.trim() || '';
  if (userToken) {
    const userClient = new WebClient(userToken);
    const auth = await userClient.auth.test();
    if (auth.user_id) {
      clients.push({
        client: userClient,
        label: 'user',
        userId: auth.user_id,
      });
    }
  }

  if (clients.length === 0) {
    throw new Error('No valid deletion client found (SLACK_BOT_TOKEN/SLACK_USER_TOKEN).');
  }

  return clients;
};

const main = async (): Promise<void> => {
  const channelId = getChannelId();
  const lookbackDays = getLookbackDays();
  const oldest = `${Math.floor(Date.now() / 1000) - lookbackDays * 24 * 60 * 60}`;
  const apply = isApplyMode();

  const clients = await getDeletionClients();
  const scanClient = clients[0].client;

  console.log(`Scanning channel ${channelId} for ChatGPT prompt messages in last ${lookbackDays} day(s)...`);

  const roots = await fetchHistory({
    channelId,
    client: scanClient,
    oldest,
  });

  const candidatesByTs = new Map<string, SlackMessage>();
  const threadRoots = roots
    .filter((message) => Number(message.reply_count || 0) > 0)
    .map((message) => message.ts || '')
    .filter((ts) => ts.length > 0);

  for (const message of roots) {
    if ((message.thread_ts || '') !== (message.ts || '') && message.thread_ts) {
      continue;
    }
    if (isChatGptPromptMessage(message) && message.ts) {
      candidatesByTs.set(message.ts, message);
    }
  }

  for (const threadTs of threadRoots) {
    const replies = await fetchReplies({
      channelId,
      client: scanClient,
      threadTs,
    });
    for (const message of replies) {
      if (isChatGptPromptMessage(message) && message.ts) {
        candidatesByTs.set(message.ts, message);
      }
    }
  }

  const candidates = [...candidatesByTs.values()].sort(
    (a, b) => Number.parseFloat(a.ts || '0') - Number.parseFloat(b.ts || '0'),
  );

  console.log(`Found ${candidates.length} candidate message(s).`);
  if (candidates.length === 0) {
    return;
  }

  let deleted = 0;
  let skipped = 0;
  let failed = 0;

  for (const message of candidates) {
    const messageTs = message.ts || '';
    const owner = message.user || '';
    const snippet = (message.text || '').replace(/\s+/g, ' ').slice(0, 140);

    if (!apply) {
      console.log(`[DRY RUN] ${messageTs} owner=${owner || 'unknown'} text="${snippet}"`);
      continue;
    }

    const preferred = clients.find((entry) => entry.userId === owner);
    const orderedClients = preferred ? [preferred, ...clients.filter((entry) => entry.userId !== owner)] : clients;

    let deletedBy: string | undefined;
    let lastError = '';

    for (const deletionClient of orderedClients) {
      try {
        await deletionClient.client.chat.delete({
          channel: channelId,
          ts: messageTs,
        });
        deletedBy = deletionClient.label;
        break;
      } catch (error: unknown) {
        const maybeSlackError = error as { data?: { error?: string }; message?: string };
        lastError = maybeSlackError?.data?.error || maybeSlackError?.message || String(error);
      }
    }

    if (deletedBy) {
      deleted += 1;
      console.log(`[DELETED] ${messageTs} via=${deletedBy} text="${snippet}"`);
      continue;
    }

    if (lastError.includes('cant_delete_message') || lastError.includes('not_authed')) {
      skipped += 1;
      console.log(`[SKIPPED] ${messageTs} reason=${lastError} text="${snippet}"`);
      continue;
    }

    failed += 1;
    console.log(`[FAILED] ${messageTs} reason=${lastError} text="${snippet}"`);
  }

  if (!apply) {
    console.log('Dry run complete. Re-run with APPLY=true to delete.');
    return;
  }

  console.log(`Cleanup complete. Deleted=${deleted}, Skipped=${skipped}, Failed=${failed}.`);
};

main().catch((error) => {
  console.error('Cleanup failed:', error);
  process.exit(1);
});
