import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { generateAiResponse } from '../../services/ai-response.js';
import { buildAlowareAnalyticsReportBundle, buildDailySnapshotBlocks } from '../../services/aloware-analytics.js';
import { isAlowareChannel, isReplyGenerationRequest, REPLY_BLOCKED_MESSAGE } from '../../services/aloware-policy.js';
import { isChannelAllowed } from '../../services/channel-access.js';
import { requestDailyAnalysisHandoff } from '../../services/daily-analysis-handoff.js';
import {
  buildDailyReportSummary,
  extractDailySnapshotReportDate,
  isDailySnapshotReport,
} from '../../services/daily-report-summary.js';
import { logDailyRun } from '../../services/daily-run-logger.js';
import { buildReportActionBlocks, splitReportText } from '../../services/report-poster.js';
import { timeOperation } from '../../services/telemetry.js';

const removeMentions = (text: string): string => {
  return text.replace(/<@[^>]+>/g, '').trim();
};

// ─── Config ───────────────────────────────────────────────────────────────────

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
  const rawAllowBotMentions = process.env.ALLOW_BOT_APP_MENTIONS?.trim().toLowerCase() || '';
  const rawAllowedBotIds = process.env.ALLOWED_BOT_MENTION_IDS?.trim() || '';
  const rawBroadcastReplies = process.env.ALOWARE_BROADCAST_THREAD_REPLIES?.trim().toLowerCase() || '';

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
    allowMentionsFromBots: rawAllowBotMentions ? rawAllowBotMentions === 'true' : true,
    allowedBotIds: new Set(
      rawAllowedBotIds
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0),
    ),
    shouldBroadcastReplies: rawBroadcastReplies === 'true',
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

const resolveAlowareChannelName = (): string => {
  return (
    process.env.DAILY_REPORT_CHANNEL_NAME?.trim() || process.env.ALOWARE_CHANNEL_NAME?.trim() || 'alowaresmsupdates'
  );
};

