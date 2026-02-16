import type { Logger } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { isDailySnapshotReport } from "./daily-report-summary.js";
import { runSerializedTask } from "./serialized-task.js";

const DEFAULT_SUMMARY_CANVAS_TITLE = "AI Summary Log";
const DEFAULT_SUMMARY_SECTION_HEADING = "AI SMS Insights Dashboard";
const DEFAULT_LATEST_INSIGHT_HEADING = "Latest Mission-Critical Insight";
const DEFAULT_INSIGHTS_BOARD_HEADING = "Insights Performance Board";

const DEFAULT_SUMMARY_MANAGED_KEY = "sms_insights_dashboard_v2";
const DEFAULT_LATEST_INSIGHT_KEY = "sms_insights_latest_v2";
const DEFAULT_INSIGHTS_BOARD_KEY = "sms_insights_board_v2";

const DEFAULT_SUMMARY_TIMEZONE = "America/Chicago";
const DAILY_SUMMARY_LABEL = "Daily Report Summary";
const DAILY_SUMMARY_ENTRY_KEY = "daily_summary_latest";
const DAILY_SUMMARY_MAX_LINES = 10;
const DEFAULT_CHATGPT_ASSISTANT_USER_ID = "U09TUT5FJMA";
const DEFAULT_CODEX_ASSISTANT_USER_ID = "U09UG7BURD5";
const DEFAULT_CLAUDE_ASSISTANT_USER_ID = "U0AC78PBV9Q";
const DAILY_REPORT_REQUEST_PATTERN = /<@[^>]+>\s*daily report|\bdaily report\b/i;
const DEFAULT_DASHBOARD_ASSISTANTS = "chatgpt,claude";
const DEFAULT_PRIMARY_RUN_HOUR = 16;
const PRIMARY_RUN_WINDOW_MINUTES = 120;
const MAX_SUMMARY_TEXT_LENGTH = 4_000;
const INSIGHTS_BOARD_LIMIT = 15;
const DEFAULT_DURABLE_MODE_ENABLED = true;
const DEFAULT_SUMMARY_STORE_PATH = ".data/canvas-summary-log.json";
const DEFAULT_SUMMARY_STORE_MAX_ENTRIES = 500;

type SlackFile = {
  id?: string;
  title?: string;
};

type CanvasCreateResponse = {
  canvas_id?: string;
  canvas?: {
    id?: string;
  };
  id?: string;
};

type SectionLookupResponse = {
  sections?: Array<{
    id?: string;
  }>;
};

type AssistantIdentity = {
  label: string;
  userId: string;
};

type StoredSummaryEntry = {
  assistantLabel: string;
  channelId: string;
  entryId: string;
  isDailySummary: boolean;
  text: string;
  threadTs: string;
  ts: number;
};

type SummaryStorePayload = {
  entries: StoredSummaryEntry[];
  updated_at: number;
  version: 1;
};

export type AssistantSummaryMessage = {
  assistantLabel?: string;
  channelId?: string;
  text?: string;
  threadTs?: string;
  ts?: string;
  userId?: string;
};

