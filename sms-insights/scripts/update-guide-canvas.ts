import { WebClient } from "@slack/web-api";
import "dotenv/config";

const DEFAULT_GUIDE_CANVAS_TITLE = "What This Channel Is";
const DEFAULT_REPORT_CANVAS_TITLE = "Analysis Log Report";
const DEFAULT_SUMMARY_CANVAS_TITLE = "AI Summary Log";
const DEFAULT_TIMEZONE = "America/Chicago";
const MAX_SECTION_DELETE_PASSES = 25;
const GUIDE_MANAGED_KEY = "sms_insights_channel_guide_v1";

type SlackFile = {
  id?: string;
  title?: string;
};

type SectionLookupResponse = {
  sections?: Array<{ id?: string }>;
};

type CanvasCreateResponse = {
  canvas_id?: string;
  canvas?: {
    id?: string;
  };
  id?: string;
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
  })) as SectionLookupResponse;

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
  const pause = async (ms: number): Promise<void> => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  };

  let deleted = 0;
  let emptyPasses = 0;
  for (let pass = 0; pass < MAX_SECTION_DELETE_PASSES; pass += 1) {
    const ids = await lookupSectionIdsByText({
      canvasId,
      client,
      text: marker,
    });
    if (ids.length === 0) {
      emptyPasses += 1;
      if (emptyPasses >= 2) {
        return deleted;
      }
      await pause(150);
      continue;
    }
    emptyPasses = 0;
    for (const sectionId of ids) {
      await deleteSectionById({
        canvasId,
        client,
        sectionId,
      });
      deleted += 1;
    }
    await pause(120);
  }
  return deleted;
};

const findCanvasIdsByTitle = async ({
  channelId,
  client,
  title,
}: {
  channelId: string;
  client: WebClient;
  title: string;
}): Promise<string[]> => {
  const normalizedTitle = title.toLowerCase();
  const response = (await client.files.list({
    channel: channelId,
    count: 100,
    types: "canvas",
  })) as { files?: SlackFile[] };

  return (response.files || [])
    .filter((file) => file.title?.toLowerCase() === normalizedTitle)
    .map((file) => file.id)
    .filter((id): id is string => Boolean(id));
};

const createCanvas = async ({
  channelId,
  client,
  title,
}: {
  channelId: string;
  client: WebClient;
  title: string;
}): Promise<string | undefined> => {
  const response = (await client.apiCall("canvases.create", {
    channel_id: channelId,
    document_content: {
      markdown: `# ${title}\n\nAuto-created channel guide canvas.\n`,
      type: "markdown",
    },
    title,
  })) as CanvasCreateResponse;
  return response.canvas_id || response.canvas?.id || response.id;
};

