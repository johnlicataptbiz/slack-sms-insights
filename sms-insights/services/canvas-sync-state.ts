import type { Logger } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';

const DEFAULT_STATE_MARKER = '[SMS_INSIGHTS_STATE_V1]';
const DEFAULT_STATE_LOOKBACK_MESSAGES = 1000;
const MAX_TRACKED_THREADS = 120;
const STATE_METADATA_EVENT_TYPE = 'sms_insights.canvas_sync_state.v1';

type HistoryMessage = {
  metadata?: {
    event_payload?: unknown;
    event_type?: string;
  };
  text?: string;
  ts?: string;
};

export type CanvasSyncState = {
  last_processed_report_ts: number;
  processed_thread_ts: string[];
  updated_at: number;
  version: number;
};

export type CanvasSyncStateReadResult = {
  corrupted: boolean;
  state?: CanvasSyncState;
  stateMessageTs?: string;
};

type ReadCanvasSyncStateArgs = {
  channelId: string;
  client: WebClient;
  logger?: Pick<Logger, 'warn'>;
};

type UpsertCanvasSyncStateArgs = {
  channelId: string;
  client: WebClient;
  fallbackMessageText?: string;
  fallbackMessageTs?: string;
  logger?: Pick<Logger, 'warn'>;
  state: CanvasSyncState;
  stateMessageTs?: string;
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value || '', 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const getStateMarker = (): string => {
  const configured = process.env.ALOWARE_CANVAS_STATE_MARKER?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_STATE_MARKER;
};

const getStateLookbackMessages = (): number => {
  return parsePositiveInt(process.env.ALOWARE_CANVAS_STATE_LOOKBACK_MESSAGES, DEFAULT_STATE_LOOKBACK_MESSAGES);
};

const normalizeState = (candidate: CanvasSyncState): CanvasSyncState => {
  return {
    version: candidate.version,
    last_processed_report_ts: Math.max(0, Math.floor(candidate.last_processed_report_ts || 0)),
    processed_thread_ts: [...new Set(candidate.processed_thread_ts.filter((value) => value.trim().length > 0))].slice(
      -MAX_TRACKED_THREADS,
    ),
    updated_at: Math.max(0, Math.floor(candidate.updated_at || 0)),
  };
};

const parseState = (text: string): CanvasSyncState | undefined => {
  const marker = getStateMarker();
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) {
    return undefined;
  }

  const payloadText = text.slice(markerIndex + marker.length).trim();
  if (!payloadText) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(payloadText) as Partial<CanvasSyncState>;
    if (
      typeof parsed.version !== 'number' ||
      typeof parsed.last_processed_report_ts !== 'number' ||
      !Array.isArray(parsed.processed_thread_ts) ||
      typeof parsed.updated_at !== 'number'
    ) {
      return undefined;
    }

    return normalizeState({
      version: parsed.version,
      last_processed_report_ts: parsed.last_processed_report_ts,
      processed_thread_ts: parsed.processed_thread_ts.filter((value): value is string => typeof value === 'string'),
      updated_at: parsed.updated_at,
    });
  } catch {
    return undefined;
  }
};

const parseStateFromMetadata = (message: HistoryMessage): CanvasSyncState | undefined => {
  const metadata = message.metadata;
  if (!metadata || metadata.event_type !== STATE_METADATA_EVENT_TYPE) {
    return undefined;
  }

  const payload = metadata.event_payload;
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const stateJson = (payload as { state_json?: unknown }).state_json;
  if (typeof stateJson !== 'string' || stateJson.trim().length === 0) {
    return undefined;
  }

  let parsed: Partial<CanvasSyncState>;
  try {
    parsed = JSON.parse(stateJson) as Partial<CanvasSyncState>;
  } catch {
    return undefined;
  }

  if (
    typeof parsed.version !== 'number' ||
    typeof parsed.last_processed_report_ts !== 'number' ||
    !Array.isArray(parsed.processed_thread_ts) ||
    typeof parsed.updated_at !== 'number'
  ) {
    return undefined;
  }

  return normalizeState({
    version: parsed.version,
    last_processed_report_ts: parsed.last_processed_report_ts,
    processed_thread_ts: parsed.processed_thread_ts.filter((value): value is string => typeof value === 'string'),
    updated_at: parsed.updated_at,
  });
};