type HistoryMessage = {
  bot_id?: string;
  reply_count?: number;
  ts?: string;
  text?: string;
  subtype?: string;
  user?: string;
  thread_ts?: string;
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

const isSummaryCanvasEnabled = (): boolean => {
  return parseBoolean(process.env.ALOWARE_SUMMARY_CANVAS_ENABLED, true);
};

const isDurableModeEnabled = (): boolean => {
  return parseBoolean(
    process.env.ALOWARE_CANVAS_DURABLE_MODE,
    DEFAULT_DURABLE_MODE_ENABLED,
  );
};

export const getSummaryCanvasId = (): string | undefined => {
  const canvasId = process.env.ALOWARE_SUMMARY_CANVAS_ID?.trim();
  return canvasId && canvasId.length > 0 ? canvasId : undefined;
};

export const getSummaryCanvasTitle = (): string => {
  const configuredTitle = process.env.ALOWARE_SUMMARY_CANVAS_TITLE?.trim();
  return configuredTitle && configuredTitle.length > 0
    ? configuredTitle
    : DEFAULT_SUMMARY_CANVAS_TITLE;
};

const getSummarySectionHeading = (): string => {
  const configured = process.env.ALOWARE_SUMMARY_SECTION_HEADING?.trim();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_SUMMARY_SECTION_HEADING;
};

const getSummaryStorePath = (): string => {
  const configuredPath = process.env.ALOWARE_SUMMARY_STORE_PATH?.trim();
  return configuredPath && configuredPath.length > 0
    ? configuredPath
    : DEFAULT_SUMMARY_STORE_PATH;
};

const getSummaryStoreMaxEntries = (): number => {
  const parsed = Number.parseInt(
    process.env.ALOWARE_SUMMARY_STORE_MAX_ENTRIES || "",
    10,
  );
  if (Number.isNaN(parsed)) {
    return DEFAULT_SUMMARY_STORE_MAX_ENTRIES;
  }
  return Math.max(20, Math.min(parsed, 5000));
};

export const getSummaryManagedKey = (): string => {
  return (
    process.env.ALOWARE_SUMMARY_MANAGED_KEY?.trim() ||
    DEFAULT_SUMMARY_MANAGED_KEY
  );
};

export const getLatestInsightKey = (): string => {
  return (
    process.env.ALOWARE_LATEST_INSIGHT_KEY?.trim() || DEFAULT_LATEST_INSIGHT_KEY
  );
};

export const getInsightsBoardKey = (): string => {
  return (
    process.env.ALOWARE_INSIGHTS_BOARD_KEY?.trim() || DEFAULT_INSIGHTS_BOARD_KEY
  );
};

const shouldLookupPermalink = (): boolean => {
  return parseBoolean(
    process.env.ALOWARE_SUMMARY_CANVAS_LOOKUP_PERMALINK,
    false,
  );
};

const getTimezone = (): string => {
  const configured =
    process.env.ALOWARE_SUMMARY_TIMEZONE?.trim() ||
    process.env.ALOWARE_REPORT_TIMEZONE?.trim();
  return configured && configured.length > 0
    ? configured
    : DEFAULT_SUMMARY_TIMEZONE;
};

const getAssistantIdentities = (): AssistantIdentity[] => {
  const chatgptUserId =
    process.env.CHATGPT_ASSISTANT_USER_ID?.trim() ||
    DEFAULT_CHATGPT_ASSISTANT_USER_ID;
  const codexUserId =
    process.env.CODEX_ASSISTANT_USER_ID?.trim() ||
    DEFAULT_CODEX_ASSISTANT_USER_ID;
  const claudeUserId =
    process.env.CLAUDE_ASSISTANT_USER_ID?.trim() ||
    DEFAULT_CLAUDE_ASSISTANT_USER_ID;

  const assistants: AssistantIdentity[] = [
    { label: "ChatGPT", userId: chatgptUserId },
    { label: "Codex", userId: codexUserId },
    { label: "Claude", userId: claudeUserId },
  ];
  return assistants.filter((entry) => entry.userId.length > 0);
};

const getDashboardAssistants = (): AssistantIdentity[] => {
  const configured =
    process.env.ALOWARE_SUMMARY_DASHBOARD_ASSISTANTS?.trim() ||
    DEFAULT_DASHBOARD_ASSISTANTS;
  const allowedLabels = new Set(
    configured
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter((value) => value.length > 0),
  );

  const assistants = getAssistantIdentities().filter((entry) =>
    allowedLabels.has(entry.label.toLowerCase()),
  );
  return assistants.length > 0 ? assistants : getAssistantIdentities();
};

const getAssistantIdentity = (
  userId?: string,
): AssistantIdentity | undefined => {
  if (!userId) {
    return undefined;
  }
  return getAssistantIdentities().find((entry) => entry.userId === userId);
};

const formatDateTime = (tsSeconds: number, timezone: string): string => {
  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
  }).format(new Date(tsSeconds * 1000));
};

const truncateSummaryText = (text: string): string => {
  const normalized = text.replaceAll("\r", "").trim();
  if (normalized.length <= MAX_SUMMARY_TEXT_LENGTH) {
    return normalized;
  }
  return `${normalized.slice(0, MAX_SUMMARY_TEXT_LENGTH)}\n\n_(truncated)_`;
};

const getLocalHourMinute = (
  tsSeconds: number,
  timezone: string,
): { hour: number; minute: number } | undefined => {
  if (!Number.isFinite(tsSeconds) || tsSeconds <= 0) {
    return undefined;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hour12: false,
    minute: "2-digit",
    timeZone: timezone,
  }).formatToParts(new Date(tsSeconds * 1000));

  const hourPart = parts.find((part) => part.type === "hour")?.value;
  const minutePart = parts.find((part) => part.type === "minute")?.value;
  if (!hourPart || !minutePart) {
    return undefined;
  }

  const hour = Number.parseInt(hourPart, 10);
  const minute = Number.parseInt(minutePart, 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return undefined;
  }

  return { hour, minute };
};

