import type { App } from '@slack/bolt';
import { generateAiResponse } from '../../services/ai-response.js';
import { buildAlowareAnalyticsReport } from '../../services/aloware-analytics.js';
import { isAlowareChannel, isReplyGenerationRequest, REPLY_BLOCKED_MESSAGE } from '../../services/aloware-policy.js';
import { isChannelAllowed } from '../../services/channel-access.js';

const SLACK_TEXT_CHUNK_LIMIT = 3000;

const splitSlackText = (text: string, maxLen = SLACK_TEXT_CHUNK_LIMIT): string[] => {
  const normalized = text.replaceAll('\r', '').trim();
  if (normalized.length <= maxLen) {
    return [normalized];
  }

  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > maxLen) {
    const window = remaining.slice(0, maxLen);
    const splitAt = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '));
    const cut = splitAt > Math.floor(maxLen * 0.6) ? splitAt : maxLen;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
};

const register = (app: App) => {
  app.command('/ask', async ({ ack, client, command, logger, respond }) => {
    try {
      await ack();
    } catch (error) {
      logger.error(error);
      return;
    }

    const prompt = command.text?.trim();
    if (!prompt) {
      await respond('Usage: `/ask <question>`');
      return;
    }

    if (!isChannelAllowed(command.channel_id)) {
      await respond('This app is currently enabled only in selected channels.');
      return;
    }

    if (isAlowareChannel(command.channel_id) && isReplyGenerationRequest(prompt)) {
      await respond(REPLY_BLOCKED_MESSAGE);
      return;
    }

    try {
      const answer = isAlowareChannel(command.channel_id)
        ? await buildAlowareAnalyticsReport({
            channelId: command.channel_id,
            client,
            logger,
            prompt,
          })
        : await generateAiResponse(prompt);

      for (const chunk of splitSlackText(answer)) {
        await respond(chunk);
      }
    } catch (error) {
      logger.error(error);
      await respond('I ran into an error while generating analytics. Please verify channel access and try again.');
    }
  });
};

export default { register };