const fetchRecentHistory = async ({
  channelId,
  client,
}: {
  channelId: string;
  client: WebClient;
}): Promise<HistoryMessage[]> => {
  const messages: HistoryMessage[] = [];
  let cursor = '';
  let scanned = 0;
  const lookback = getStateLookbackMessages();

  do {
    const response = (await client.conversations.history({
      channel: channelId,
      cursor: cursor || undefined,
      include_all_metadata: true,
      limit: Math.min(200, lookback - scanned),
      inclusive: true,
    })) as {
      messages?: HistoryMessage[];
      response_metadata?: { next_cursor?: string };
    };

    const pageMessages = response.messages || [];
    messages.push(...pageMessages);
    scanned += pageMessages.length;
    if (scanned >= lookback) {
      break;
    }

    cursor = response.response_metadata?.next_cursor || '';
  } while (cursor);

  return messages;
};

export const readCanvasSyncState = async ({
  channelId,
  client,
  logger,
}: ReadCanvasSyncStateArgs): Promise<CanvasSyncStateReadResult> => {
  const marker = getStateMarker();
  const recentMessages = await fetchRecentHistory({
    channelId,
    client,
  });

  for (const message of recentMessages) {
    if (!message.ts) {
      continue;
    }

    const parsedFromMetadata = parseStateFromMetadata(message);
    if (parsedFromMetadata) {
      return {
        corrupted: false,
        state: parsedFromMetadata,
        stateMessageTs: message.ts,
      };
    }

    if (!message.text) {
      continue;
    }
    if (!message.text.includes(marker)) {
      continue;
    }

    const parsed = parseState(message.text);
    if (!parsed) {
      logger?.warn?.('Canvas sync state marker exists but payload is invalid; running full fallback scan.');
      return {
        corrupted: true,
        stateMessageTs: message.ts,
      };
    }

    return {
      corrupted: false,
      state: parsed,
      stateMessageTs: message.ts,
    };
  }

  return {
    corrupted: false,
  };
};

export const upsertCanvasSyncState = async ({
  channelId,
  client,
  fallbackMessageText,
  fallbackMessageTs,
  logger,
  state,
  stateMessageTs,
}: UpsertCanvasSyncStateArgs): Promise<string | undefined> => {
  const normalizedState = normalizeState({
    ...state,
    updated_at: Math.floor(Date.now() / 1000),
  });
  const messageText = `${getStateMarker()} sync`;
  const stateMetadata = {
    event_payload: {
      state_json: JSON.stringify(normalizedState),
    },
    event_type: STATE_METADATA_EVENT_TYPE,
  };

  const updateStateMetadata = async ({
    targetTs,
    targetText,
  }: {
    targetTs: string;
    targetText: string;
  }): Promise<string | undefined> => {
    try {
      const updateResponse = (await client.chat.update({
        channel: channelId,
        metadata: stateMetadata,
        ts: targetTs,
        text: targetText,
      })) as { ts?: string };
      return updateResponse.ts || targetTs;
    } catch (error) {
      logger?.warn?.('Failed to update canvas sync state metadata on target message.');
      logger?.warn?.(String(error));
      return undefined;
    }
  };

  if (stateMessageTs) {
    const updatedTs = await updateStateMetadata({
      targetText: messageText,
      targetTs: stateMessageTs,
    });
    if (updatedTs) {
      return updatedTs;
    }
  }

  if (fallbackMessageTs && fallbackMessageTs !== stateMessageTs) {
    const updatedTs = await updateStateMetadata({
      targetText: fallbackMessageText || messageText,
      targetTs: fallbackMessageTs,
    });
    if (updatedTs) {
      return updatedTs;
    }
  }

  logger?.warn?.('Skipping canvas sync state write because no writable state message target was found.');
  return undefined;
};

export const __parseCanvasSyncStateTextForTests = (text: string): CanvasSyncState | undefined => {
  return parseState(text);
};