const isNearPrimaryRunTime = (tsSeconds: number, timezone: string): boolean => {
  const local = getLocalHourMinute(tsSeconds, timezone);
  if (!local) {
    return false;
  }

  const totalMinutes = local.hour * 60 + local.minute;
  const primaryMinutes = DEFAULT_PRIMARY_RUN_HOUR * 60;
  return Math.abs(totalMinutes - primaryMinutes) <= PRIMARY_RUN_WINDOW_MINUTES;
};

const isDailySummaryLabel = (label: string): boolean => {
  return label.trim().toLowerCase() === DAILY_SUMMARY_LABEL.toLowerCase();
};

const compactDailySummaryText = (text: string): string => {
  return truncateSummaryText(text);
};

const loadSummaryStoreEntries = async (): Promise<StoredSummaryEntry[]> => {
  const storePath = getSummaryStorePath();
  try {
    const raw = await readFile(storePath, "utf8");
    const parsed = JSON.parse(raw) as SummaryStorePayload;
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    return entries
      .filter((entry) => Number.isFinite(entry.ts) && entry.ts > 0)
      .filter((entry) => typeof entry.entryId === "string")
      .filter((entry) => typeof entry.assistantLabel === "string")
      .filter((entry) => typeof entry.text === "string")
      .filter((entry) => typeof entry.channelId === "string")
      .filter((entry) => typeof entry.threadTs === "string")
      .map((entry) => ({
        assistantLabel: entry.assistantLabel,
        channelId: entry.channelId,
        entryId: entry.entryId,
        isDailySummary: Boolean(entry.isDailySummary),
        text: entry.text,
        threadTs: entry.threadTs,
        ts: Math.floor(entry.ts),
      }));
  } catch (error) {
    const code =
      typeof error === "object" && error !== null && "code" in error
        ? String((error as { code?: string }).code)
        : "";
    if (code === "ENOENT") {
      return [];
    }
    return [];
  }
};

const saveSummaryStoreEntries = async (
  entries: StoredSummaryEntry[],
): Promise<void> => {
  const storePath = getSummaryStorePath();
  const payload: SummaryStorePayload = {
    version: 1,
    updated_at: Math.floor(Date.now() / 1000),
    entries,
  };
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
};

const upsertSummaryStoreEntry = async (
  entry: StoredSummaryEntry,
): Promise<StoredSummaryEntry[]> => {
  const existingEntries = await loadSummaryStoreEntries();
  const byEntryId = new Map<string, StoredSummaryEntry>();
  for (const current of existingEntries) {
    byEntryId.set(current.entryId, current);
  }
  byEntryId.set(entry.entryId, entry);

  const normalized = [...byEntryId.values()]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, getSummaryStoreMaxEntries());

  await saveSummaryStoreEntries(normalized);
  return normalized;
};

const findCanvasIdByTitle = async ({
  channelId,
  client,
  logger,
  title,
}: {
  channelId: string;
  client: WebClient;
  logger: Logger;
  title: string;
}): Promise<string | undefined> => {
  const normalizedTitle = title.toLowerCase();
  try {
    const response = (await client.files.list({
      channel: channelId,
      count: 100,
      types: "canvas",
    })) as { files?: SlackFile[] };
    return (response.files || []).find(
      (file) => file.title?.toLowerCase() === normalizedTitle,
    )?.id;
  } catch (error) {
    logger.warn(`Summary canvas lookup failed for "${title}".`);
    logger.error(error);
    return undefined;
  }
};

const createSummaryCanvas = async ({
  channelId,
  client,
  logger,
  title,
}: {
  channelId: string;
  client: WebClient;
  logger: Logger;
  title: string;
}): Promise<string | undefined> => {
  try {
    const response = (await client.apiCall("canvases.create", {
      channel_id: channelId,
      document_content: {
        markdown: `# ${title}\n\nAuto-created assistant summary canvas.\n`,
        type: "markdown",
      },
      title,
    })) as CanvasCreateResponse;
    return response.canvas_id || response.canvas?.id || response.id;
  } catch (error) {
    logger.warn(`Failed to create summary canvas "${title}".`);
    logger.error(error);
    return undefined;
  }
};

const fetchChannelHistory = async ({
  client,
  channelId,
  limit = 200,
}: {
  client: WebClient;
  channelId: string;
  limit?: number;
}): Promise<HistoryMessage[]> => {
  const result = await client.conversations.history({
    channel: channelId,
    limit,
  });
  return (result.messages || []) as HistoryMessage[];
};