const buildGuideMarkdown = ({
  timezone,
}: {
  timezone: string;
}): string => {
  const reportTitle =
    process.env.ALOWARE_REPORT_CANVAS_TITLE?.trim() ||
    DEFAULT_REPORT_CANVAS_TITLE;
  const summaryTitle =
    process.env.ALOWARE_SUMMARY_CANVAS_TITLE?.trim() ||
    DEFAULT_SUMMARY_CANVAS_TITLE;
  const primaryRunLabel =
    process.env.ALOWARE_PRIMARY_RUN_LABEL?.trim() || "Scheduled 4:00 PM";

  return [
    "# What This Channel Is",
    `Managed key: ${GUIDE_MANAGED_KEY}`,
    `Last updated: ${formatDateTime(Math.floor(Date.now() / 1000), timezone)} (${timezone})`,
    "",
    "This channel is the operating feed for all inbound and outbound Aloware SMS activity, giving full visibility into both sides of every conversation.",
    "",
    "## What We Track Here",
    "- Reply rates by message and structure",
    "- Sequence-level send, reply, booking, and opt-out performance",
    "- Booking conversion by message structure",
    "- Opt-outs tied to specific campaigns and sequences",
    "- Booking-ready and high-intent lead signals",
    "",
    "## Canvases Used In This Channel",
    `1. ${DEFAULT_GUIDE_CANVAS_TITLE} (this canvas): channel guide and operating notes.`,
    `2. ${reportTitle}: managed archive of daily auto-generated SMS reports and KPI rollups.`,
    `3. ${summaryTitle}: managed log of daily summary plus Claude/ChatGPT analysis output.`,
    "",
    "## Daily Report Run Time (CST)",
    `- Primary scheduled run: ${primaryRunLabel}`,
    "",
    "## How It Works",
    "1. Aloware sends or receives an SMS.",
    "2. The SMS event is posted in this channel.",
    "3. SMS Insights runs the daily analysis report on schedule.",
    "4. The report is posted in-channel, saved to a durable store, and full-rendered to Analysis Log Report.",
    "5. Daily summary and assistant analysis are full-rendered to AI Summary Log.",
    "",
    "## What We Use It For",
    "- Spot booking-ready leads quickly",
    "- Identify high-intent growth signals",
    "- Catch opt-out spikes early",
    "- Improve message structure and sequence strategy based on real outcomes",
    "",
    "This channel is the operating layer for visibility and optimization.",
    "",
  ].join("\n");
};

const main = async (): Promise<void> => {
  const token = process.env.SLACK_BOT_TOKEN;
  const channelId = process.env.ALOWARE_CHANNEL_ID?.trim();
  const guideCanvasTitle =
    process.env.ALOWARE_GUIDE_CANVAS_TITLE?.trim() || DEFAULT_GUIDE_CANVAS_TITLE;
  const guideCanvasIdEnv = process.env.ALOWARE_GUIDE_CANVAS_ID?.trim();
  const timezone = process.env.ALOWARE_REPORT_TIMEZONE?.trim() || DEFAULT_TIMEZONE;

  if (!token || !channelId) {
    throw new Error(
      "Missing required env vars: SLACK_BOT_TOKEN and/or ALOWARE_CHANNEL_ID",
    );
  }

  const client = new WebClient(token);
  const canvasIds = guideCanvasIdEnv
    ? [guideCanvasIdEnv]
    : await findCanvasIdsByTitle({
        channelId,
        client,
        title: guideCanvasTitle,
      });
  if (canvasIds.length === 0) {
    const createdCanvasId = await createCanvas({
      channelId,
      client,
      title: guideCanvasTitle,
    });
    if (createdCanvasId) {
      canvasIds.push(createdCanvasId);
    }
  }

  if (canvasIds.length === 0) {
    throw new Error(`Could not resolve or create guide canvas "${guideCanvasTitle}".`);
  }

  const cleanupMarkers = [
    "What This Channel Is",
    "What We Track Here",
    "Canvases Used In This Channel",
    "Daily Report Run Time",
    "How It Works",
    "What We Use It For",
    "Managed key:",
    "This channel logs all inbound and outbound SMS from Aloware",
    "That gives us full visibility into both sides of each conversation",
    "This canvas (#AlowareSMSUpdates - Last Updated 2/14/26)",
    "Analysis Log Report Purpose: running archive of every daily auto-generated SMS report",
    "4:00 PM",
    "This channel is the operating layer for visibility and optimization.",
  ];

  const markdown = buildGuideMarkdown({
    timezone,
  });
  for (const canvasId of canvasIds) {
    let deleted = 0;
    for (const marker of cleanupMarkers) {
      deleted += await deleteSectionsByMarker({
        canvasId,
        client,
        marker,
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

    console.log("Guide canvas updated.");
    console.log(`- Canvas: ${canvasId}`);
    console.log(`- Sections deleted: ${deleted}`);
    console.log(`- Managed key: ${GUIDE_MANAGED_KEY}`);
  }
};

main().catch((error) => {
  console.error("Guide canvas update failed.");
  console.error(error);
  process.exit(1);
});
