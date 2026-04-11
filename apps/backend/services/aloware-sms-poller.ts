import type { Logger } from "@slack/bolt";
import { insertSmsEvent } from "./sms-event-store.js";
import { upsertConversationFromEvent } from "./conversation-projector.js";
import { upsertInboxContactProfile } from "./inbox-contact-profiles.js";
import { enrichContactProfileFromAloware } from "./inbox-contact-enrichment.js";
import { updateConversationStatus } from "./inbox-store.js";
import { detectOptOutIntent } from "./lead-watcher.js";
import {
  resolveNeedsReplyOnOutbound,
  upsertNeedsReplyWorkItem,
} from "./work-item-engine.js";
import {
  recordAlowareIngestSeen,
  recordAlowareIngestSuccess,
  recordAlowareIngestSkip,
  maybeLogAlowareIngestWarnings,
} from "./aloware-ingest-monitor.js";

const DEFAULT_POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_LOOKBACK_MINUTES = 10;
const DEFAULT_MAX_EVENTS_PER_POLL = 100;

type AlowareSmsEvent = {
  id: string;
  direction: "inbound" | "outbound";
  contact_id?: string;
  contact_name?: string;
  contact_phone?: string;
  body?: string;
  line_id?: number;
  line_label?: string;
  sequence_id?: number;
  sequence_label?: string;
  user_id?: string;
  user_name?: string;
  created_at: string;
  delivery_status?: string;
  media_urls?: string[];
};

type AlowareApiResponse = {
  success?: boolean;
  data?: AlowareSmsEvent[];
  events?: AlowareSmsEvent[];
  messages?: AlowareSmsEvent[];
  total?: number;
  page?: number;
  per_page?: number;
  error?: string;
  message?: string;
};

type PollState = {
  lastPollAt: Date | null;
  lastEventTimestamp: Date | null;
  totalIngested: number;
  totalErrors: number;
  consecutiveErrors: number;
};

const state: PollState = {
  lastPollAt: null,
  lastEventTimestamp: null,
  totalIngested: 0,
  totalErrors: 0,
  consecutiveErrors: 0,
};

const getApiToken = (): string => {
  return (
    process.env.ALOWARE_API_TOKEN ||
    process.env.ALOWARE_WEBHOOK_API_TOKEN ||
    process.env.ALOWARE_FORM_API_TOKEN ||
    ""
  ).trim();
};

const getBaseUrl = (): string => {
  return (process.env.ALOWARE_BASE_URL || "https://app.aloware.com")
    .trim()
    .replace(/\/$/, "");
};

// NOTE: Aloware does NOT expose an SMS list/fetch endpoint via their public API.
// The polling service is disabled by default because the endpoint doesn't exist.
// SMS events are ingested via the Slack channel listener (app.message in listeners/messages/index.ts).
// If Aloware adds an SMS list endpoint in the future, this can be re-enabled.
const isPollingEnabled = (): boolean => {
  return false; // Hardcoded: Aloware API has no SMS fetch endpoint
};

const getPollIntervalMs = (): number => {
  return Number.parseInt(
    process.env.ALOWARE_POLL_INTERVAL_MS || String(DEFAULT_POLL_INTERVAL_MS),
    10,
  );
};

const getLookbackMinutes = (): number => {
  return Number.parseInt(
    process.env.ALOWARE_POLL_LOOKBACK_MINUTES ||
      String(DEFAULT_LOOKBACK_MINUTES),
    10,
  );
};

const getMaxEventsPerPoll = (): number => {
  return Number.parseInt(
    process.env.ALOWARE_POLL_MAX_EVENTS || String(DEFAULT_MAX_EVENTS_PER_POLL),
    10,
  );
};

const getWebhookChannelId = (): string => {
  return (process.env.ALOWARE_CHANNEL_ID || "C09ULGH1BEC").trim();
};

const normalizeDirection = (
  direction?: string,
): "inbound" | "outbound" | "unknown" => {
  if (!direction) return "unknown";
  const lower = direction.toLowerCase();
  if (lower.includes("inbound") || lower.includes("received") || lower === "in")
    return "inbound";
  if (lower.includes("outbound") || lower.includes("sent") || lower === "out")
    return "outbound";
  return "unknown";
};