const upsertManagedSection = async ({
  client,
  canvasId,
  heading,
  managedKey,
  markdown,
  logger,
}: {
  client: WebClient;
  canvasId: string;
  heading: string;
  managedKey: string;
  markdown: string;
  logger: Logger;
}): Promise<void> => {
  await deleteSectionsMatchingText({
    canvasId,
    client,
    logger,
    text: heading,
  });

  await deleteSectionsMatchingText({
    canvasId,
    client,
    logger,
    text: `Managed key: ${managedKey}`,
  });

  const additionalManagedLookupTexts = [
    managedKey,
    `| Managed key | ${managedKey} |`,
    `Managed key | ${managedKey}`,
  ];
  for (const markerText of additionalManagedLookupTexts) {
    await deleteSectionsMatchingText({
      canvasId,
      client,
      logger,
      text: markerText,
    });
  }

  await client.apiCall("canvases.edit", {
    canvas_id: canvasId,
    changes: [
      {
        document_content: {
          markdown,
          type: "markdown",
        },
        operation: "insert_at_start",
      },
    ],
  });
};

const resolveSummaryCanvasId = async ({
  channelId,
  client,
  logger,
}: {
  channelId: string;
  client: WebClient;
  logger: Logger;
}): Promise<string | undefined> => {
  const configuredId = getSummaryCanvasId();
  if (configuredId) {
    return configuredId;
  }

  const title = getSummaryCanvasTitle();
  const existingId = await findCanvasIdByTitle({
    channelId,
    client,
    logger,
    title,
  });
  if (existingId) {
    return existingId;
  }
  return createSummaryCanvas({ channelId, client, logger, title });
};

const lookupSectionIdsByText = async ({
  canvasId,
  client,
  logger,
  text,
}: {
  canvasId: string;
  client: WebClient;
  logger: Logger;
  text: string;
}): Promise<string[]> => {
  try {
    const response = (await client.apiCall("canvases.sections.lookup", {
      canvas_id: canvasId,
      criteria: {
        contains_text: text,
      },
    })) as SectionLookupResponse;
    return (response.sections || [])
      .map((section) => section.id)
      .filter((id): id is string => Boolean(id));
  } catch (error) {
    logger.warn(`Summary canvas lookup by text failed for "${text}".`);
    logger.error(error);
    return [];
  }
};

const insertMarkdown = async ({
  canvasId,
  client,
  markdown,
}: {
  canvasId: string;
  client: WebClient;
  markdown: string;
}): Promise<void> => {
  await client.apiCall("canvases.edit", {
    canvas_id: canvasId,
    changes: [
      {
        document_content: {
          markdown,
          type: "markdown",
        },
        operation: "insert_at_end",
      },
    ],
  });
};

const deleteSectionById = async ({
  canvasId,
  client,
  logger,
  sectionId,
}: {
  canvasId: string;
  client: WebClient;
  logger: Logger;
  sectionId: string;
}): Promise<void> => {
  try {
    await client.apiCall("canvases.edit", {
      canvas_id: canvasId,
      changes: [
        {
          operation: "delete",
          section_id: sectionId,
        },
      ],
    });
  } catch (error) {
    logger.warn(`Unable to delete summary canvas section ${sectionId}.`);
    logger.error(error);
  }
};

const deleteSectionsMatchingText = async ({
  canvasId,
  client,
  logger,
  text,
}: {
  canvasId: string;
  client: WebClient;
  logger: Logger;
  text: string;
}): Promise<void> => {
  const pause = async (ms: number): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  };

  const maxPasses = 25;
  let emptyPasses = 0;
  for (let pass = 0; pass < maxPasses; pass += 1) {
    const sectionIds = await lookupSectionIdsByText({
      canvasId,
      client,
      logger,
      text,
    });
    if (sectionIds.length === 0) {
      emptyPasses += 1;
      if (emptyPasses >= 2) {
        return;
      }
      await pause(150);
      continue;
    }
    emptyPasses = 0;
    for (const sectionId of sectionIds) {
      await deleteSectionById({
        canvasId,
        client,
        logger,
        sectionId,
      });
    }
    await pause(120);
  }
  logger.warn(
    `Reached summary section cleanup pass limit while removing "${text}".`,
  );
};

const fetchThreadReplies = async ({
  client,
  channelId,
  threadTs,
}: {
  client: WebClient;
  channelId: string;
  threadTs: string;
}): Promise<HistoryMessage[]> => {
  const replies: HistoryMessage[] = [];
  let cursor = "";

  do {
    const result = await client.conversations.replies({
      channel: channelId,
      cursor: cursor || undefined,
      inclusive: true,
      limit: 200,
      ts: threadTs,
    });
    replies.push(...((result.messages || []) as HistoryMessage[]));
    cursor = result.response_metadata?.next_cursor || "";
  } while (cursor);

  return replies;
};

