import type { Logger } from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import "dotenv/config";
import { appendDailyReportToCanvas } from "../services/canvas-log.js";
import {
  buildDailyReportSummary,
  isDailySnapshotReport,
} from "../services/daily-report-summary.js";
import { appendAssistantSummaryToCanvas } from "../services/summary-canvas.js";

type HistoryMessage = {
  text?: string;
  thread_ts?: string;
  ts?: string;
  user?: string;
};

const SUMMARY_CANVAS_DEFAULT_TITLE = "AI Summary Log";
const DAILY_REPORT_REQUEST_PATTERN = /<@[^>]+>\s*daily report|\bdaily report\b/i;
const PRIMARY_RUN_HOUR = 16;
const PRIMARY_RUN_WINDOW_MINUTES = 120;
const MAX_SECTION_DELETE_PASSES = 25;

const logger: Logger = {
  debug: console.debug.bind(console),
  error: console.error.bind(console),
  info: console.log.bind(console),
  setLevel: () => {},
  getLevel: () => "info",
  setName: () => {},
  warn: console.warn.bind(console),
} as unknown as Logger;

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
  const primaryMinutes = PRIMARY_RUN_HOUR * 60;
  return Math.abs(totalMinutes - primaryMinutes) <= PRIMARY_RUN_WINDOW_MINUTES;
};

const lookupSectionIdsByText = async ({
  canvasId,
  client,
  text,
}: {
  canvasId: string;
  client: WebClient;
  text: string;
}): Promise<string[]> => {
  const response = (await client.apiCall("canvases.sections.lookup", {
    canvas_id: canvasId,
    criteria: {
      contains_text: text,
    },
  })) as {
    sections?: Array<{ id?: string }>;
  };

  return (response.sections || [])
    .map((section) => section.id)
    .filter((id): id is string => Boolean(id));
};

const deleteSectionById = async ({
  canvasId,
  client,
  sectionId,
}: {
  canvasId: string;
  client: WebClient;
  sectionId: string;
}): Promise<void> => {
  await client.apiCall("canvases.edit", {
    canvas_id: canvasId,
    changes: [
      {
        operation: "delete",
        section_id: sectionId,
      },
    ],
  });
};

const deleteSectionsByMarker = async ({
  canvasId,
  client,
  marker,
}: {
  canvasId: string;
  client: WebClient;
  marker: string;
}): Promise<number> => {
  let deleted = 0;
  for (let pass = 0; pass < MAX_SECTION_DELETE_PASSES; pass += 1) {
    const ids = await lookupSectionIdsByText({
      canvasId,
      client,
      text: marker,
    });
    if (ids.length === 0) {
      return deleted;
    }
    for (const sectionId of ids) {
      await deleteSectionById({
        canvasId,
        client,
        sectionId,
      });
      deleted += 1;
    }
  }
  return deleted;
};

const resolveSummaryCanvasId = async ({
  channelId,
  client,
}: {
  channelId: string;
  client: WebClient;
}): Promise<string | undefined> => {
  const explicitId = process.env.ALOWARE_SUMMARY_CANVAS_ID?.trim();
  if (explicitId) {
    return explicitId;
  }

  const title =
    process.env.ALOWARE_SUMMARY_CANVAS_TITLE?.trim() ||
    SUMMARY_CANVAS_DEFAULT_TITLE;
  const normalizedTitle = title.toLowerCase();
  const files = await client.files.list({
    channel: channelId,
    count: 100,
    types: "canvas",
  });

  return (files.files || []).find(
    (file) => file.title?.toLowerCase() === normalizedTitle,
  )?.id;
};

const fetchChannelHistory = async ({
  channelId,
  client,
  oldest,
}: {
  channelId: string;
  client: WebClient;
  oldest: number;
}): Promise<HistoryMessage[]> => {
  const messages: HistoryMessage[] = [];
  let cursor = "";

  do {
    const response = await client.conversations.history({
      channel: channelId,
      cursor: cursor || undefined,
      inclusive: true,
      limit: 200,
      oldest: oldest.toString(),
    });

    messages.push(...((response.messages || []) as HistoryMessage[]));
    cursor = response.response_metadata?.next_cursor || "";
  } while (cursor);

  return messages;
};

const fetchThreadReplies = async ({
  channelId,
  client,
  threadTs,
}: {
  channelId: string;
  client: WebClient;
  threadTs: string;
}): Promise<HistoryMessage[]> => {
  const replies: HistoryMessage[] = [];
  let cursor = "";

  do {
    const response = await client.conversations.replies({
      channel: channelId,
      cursor: cursor || undefined,
      inclusive: true,
      limit: 200,
      ts: threadTs,
    });

    replies.push(...((response.messages || []) as HistoryMessage[]));
    cursor = response.response_metadata?.next_cursor || "";
  } while (cursor);

  return replies;
};

const findLatestPrimaryRunThread = ({
  messages,
  timezone,
}: {
  messages: HistoryMessage[];
  timezone: string;
}): string | undefined => {
  const sorted = [...messages].sort(
    (a, b) => Number.parseFloat(b.ts || "0") - Number.parseFloat(a.ts || "0"),
  );

  for (const message of sorted) {
    const ts = Number.parseFloat(message.ts || "0");
    if (!Number.isFinite(ts) || ts <= 0) {
      continue;
    }
    const text = message.text?.trim() || "";
    const isRoot = !message.thread_ts || message.thread_ts === message.ts;
    if (!isRoot) {
      continue;
    }
    if (!DAILY_REPORT_REQUEST_PATTERN.test(text)) {
      continue;
    }
    if (!isNearPrimaryRunTime(ts, timezone)) {
      continue;
    }
    return message.ts;
  }

  return undefined;
};