const slackTsFromDate = (dateStr?: string): string => {
  if (!dateStr) return `${Date.now() / 1000}`;
  const ts = Date.parse(dateStr);
  if (Number.isFinite(ts)) return `${ts / 1000}`;
  return `${Date.now() / 1000}`;
};

const fetchAlowareSmsEvents = async (
  options: {
    since?: Date;
    limit?: number;
    direction?: "inbound" | "outbound";
  },
  logger?: Pick<Logger, "debug" | "info" | "warn" | "error">,
): Promise<AlowareSmsEvent[]> => {
  const token = getApiToken();
  if (!token) {
    throw new Error("ALOWARE_API_TOKEN is not configured");
  }

  const baseUrl = getBaseUrl();
  const params = new URLSearchParams({
    api_token: token,
    limit: String(options.limit || getMaxEventsPerPoll()),
  });

  if (options.since) {
    params.set("since", options.since.toISOString());
  }
  if (options.direction) {
    params.set("direction", options.direction);
  }

  const url = `${baseUrl}/api/v1/webhook/sms/events?${params.toString()}`;

  logger?.debug?.("Fetching SMS events from Aloware API", {
    url: url.replace(token, "***"),
  });

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Aloware API request failed: ${response.status} ${text}`);
  }

  const data = (await response.json()) as AlowareApiResponse;

  if (data.error) {
    throw new Error(`Aloware API returned error: ${data.error}`);
  }

  return data.data || data.events || data.messages || [];
};

const ingestSmsEvent = async (
  event: AlowareSmsEvent,
  logger?: Pick<Logger, "debug" | "info" | "warn" | "error">,
): Promise<boolean> => {
  recordAlowareIngestSeen();

  const direction = normalizeDirection(event.direction);
  if (direction === "unknown") {
    recordAlowareIngestSkip({
      reason: "unknown_direction",
      channelId: getWebhookChannelId(),
      text: event.body || "",
    });
    return false;
  }

  if (!event.contact_id && !event.contact_phone) {
    recordAlowareIngestSkip({
      reason: "missing_contact",
      channelId: getWebhookChannelId(),
      text: event.body || "",
    });
    return false;
  }

  const channelId = getWebhookChannelId();
  const messageTs = slackTsFromDate(event.created_at);
  const eventTs = event.created_at ? new Date(event.created_at) : new Date();

  try {
    const eventRow = await insertSmsEvent(
      {
        slackTeamId: "aloware-poller",
        slackChannelId: channelId,
        slackMessageTs: messageTs,
        eventTs,
        direction,
        contactId: event.contact_id || null,
        contactPhone: event.contact_phone || null,
        contactName: event.contact_name || null,
        alowareUser: event.user_name || null,
        body: event.body || null,
        line: event.line_label || null,
        sequence: event.sequence_label || null,
        raw: event,
      },
      logger,
    );

    if (!eventRow) {
      return false;
    }

    recordAlowareIngestSuccess();
    state.totalIngested += 1;
    state.consecutiveErrors = 0;

    if (event.created_at) {
      const eventDate = new Date(event.created_at);
      if (!state.lastEventTimestamp || eventDate > state.lastEventTimestamp) {
        state.lastEventTimestamp = eventDate;
      }
    }

    // Project conversation
    const conversation = await upsertConversationFromEvent(eventRow, logger);
    if (!conversation) {
      return true;
    }

    // Upsert contact profile
    await upsertInboxContactProfile(
      {
        contactKey: conversation.contact_key,
        conversationId: conversation.id,
        contactId: eventRow.contact_id,
        name: eventRow.contact_name,
        phone: eventRow.contact_phone,
      },
      logger,
    );

    // Enrich from Aloware API (fire and forget)
    if (eventRow.contact_phone) {
      void enrichContactProfileFromAloware(
        {
          contactKey: conversation.contact_key,
          conversationId: conversation.id,
          phoneNumber: eventRow.contact_phone,
          fallbackName: eventRow.contact_name,
          contactId: eventRow.contact_id,
        },
        logger,
      ).catch((error) => {
        logger?.warn("Contact enrichment failed", error);
      });
    }

    // Handle work items based on direction
    if (eventRow.direction === "inbound") {
      await upsertNeedsReplyWorkItem(conversation, eventRow, logger);

      if (eventRow.body) {
        const optOut = detectOptOutIntent(eventRow.body);
        if (optOut.isOptOut) {
          logger?.info(
            `Opt-out detected for conversation ${conversation.id}: matched "${optOut.matchedPattern}"`,
          );
          await updateConversationStatus(conversation.id, "dnc", logger);
        }
      }
    } else if (eventRow.direction === "outbound") {
      await resolveNeedsReplyOnOutbound(conversation.id, eventRow, logger);
    }

    return true;
  } catch (error) {
    logger?.error("Failed to ingest SMS event", { error, eventId: event.id });
    state.totalErrors += 1;
    state.consecutiveErrors += 1;
    return false;
  }
};

export const pollAlowareSmsEvents = async (
  logger?: Pick<Logger, "debug" | "info" | "warn" | "error">,
): Promise<{ ingested: number; errors: number; total: number }> => {
  if (!isPollingEnabled()) {
    return { ingested: 0, errors: 0, total: 0 };
  }

  if (!getApiToken()) {
    logger?.warn("Aloware polling skipped: ALOWARE_API_TOKEN not configured");
    return { ingested: 0, errors: 0, total: 0 };
  }

  // Backoff on consecutive errors
  if (state.consecutiveErrors >= 5) {
    logger?.warn("Aloware polling paused due to consecutive errors", {
      consecutiveErrors: state.consecutiveErrors,
    });
    return { ingested: 0, errors: 0, total: 0 };
  }

  state.lastPollAt = new Date();

  const lookbackMinutes = getLookbackMinutes();
  const since = state.lastEventTimestamp
    ? new Date(state.lastEventTimestamp.getTime() - 60_000) // 1 minute buffer
    : new Date(Date.now() - lookbackMinutes * 60_000);

  let ingested = 0;
  let errors = 0;

  try {
    const events = await fetchAlowareSmsEvents(
      { since, limit: getMaxEventsPerPoll() },
      logger,
    );

    logger?.info?.("Aloware SMS poll completed", {
      fetched: events.length,
      since: since.toISOString(),
    });

    for (const event of events) {
      const success = await ingestSmsEvent(event, logger);
      if (success) {
        ingested += 1;
      } else {
        errors += 1;
      }
    }

    maybeLogAlowareIngestWarnings(logger);

    return { ingested, errors, total: events.length };
  } catch (error) {
    state.totalErrors += 1;
    state.consecutiveErrors += 1;
    logger?.error("Aloware SMS poll failed", { error });
    return { ingested: 0, errors: 1, total: 0 };
  }
};

export const getAlowarePollingState = (): PollState & {
  enabled: boolean;
  intervalMs: number;
} => {
  return {
    ...state,
    enabled: isPollingEnabled(),
    intervalMs: getPollIntervalMs(),
  };
};

export const startAlowareSmsPollingJobs = (
  logger?: Pick<Logger, "info" | "debug" | "warn" | "error">,
): (() => void) => {
  if (!isPollingEnabled()) {
    logger?.info?.("Aloware SMS polling jobs disabled");
    return () => {};
  }

  const intervalMs = getPollIntervalMs();

  logger?.info?.("Starting Aloware SMS polling jobs", {
    intervalMs,
    lookbackMinutes: getLookbackMinutes(),
    maxEventsPerPoll: getMaxEventsPerPoll(),
  });

  // Initial poll after 15 seconds
  const initialTimer = setTimeout(() => {
    void pollAlowareSmsEvents(logger);
  }, 15_000);

  // Regular polling interval
  const interval = setInterval(() => {
    void pollAlowareSmsEvents(logger);
  }, intervalMs);

  return () => {
    clearTimeout(initialTimer);
    clearInterval(interval);
  };
};