const resolvePrimaryRunThreadRoots = ({
  messages,
  timezone,
}: {
  messages: HistoryMessage[];
  timezone: string;
}): string[] => {
  const roots = new Set<string>();

  for (const message of messages) {
    const text = message.text?.trim() || "";
    const ts = Number.parseFloat(message.ts || "0");
    if (!Number.isFinite(ts) || ts <= 0) {
      continue;
    }

    if (isDailySnapshotReport(text)) {
      const rootTs = message.thread_ts || message.ts;
      if (
        rootTs &&
        isNearPrimaryRunTime(Number.parseFloat(rootTs), timezone)
      ) {
        roots.add(rootTs);
      }
      continue;
    }

    const isRoot = !message.thread_ts || message.thread_ts === message.ts;
    if (
      isRoot &&
      DAILY_REPORT_REQUEST_PATTERN.test(text) &&
      isNearPrimaryRunTime(ts, timezone)
    ) {
      roots.add(message.ts || "");
    }
  }

  return [...roots].filter((rootTs) => rootTs.length > 0);
};

const fetchDashboardMessages = async ({
  client,
  channelId,
  timezone,
}: {
  client: WebClient;
  channelId: string;
  timezone: string;
}): Promise<{ messages: HistoryMessage[]; primaryThreadRoots: Set<string> }> => {
  const history = await fetchChannelHistory({
    client,
    channelId,
    limit: 400,
  });

  const roots = resolvePrimaryRunThreadRoots({
    messages: history,
    timezone,
  }).slice(0, 30);
  if (roots.length === 0) {
    return {
      messages: history,
      primaryThreadRoots: new Set<string>(),
    };
  }

  const hydratedReplies = await Promise.all(
    roots.map(async (threadTs) => {
      try {
        return await fetchThreadReplies({
          client,
          channelId,
          threadTs,
        });
      } catch {
        return [];
      }
    }),
  );

  const byTs = new Map<string, HistoryMessage>();
  for (const message of [...history, ...hydratedReplies.flat()]) {
    if (!message.ts) {
      continue;
    }
    byTs.set(message.ts, message);
  }

  return {
    messages: [...byTs.values()],
    primaryThreadRoots: new Set(roots),
  };
};

const buildInsightsDashboardMarkdown = ({
  messages,
  primaryThreadRoots,
  timezone,
}: {
  messages: HistoryMessage[];
  primaryThreadRoots: Set<string>;
  timezone: string;
}): { latestMarkdown: string; boardMarkdown: string } => {
  const assistants = getDashboardAssistants();
  const assistantIds = new Set(assistants.map((a) => a.userId));

  // Include only assistant replies that belong to primary-run threads.
  const summaries = messages
    .filter((message) => {
      if (!message.user || !assistantIds.has(message.user)) {
        return false;
      }
      if (!message.text || message.text.trim().length === 0) {
        return false;
      }
      const rootTs = message.thread_ts || "";
      if (rootTs.length === 0) {
        return false;
      }
      if (primaryThreadRoots.size > 0) {
        return primaryThreadRoots.has(rootTs);
      }
      return isNearPrimaryRunTime(Number.parseFloat(rootTs), timezone);
    })
    .sort(
      (a, b) => Number.parseFloat(b.ts || "0") - Number.parseFloat(a.ts || "0"),
    );

  const latest = summaries[0];
  const latestAssistant =
    getAssistantIdentity(latest?.user)?.label || "Assistant";
  const latestTs = Number.parseFloat(latest?.ts || "0");

  const latestMarkdown = latest
    ? [
        `## ${DEFAULT_LATEST_INSIGHT_HEADING}`,
        `Managed key: ${getLatestInsightKey()}`,
        "",
        `> **${latestAssistant} Insight (${formatDateTime(latestTs, timezone)})**`,
        `> ${latest.text?.split("\n")[0].slice(0, 300)}...`,
        "",
        latest.text?.length && latest.text.length > 300
          ? `_See full log below for details._`
          : latest.text,
        "",
      ].join("\n")
    : [
        `## ${DEFAULT_LATEST_INSIGHT_HEADING}`,
        `Managed key: ${getLatestInsightKey()}`,
        "",
        "_No Claude/ChatGPT analysis replies found yet for a primary 4:00 PM run thread._",
        "",
      ].join("\n");

  const boardRows = summaries.slice(0, INSIGHTS_BOARD_LIMIT).map((s) => {
    const assistant = getAssistantIdentity(s.user)?.label || "Assistant";
    const date = formatDateTime(Number.parseFloat(s.ts || "0"), timezone);
    const snippet =
      s.text?.split("\n")[0].slice(0, 100).replace(/\|/g, "\\|") || "";
    return `| ${date} | ${assistant} | ${snippet}... |`;
  });

  const boardMarkdown = [
    `## ${DEFAULT_INSIGHTS_BOARD_HEADING}`,
    `Managed key: ${getInsightsBoardKey()}`,
    "",
    "| Date | Assistant | Insight Snippet |",
    "| --- | --- | --- |",
    ...(boardRows.length > 0
      ? boardRows
      : ["| n/a | n/a | No qualifying analysis entries yet. |"]),
    "",
  ].join("\n");

  return { latestMarkdown, boardMarkdown };
};

