import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { generateAiResponse } from "../../services/ai-response.js";
import { buildAlowareAnalyticsReport } from "../../services/aloware-analytics.js";
import {
  isAlowareChannel,
  isReplyGenerationRequest,
  REPLY_BLOCKED_MESSAGE,
} from "../../services/aloware-policy.js";
import { appendDailyReportToCanvas } from "../../services/canvas-log.js";
import { isChannelAllowed } from "../../services/channel-access.js";
import {
  buildDailyReportSummary,
  isDailySnapshotReport,
} from "../../services/daily-report-summary.js";
import { appendAssistantSummaryToCanvas } from "../../services/summary-canvas.js";
import { requestDailyAnalysisHandoff } from "../../services/daily-analysis-handoff.js";
import { timeOperation } from "../../services/telemetry.js";
import { auditCanvasStructure } from "../../services/canvas-governance.js";

const removeMentions = (text: string): string => {
  return text.replace(/<@[^>]+>/g, "").trim();
};

type AppMentionConfig = {
  allowedBotIds: Set<string>;
  allowMentionsFromBots: boolean;
  rawAllowBotMentions: string;
  rawAllowedBotIds: string;
  rawBroadcastReplies: string;
  shouldBroadcastReplies: boolean;
};

let cachedConfig: AppMentionConfig | undefined;

const getAppMentionConfig = (): AppMentionConfig => {
  const rawAllowBotMentions =
    process.env.ALLOW_BOT_APP_MENTIONS?.trim().toLowerCase() || "";
  const rawAllowedBotIds = process.env.ALLOWED_BOT_MENTION_IDS?.trim() || "";
  const rawBroadcastReplies =
    process.env.ALOWARE_BROADCAST_THREAD_REPLIES?.trim().toLowerCase() || "";

  if (
    cachedConfig &&
    cachedConfig.rawAllowBotMentions === rawAllowBotMentions &&
    cachedConfig.rawAllowedBotIds === rawAllowedBotIds &&
    cachedConfig.rawBroadcastReplies === rawBroadcastReplies
  ) {
    return cachedConfig;
  }

  cachedConfig = {
    rawAllowBotMentions,
    rawAllowedBotIds,
    rawBroadcastReplies,
    allowMentionsFromBots: rawAllowBotMentions
      ? rawAllowBotMentions === "true"
      : true,
    allowedBotIds: new Set(
      rawAllowedBotIds
        .split(",")
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
    shouldBroadcastReplies: rawBroadcastReplies === "true",
  };

  return cachedConfig;
};

const shouldAllowBotMention = (botId?: string): boolean => {
  if (!botId) {
    return true;
  }
  const config = getAppMentionConfig();
  return config.allowMentionsFromBots || config.allowedBotIds.has(botId);
};

const shouldBroadcastReplies = (): boolean => {
  return getAppMentionConfig().shouldBroadcastReplies;
};

const appMentionCallback = async ({
  client,
  event,
  logger,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_mention">) => {
  try {
    if (
      "bot_id" in event &&
      typeof event.bot_id === "string" &&
      !shouldAllowBotMention(event.bot_id)
    ) {
      return;
    }

    if (!isChannelAllowed(event.channel)) {
      return;
    }

    const isAloware = isAlowareChannel(event.channel);
    const threadTs = event.thread_ts || event.ts;
    const shouldBroadcastThreadReply =
      isAloware && Boolean(threadTs) && shouldBroadcastReplies();
    const prompt = removeMentions(event.text);
    if (isAloware && isReplyGenerationRequest(prompt)) {
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: threadTs,
        reply_broadcast: shouldBroadcastThreadReply,
        text: REPLY_BLOCKED_MESSAGE,
      });
      return;
    }

    // --- Maintenance & Governance Command ---
    if (
      prompt.toLowerCase().includes("maintenance") ||
      prompt.toLowerCase().includes("audit")
    ) {
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: threadTs,
        text: "🛡️ *Starting Canvas Governance Audit...* I will verify structural integrity and repair any managed sections.",
      });

      const result = await auditCanvasStructure({
        client,
        logger,
        channelId: event.channel,
      });

      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: threadTs,
        text: `✅ *Audit Complete.*\n- Summary Canvas: ${result.summaryCanvasOk ? "OK / Repaired" : "FAILED"}\n- Report Canvas: ${result.reportCanvasOk ? "OK / Repaired" : "FAILED"}`,
      });
      return;
    }

    const answer = isAloware
      ? await timeOperation({
          logger,
          name: "app_mention.generate_aloware_report",
          context: {
            channel_id: event.channel,
          },
          fn: async () =>
            buildAlowareAnalyticsReport({
              channelId: event.channel,
              client,
              logger,
              prompt,
            }),
        })
      : await timeOperation({
          logger,
          name: "app_mention.generate_openai_response",
          context: {
            channel_id: event.channel,
          },
          fn: async () =>
            generateAiResponse(prompt || "Say hello in one sentence."),
        });

    const postResult = (await timeOperation({
      logger,
      name: "app_mention.post_message",
      context: {
        channel_id: event.channel,
        is_aloware: isAloware,
      },
      fn: async () =>
        client.chat.postMessage({
          channel: event.channel,
          thread_ts: threadTs,
          reply_broadcast: shouldBroadcastThreadReply,
          text: answer,
        }),
    })) as { ts?: string };

    await timeOperation({
      logger,
      name: "app_mention.canvas_sync",
      context: {
        channel_id: event.channel,
        is_aloware: isAloware,
      },
      fn: async () =>
        appendDailyReportToCanvas({
          client,
          logger,
          channelId: event.channel,
          prompt,
          report: answer,
          reportMessageTs: postResult.ts,
        }),
    });

    if (isAloware && isDailySnapshotReport(answer)) {
      const summaryTs = postResult.ts || `${Date.now() / 1000}`;
      const summaryText = buildDailyReportSummary(answer);
      await timeOperation({
        logger,
        name: "app_mention.summary_canvas_sync",
        context: {
          channel_id: event.channel,
        },
        fn: async () =>
          appendAssistantSummaryToCanvas({
            client,
            logger,
            message: {
              assistantLabel: "Daily Report Summary",
              channelId: event.channel,
              text: summaryText,
              threadTs: threadTs || summaryTs,
              ts: summaryTs,
            },
          }),
      });

      const replyThread = threadTs || postResult.ts || event.ts;
      await requestDailyAnalysisHandoff({
        botClient: client,
        channelId: event.channel,
        logger,
        summaryText,
        threadTs: replyThread,
      });
    }
  } catch (error) {
    logger.error(error);
  }
};

export const __resetAppMentionConfigCacheForTests = (): void => {
  cachedConfig = undefined;
};

export { appMentionCallback };
