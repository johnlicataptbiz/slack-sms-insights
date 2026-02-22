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
import { timeOperation } from '../../services/telemetry.js';

const SLACK_TEXT_CHUNK_LIMIT = 3500;

const removeMentions = (text: string): string => {
  return text.replace(/<@[^>]+>/g, '').trim();
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

const splitSlackText = (text: string, maxLen = SLACK_TEXT_CHUNK_LIMIT): string[] => {
  const normalized = text.replaceAll('\r', '').trim();
  if (normalized.length <= maxLen) {
    return [normalized];
  }

  const chunks: string[] = [];
  let current = '';
  const paragraphs = normalized.split('\n\n');

  const flushCurrent = () => {
    if (current.trim().length > 0) {
      chunks.push(current.trimEnd());
      current = '';
    }
  };

  for (const paragraph of paragraphs) {
    const candidate = current.length > 0 ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxLen) {
      current = candidate;
      continue;
    }

    flushCurrent();

    if (paragraph.length <= maxLen) {
      current = paragraph;
      continue;
    }

    let remaining = paragraph;
    while (remaining.length > maxLen) {
      const window = remaining.slice(0, maxLen);
      const lineSplit = window.lastIndexOf('\n');
      const wordSplit = window.lastIndexOf(' ');
      const splitAt = Math.max(lineSplit, wordSplit);
      const cut = splitAt > Math.floor(maxLen * 0.6) ? splitAt : maxLen;
      chunks.push(remaining.slice(0, cut).trimEnd());
      remaining = remaining.slice(cut).trimStart();
    }
    current = remaining;
  }

  flushCurrent();

  if (chunks.length <= 1) {
    return chunks.length === 1 ? chunks : [normalized];
  }

  return chunks.map((chunk, index) => `*Report chunk ${index + 1}/${chunks.length}*\n${chunk}`);
};

const resolveAlowareChannelName = (): string => {
  return process.env.DAILY_REPORT_CHANNEL_NAME?.trim() || process.env.ALOWARE_CHANNEL_NAME?.trim() || 'alowaresmsupdates';
};

const appMentionCallback = async ({
  client,
  event,
  logger,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<'app_mention'>) => {
  try {
    logger.info(`[app_mention] received channel=${event.channel} ts=${event.ts}`);
    if ('bot_id' in event && typeof event.bot_id === 'string' && !shouldAllowBotMention(event.bot_id)) {
      return;
    }

    if (!isChannelAllowed(event.channel)) {
      return;
    }

    const isAloware = isAlowareChannel(event.channel);
    const threadTs = event.thread_ts || event.ts;
    const shouldBroadcastThreadReply = isAloware && Boolean(threadTs) && shouldBroadcastReplies();
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

    let reportText = '';
    let summaryBlocks: ReturnType<typeof buildDailySnapshotBlocks> | undefined;

    if (isAloware) {
      const reportBundle = (await timeOperation({
        logger,
        name: 'app_mention.generate_aloware_report',
        context: {
          channel_id: event.channel,
        },
        fn: async () =>
          buildAlowareAnalyticsReportBundle({
            channelId: event.channel,
            client,
            logger,
            prompt,
          }),
      })) as Awaited<ReturnType<typeof buildAlowareAnalyticsReportBundle>>;

      reportText = reportBundle.reportText;
      if (reportBundle.summary) {
        summaryBlocks = buildDailySnapshotBlocks(reportBundle.summary);
      }
    } else {
      reportText = await timeOperation({
        logger,
        name: 'app_mention.generate_openai_response',
        context: {
          channel_id: event.channel,
        },
        fn: async () => generateAiResponse(prompt || 'Say hello in one sentence.'),
      });
    }

    const responseChunks = isAloware ? splitSlackText(reportText) : [reportText];

    const postResult = (await timeOperation({
      logger,
      name: 'app_mention.post_message',
      context: {
        channel_id: event.channel,
        is_aloware: isAloware,
      },
      fn: async () => {
        let firstTs = '';
        if (summaryBlocks) {
          const summaryPost = await client.chat.postMessage({
            channel: event.channel,
            thread_ts: threadTs,
            reply_broadcast: shouldBroadcastThreadReply,
            text: 'Daily SMS Snapshot',
            blocks: summaryBlocks,
          });
          if (!firstTs && summaryPost.ts) {
            firstTs = summaryPost.ts;
          }
        }
        for (const [index, chunk] of responseChunks.entries()) {
          const posted = await client.chat.postMessage({
            channel: event.channel,
            thread_ts: threadTs,
            reply_broadcast: shouldBroadcastThreadReply && !summaryBlocks && index === 0,
            text: chunk,
          });
          if (!firstTs && posted.ts) {
            firstTs = posted.ts;
          }
        }
        return { ts: firstTs };
      },
    })) as { ts?: string };

    const isDailySnapshot = isAloware && isDailySnapshotReport(reportText);

    if (isDailySnapshot) {
      const summaryText = buildDailyReportSummary(reportText);
      const replyThread = threadTs || postResult.ts || event.ts;
      await requestDailyAnalysisHandoff({
        botClient: client,
        channelId: event.channel,
        logger,
        summaryText,
        threadTs: replyThread,
      });
    }

    // Log the successful report run
    if (isAloware) {
      try {
        const summaryText = isDailySnapshot ? buildDailyReportSummary(reportText) : reportText.split('\n').slice(0, 5).join('\n');
        await logDailyRun(
          {
            channelId: event.channel,
            channelName: resolveAlowareChannelName(),
            reportDate: isDailySnapshot ? extractDailySnapshotReportDate(reportText) || undefined : undefined,
            reportType: event.thread_ts ? 'manual' : 'daily',
            status: 'success',
            summaryText,
            fullReport: reportText,
          },
          logger,
        );
      } catch (logError) {
        logger.warn('Failed to log report run:', logError);
      }
    }
  } catch (error) {
    logger.error(error);

    // Log the failed report run
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
      logger.warn('Failed to log error run:', logError);
    }
  }
};

export const __resetAppMentionConfigCacheForTests = (): void => {
  cachedConfig = undefined;
};

export { appMentionCallback };