export const updateInsightsDashboard = async ({
  client,
  canvasId,
  channelId,
  logger,
  timezone,
}: {
  client: WebClient;
  canvasId: string;
  channelId: string;
  logger: Logger;
  timezone: string;
}): Promise<void> => {
  const { messages, primaryThreadRoots } = await fetchDashboardMessages({
    client,
    channelId,
    timezone,
  });
  const { latestMarkdown, boardMarkdown } = buildInsightsDashboardMarkdown({
    messages,
    primaryThreadRoots,
    timezone,
  });

  await deleteSectionsMatchingText({
    canvasId,
    client,
    logger,
    text: "No qualifying analysis entries yet",
  });
  await deleteSectionsMatchingText({
    canvasId,
    client,
    logger,
    text: "No Claude/ChatGPT analysis replies found",
  });
  await deleteSectionsMatchingText({
    canvasId,
    client,
    logger,
    text: "Claude Insight",
  });
  await deleteSectionsMatchingText({
    canvasId,
    client,
    logger,
    text: "ChatGPT Insight",
  });
  await deleteSectionsMatchingText({
    canvasId,
    client,
    logger,
    text: "Codex Insight",
  });

  if (boardMarkdown) {
    await upsertManagedSection({
      client,
      canvasId,
      heading: DEFAULT_INSIGHTS_BOARD_HEADING,
      managedKey: getInsightsBoardKey(),
      markdown: boardMarkdown,
      logger,
    });
  }

  if (latestMarkdown) {
    await upsertManagedSection({
      client,
      canvasId,
      heading: DEFAULT_LATEST_INSIGHT_HEADING,
      managedKey: getLatestInsightKey(),
      markdown: latestMarkdown,
      logger,
    });
  }
};

const ensureManagedHeader = async ({
  canvasId,
  client,
  logger,
}: {
  canvasId: string;
  client: WebClient;
  logger: Logger;
}): Promise<void> => {
  const managedMarker = `Managed key: ${getSummaryManagedKey()}`;
  await deleteSectionsMatchingText({
    canvasId,
    client,
    logger,
    text: "Full Insight History",
  });
  await deleteSectionsMatchingText({
    canvasId,
    client,
    logger,
    text: managedMarker,
  });

  const existingSectionIds = await lookupSectionIdsByText({
    canvasId,
    client,
    logger,
    text: managedMarker,
  });
  if (existingSectionIds.length > 0) {
    return;
  }

  await insertMarkdown({
    canvasId,
    client,
    markdown: [
      `## Full Insight History`,
      managedMarker,
      "",
      `> Tracks all historical thread replies from ChatGPT/Codex/Claude in ${getTimezone()}.`,
      "",
    ].join("\n"),
  });
};

const getMessagePermalink = async ({
  channelId,
  client,
  logger,
  ts,
}: {
  channelId: string;
  client: WebClient;
  logger: Logger;
  ts: string;
}): Promise<string | undefined> => {
  try {
    const response = (await client.chat.getPermalink({
      channel: channelId,
      message_ts: ts,
    })) as { permalink?: string };
    const permalink = response.permalink?.trim();
    return permalink && permalink.length > 0 ? permalink : undefined;
  } catch (error) {
    logger.warn(`Unable to resolve permalink for summary message ${ts}.`);
    logger.error(error);
    return undefined;
  }
};

const buildSummaryEntryMarkdown = ({
  assistantLabel,
  entryMarker,
  isDailySummary,
  permalink,
  text,
  threadTs,
  timezone,
  tsSeconds,
}: {
  assistantLabel: string;
  entryMarker: string;
  isDailySummary: boolean;
  permalink?: string;
  text: string;
  threadTs: string;
  timezone: string;
  tsSeconds: number;
}): string => {
  const lines: string[] = [
    `### ${formatDateTime(tsSeconds, timezone)} - ${assistantLabel}`,
    `- ${entryMarker}`,
  ];

  if (permalink) {
    lines.push(`- Thread reply: [Open in Slack](${permalink})`);
  } else {
    lines.push(`- Thread ts: \`${threadTs}\``);
  }

  lines.push("");

  const summaryText = isDailySummary
    ? compactDailySummaryText(text)
    : truncateSummaryText(text);
  lines.push(...summaryText.split("\n"));

  lines.push("");
  lines.push("---");
  lines.push("");
  return lines.join("\n");
};