const cleanupReportCanvas = async ({
  canvasId,
  client,
}: {
  canvasId: string;
  client: WebClient;
}): Promise<number> => {
  const markers = [
    "Managed key:",
    "SMS Insights Auto Log (Managed)",
    "What This Channel Is",
    "Latest Daily Run",
    "Booking Conversion By Message Structure (Latest Run)",
    "Daily Report Archive (Newest First)",
    "Performance By Sequence (Latest Run)",
    "Opt-Outs Tied To Campaigns (Latest Run)",
    "Retention window:",
    "PT BIZ - DAILY SMS SNAPSHOT",
    "SMS Snapshot Board",
    "Daily Index",
  ];

  let deleted = 0;
  for (const marker of markers) {
    deleted += await deleteSectionsByMarker({
      canvasId,
      client,
      marker,
    });
  }
  return deleted;
};

const cleanupSummaryCanvas = async ({
  canvasId,
  client,
}: {
  canvasId: string;
  client: WebClient;
}): Promise<number> => {
  const markers = [
    "Managed key:",
    "entry_id:",
    "Daily Report Summary",
    "Latest Mission-Critical Insight",
    "Insights Performance Board",
    "Full Insight History",
    "AI SMS Insights Dashboard",
    "Daily Summary (Canvas Only)",
    "Claude",
    "ChatGPT",
    "Codex",
  ];

  let deleted = 0;
  for (const marker of markers) {
    deleted += await deleteSectionsByMarker({
      canvasId,
      client,
      marker,
    });
  }
  return deleted;
};

const main = async (): Promise<void> => {
  const token = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.ALOWARE_CHANNEL_ID?.trim();
  const reportCanvasId = process.env.ALOWARE_REPORT_CANVAS_ID?.trim();
  const timezone = process.env.ALOWARE_REPORT_TIMEZONE?.trim() || "America/Chicago";
  const chatgptUserId = process.env.CHATGPT_ASSISTANT_USER_ID?.trim() || "U09TUT5FJMA";
  const claudeUserId = process.env.CLAUDE_ASSISTANT_USER_ID?.trim() || "U0AC78PBV9Q";

  if (!token || !channelId || !reportCanvasId) {
    throw new Error(
      "Missing one of required env vars: SLACK_BOT_TOKEN, ALOWARE_CHANNEL_ID, ALOWARE_REPORT_CANVAS_ID",
    );
  }

  const client = new WebClient(token);
  const summaryCanvasId = await resolveSummaryCanvasId({
    channelId,
    client,
  });
  if (!summaryCanvasId) {
    throw new Error(
      "Summary canvas not found. Set ALOWARE_SUMMARY_CANVAS_ID or verify summary canvas title.",
    );
  }

  const now = Math.floor(Date.now() / 1000);
  const history = await fetchChannelHistory({
    channelId,
    client,
    oldest: now - 14 * 24 * 60 * 60,
  });

  const primaryThreadTs = findLatestPrimaryRunThread({
    messages: history,
    timezone,
  });
  if (!primaryThreadTs) {
    throw new Error(
      "Could not find latest primary daily-report request thread near 4 PM.",
    );
  }

  const threadReplies = await fetchThreadReplies({
    channelId,
    client,
    threadTs: primaryThreadTs,
  });
  const snapshotMessage = [...threadReplies]
    .sort(
      (a, b) => Number.parseFloat(b.ts || "0") - Number.parseFloat(a.ts || "0"),
    )
    .find((message) => isDailySnapshotReport(message.text || ""));
  if (!snapshotMessage?.text || !snapshotMessage.ts) {
    throw new Error(
      `No daily snapshot report found in thread ${primaryThreadTs}.`,
    );
  }

  const reportDeletes = await cleanupReportCanvas({
    canvasId: reportCanvasId,
    client,
  });
  const summaryDeletes = await cleanupSummaryCanvas({
    canvasId: summaryCanvasId,
    client,
  });

  await appendDailyReportToCanvas({
    channelId,
    client,
    logger,
    prompt: "daily report",
    report: snapshotMessage.text,
    reportMessageTs: snapshotMessage.ts,
  });

  await appendAssistantSummaryToCanvas({
    client,
    logger,
    message: {
      assistantLabel: "Daily Report Summary",
      channelId,
      text: buildDailyReportSummary(snapshotMessage.text),
      threadTs: primaryThreadTs,
      ts: snapshotMessage.ts,
    },
  });

  const assistantReplies = threadReplies
    .filter((message) => message.ts && message.thread_ts === primaryThreadTs)
    .filter((message) => message.user === chatgptUserId || message.user === claudeUserId)
    .sort(
      (a, b) => Number.parseFloat(a.ts || "0") - Number.parseFloat(b.ts || "0"),
    );

  for (const reply of assistantReplies) {
    if (!reply.text || !reply.ts) {
      continue;
    }
    await appendAssistantSummaryToCanvas({
      client,
      logger,
      message: {
        channelId,
        text: reply.text,
        threadTs: primaryThreadTs,
        ts: reply.ts,
        userId: reply.user,
      },
    });
  }

  console.log("Canvas reset complete.");
  console.log(`- Report canvas: ${reportCanvasId} (sections deleted: ${reportDeletes})`);
  console.log(`- Summary canvas: ${summaryCanvasId} (sections deleted: ${summaryDeletes})`);
  console.log(`- Primary run thread: ${primaryThreadTs}`);
  console.log(`- Snapshot report ts: ${snapshotMessage.ts}`);
  console.log(`- Assistant replies replayed: ${assistantReplies.length}`);
};

main().catch((error) => {
  console.error("Canvas reset failed.");
  console.error(error);
  process.exit(1);
});