const appMentionCallback = async ({
  client,
  event,
  logger,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<'app_mention'>) => {
  try {
    logger.info(`[app_mention] received channel=${event.channel} ts=${event.ts}`);

    // ── Guard: ignore bot self-mentions ──────────────────────────────────────
    if ('bot_id' in event && typeof event.bot_id === 'string' && !shouldAllowBotMention(event.bot_id)) {
      return;
    }

    // ── Guard: channel allow-list ────────────────────────────────────────────
    if (!isChannelAllowed(event.channel)) {
      return;
    }

    const isAloware = isAlowareChannel(event.channel);
    const threadTs = event.thread_ts || event.ts;
    const shouldBroadcastThreadReply = isAloware && Boolean(threadTs) && shouldBroadcastReplies();
    const rawPrompt = removeMentions(event.text);
    // In the Aloware channel, a bare @mention with no text should default to the
    // daily report (yesterday's data) — the same thing the 6 AM cron produces.
    const prompt = isAloware && !rawPrompt ? 'daily report' : rawPrompt;

    // ── Guard: block reply-generation requests in Aloware channels ───────────
    if (isAloware && isReplyGenerationRequest(prompt)) {
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: threadTs,
        reply_broadcast: shouldBroadcastThreadReply,
        text: REPLY_BLOCKED_MESSAGE,
      });
      return;
    }

    // ── Non-Aloware channels: plain AI response ──────────────────────────────
    if (!isAloware) {
      const responseText = await timeOperation({
        logger,
        name: 'app_mention.generate_openai_response',
        context: { channel_id: event.channel },
        fn: async () => generateAiResponse(prompt || 'Say hello in one sentence.'),
      });
      await client.chat.postMessage({
        channel: event.channel,
        thread_ts: threadTs,
        text: responseText as string,
      });
      return;
    }

    // ── Aloware channels: rich Block Kit report card ─────────────────────────
    const reportBundle = (await timeOperation({
      logger,
      name: 'app_mention.generate_aloware_report',
      context: { channel_id: event.channel },
      fn: async () =>
        buildAlowareAnalyticsReportBundle({
          channelId: event.channel,
          client,
          logger,
          prompt,
        }),
    })) as Awaited<ReturnType<typeof buildAlowareAnalyticsReportBundle>>;

    const reportText = reportBundle.reportText;

    // Build summary blocks (snapshot card) + action buttons row
    const summaryBlocks = reportBundle.summary
      ? buildDailySnapshotBlocks(reportBundle.summary)
      : [
          {
            type: 'section' as const,
            text: {
              type: 'mrkdwn' as const,
              text: '📊 *SMS Report Generated* — see thread for full details.',
            },
          },
        ];

    // Post the summary card (with reply_broadcast if configured)
    const summaryPost = await client.chat.postMessage({
      channel: event.channel,
      thread_ts: threadTs,
      reply_broadcast: shouldBroadcastThreadReply,
      text: 'Daily SMS Snapshot — see thread for full report',
      blocks: [
        ...summaryBlocks,
        ...buildReportActionBlocks(event.channel, undefined, prompt),
      ],
    });

    const postedTs = typeof summaryPost.ts === 'string' ? summaryPost.ts : undefined;

    // Update the message so the Refresh button carries the correct messageTs
    if (postedTs) {
      await client.chat
        .update({
          channel: event.channel,
          ts: postedTs,
          text: 'Daily SMS Snapshot — see thread for full report',
          blocks: [
            ...summaryBlocks,
            ...buildReportActionBlocks(event.channel, postedTs, prompt),
          ],
        })
        .catch(() => {
          // Non-fatal — Refresh button will fall back to body.message.ts
        });
    }

    // Post full report text in thread
    if (reportText && postedTs) {
      const chunks = splitReportText(reportText);
      for (const [index, chunk] of chunks.entries()) {
        await client.chat.postMessage({
          channel: event.channel,
          thread_ts: postedTs,
          text: chunks.length > 1 ? `*Part ${index + 1}/${chunks.length}*\n${chunk}` : chunk,
        });
      }
    }

    // ── Daily analysis handoff (for daily snapshot reports) ──────────────────
    const isDailySnapshot = isDailySnapshotReport(reportText);
    if (isDailySnapshot) {
      const summaryText = buildDailyReportSummary(reportText);
      const replyThread = threadTs || postedTs || event.ts;
      await requestDailyAnalysisHandoff({
        botClient: client,
        channelId: event.channel,
        logger,
        summaryText,
        threadTs: replyThread,
      });
    }

    // ── Log the successful run ────────────────────────────────────────────────
    try {
      const summaryText = isDailySnapshot
        ? buildDailyReportSummary(reportText)
        : reportText.split('\n').slice(0, 5).join('\n');
      await logDailyRun(
        {
          channelId: event.channel,
          channelName: resolveAlowareChannelName(),
          reportDate: isDailySnapshot ? extractDailySnapshotReportDate(reportText) ?? undefined : undefined,
          reportType: event.thread_ts ? 'manual' : 'daily',
          status: 'success',
          summaryText,
          fullReport: reportText,
        },
        logger,
      );
    } catch (logError) {
      logger.warn('[app_mention] Failed to log report run:', logError);
    }
  } catch (error) {
    logger.error('[app_mention] Unhandled error:', error);

    // ── Log the failed run ────────────────────────────────────────────────────
    try {
      await logDailyRun(
        {
          channelId: event.channel,
          channelName: isAlowareChannel(event.channel) ? resolveAlowareChannelName() : undefined,
          reportType: 'manual',
          status: 'error',
          errorMessage: error instanceof Error ? error.message : String(error),
        },
        logger,
      );
    } catch (logError) {
      logger.warn('[app_mention] Failed to log error run:', logError);
    }
  }
};

export const __resetAppMentionConfigCacheForTests = (): void => {
  cachedConfig = undefined;
};

export { appMentionCallback };