const buildLatestInsightMarkdownFromStore = ({
  entries,
  timezone,
}: {
  entries: StoredSummaryEntry[];
  timezone: string;
}): string => {
  const dashboardAssistants = new Set(
    getDashboardAssistants().map((assistant) => assistant.label.toLowerCase()),
  );
  const analysisEntries = entries
    .filter((entry) => !entry.isDailySummary)
    .filter((entry) => dashboardAssistants.has(entry.assistantLabel.toLowerCase()))
    .sort((a, b) => b.ts - a.ts);

  const latest = analysisEntries[0];
  if (!latest) {
    return [
      `## ${DEFAULT_LATEST_INSIGHT_HEADING}`,
      `Managed key: ${getLatestInsightKey()}`,
      "",
      "_No Claude/ChatGPT analysis replies found yet for a primary 4:00 PM run thread._",
      "",
    ].join("\n");
  }

  const snippet = latest.text.split("\n")[0]?.slice(0, 300) || latest.text;
  return [
    `## ${DEFAULT_LATEST_INSIGHT_HEADING}`,
    `Managed key: ${getLatestInsightKey()}`,
    "",
    `> **${latest.assistantLabel} Insight (${formatDateTime(latest.ts, timezone)})**`,
    `> ${snippet}...`,
    "",
    latest.text.length > 300
      ? "_See full log below for details._"
      : latest.text,
    "",
  ].join("\n");
};

const buildInsightsBoardMarkdownFromStore = ({
  entries,
  timezone,
}: {
  entries: StoredSummaryEntry[];
  timezone: string;
}): string => {
  const dashboardAssistants = new Set(
    getDashboardAssistants().map((assistant) => assistant.label.toLowerCase()),
  );
  const rows = entries
    .filter((entry) => !entry.isDailySummary)
    .filter((entry) => dashboardAssistants.has(entry.assistantLabel.toLowerCase()))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, INSIGHTS_BOARD_LIMIT)
    .map((entry) => {
      const snippet =
        entry.text.split("\n")[0]?.slice(0, 100).replace(/\|/g, "\\|") || "";
      return `| ${formatDateTime(entry.ts, timezone)} | ${entry.assistantLabel} | ${snippet}... |`;
    });

  return [
    `## ${DEFAULT_INSIGHTS_BOARD_HEADING}`,
    `Managed key: ${getInsightsBoardKey()}`,
    "",
    "| Date | Assistant | Insight Snippet |",
    "| --- | --- | --- |",
    ...(rows.length > 0
      ? rows
      : ["| n/a | n/a | No qualifying analysis entries yet. |"]),
    "",
  ].join("\n");
};

const buildFullHistoryMarkdownFromStore = ({
  entries,
  timezone,
}: {
  entries: StoredSummaryEntry[];
  timezone: string;
}): string => {
  const lines: string[] = [
    "## Full Insight History",
    `Managed key: ${getSummaryManagedKey()}`,
    `Last updated: ${formatDateTime(Math.floor(Date.now() / 1000), timezone)} (${timezone})`,
    "",
  ];

  if (entries.length === 0) {
    lines.push("No summary entries found yet.");
    lines.push("");
    return lines.join("\n");
  }

  for (const entry of [...entries].sort((a, b) => b.ts - a.ts)) {
    const entryMarkdown = buildSummaryEntryMarkdown({
      assistantLabel: entry.assistantLabel,
      entryMarker: `entry_id:${entry.entryId}`,
      isDailySummary: entry.isDailySummary,
      text: entry.text,
      threadTs: entry.threadTs,
      timezone,
      tsSeconds: entry.ts,
    });
    lines.push(entryMarkdown);
  }

  return lines.join("\n");
};

const renderSummaryCanvasFromStore = async ({
  canvasId,
  channelId,
  client,
  entries,
  logger,
  timezone,
}: {
  canvasId: string;
  channelId: string;
  client: WebClient;
  entries: StoredSummaryEntry[];
  logger: Logger;
  timezone: string;
}): Promise<void> => {
  for (const staleText of [
    "entry_id:",
    "Daily Report Summary",
    "No qualifying analysis entries yet",
    "No Claude/ChatGPT analysis replies found",
    "Claude Insight",
    "ChatGPT Insight",
    "Codex Insight",
  ]) {
    await deleteSectionsMatchingText({
      canvasId,
      client,
      logger,
      text: staleText,
    });
  }

  await upsertManagedSection({
    client,
    canvasId,
    heading: "Full Insight History",
    managedKey: getSummaryManagedKey(),
    markdown: buildFullHistoryMarkdownFromStore({
      entries,
      timezone,
    }),
    logger,
  });

  await upsertManagedSection({
    client,
    canvasId,
    heading: DEFAULT_INSIGHTS_BOARD_HEADING,
    managedKey: getInsightsBoardKey(),
    markdown: buildInsightsBoardMarkdownFromStore({
      entries,
      timezone,
    }),
    logger,
  });

  await upsertManagedSection({
    client,
    canvasId,
    heading: DEFAULT_LATEST_INSIGHT_HEADING,
    managedKey: getLatestInsightKey(),
    markdown: buildLatestInsightMarkdownFromStore({
      entries,
      timezone,
    }),
    logger,
  });
};

export const appendAssistantSummaryToCanvas = async ({
  client,
  logger,
  message,
}: {
  client: WebClient;
  logger: Logger;
  message: AssistantSummaryMessage;
}): Promise<void> => {
  if (!isSummaryCanvasEnabled()) {
    return;
  }
  if (
    !message.channelId ||
    !message.ts ||
    !message.threadTs ||
    !message.text ||
    message.ts === message.threadTs
  ) {
    return;
  }

  const label =
    message.assistantLabel?.trim() ||
    getAssistantIdentity(message.userId)?.label;
  if (!label) {
    return;
  }

  const text = message.text.trim();
  const channelId = message.channelId;
  const messageTs = message.ts;
  const threadTs = message.threadTs;
  if (text.length === 0) {
    return;
  }

  const tsSeconds = Number.parseFloat(messageTs);
  if (!Number.isFinite(tsSeconds)) {
    return;
  }
  const timezone = getTimezone();
  const isDailySummary = isDailySummaryLabel(label);

  const canvasId = await resolveSummaryCanvasId({
    channelId,
    client,
    logger,
  });
  if (!canvasId) {
    logger.warn(
      "Summary canvas not found. Set ALOWARE_SUMMARY_CANVAS_ID or verify canvas title.",
    );
    return;
  }

  await runSerializedTask({
    key: `summary_canvas:${canvasId}`,
    task: async () => {
      try {
        if (isDurableModeEnabled()) {
          const entryId = isDailySummary ? DAILY_SUMMARY_ENTRY_KEY : messageTs;
          const durableEntries = await upsertSummaryStoreEntry({
            assistantLabel: label,
            channelId,
            entryId,
            isDailySummary,
            text,
            threadTs,
            ts: Math.floor(tsSeconds),
          });

          await renderSummaryCanvasFromStore({
            canvasId,
            channelId,
            client,
            entries: durableEntries,
            logger,
            timezone,
          });
          return;
        }

        const entryMarker = isDailySummary
          ? `entry_id:${DAILY_SUMMARY_ENTRY_KEY}`
          : `entry_id:${messageTs}`;
        const legacyDailySummaryMarker = isDailySummary
          ? `entry_id:${messageTs}`
          : undefined;

        const existingEntryIds = await lookupSectionIdsByText({
          canvasId,
          client,
          logger,
          text: entryMarker,
        });
        const existingLegacyDailySummaryIds = legacyDailySummaryMarker
          ? await lookupSectionIdsByText({
              canvasId,
              client,
              logger,
              text: legacyDailySummaryMarker,
            })
          : [];

        const allExistingEntryIds = [
          ...new Set([...existingEntryIds, ...existingLegacyDailySummaryIds]),
        ];
        for (const sectionId of allExistingEntryIds) {
          await deleteSectionById({
            canvasId,
            client,
            logger,
            sectionId,
          });
        }

        // 1. Ensure managed header exists for the append log
        await ensureManagedHeader({
          canvasId,
          client,
          logger,
        });

        const permalink = shouldLookupPermalink()
          ? await getMessagePermalink({
              channelId,
              client,
              logger,
              ts: messageTs,
            })
          : undefined;
        const markdown = buildSummaryEntryMarkdown({
          assistantLabel: label,
          entryMarker,
          isDailySummary,
          permalink,
          text,
          threadTs,
          timezone,
          tsSeconds,
        });

        // 2. Append full text to the bottom log
        await insertMarkdown({
          canvasId,
          client,
          markdown,
        });

        // 3. Rebuild the dashboard at the top (Latest Insight, Board)
        await updateInsightsDashboard({
          client,
          canvasId,
          channelId,
          logger,
          timezone,
        });
      } catch (error) {
        logger.warn("Failed to append assistant summary to canvas.");
        logger.error(error);
      }
    },
  });
};
