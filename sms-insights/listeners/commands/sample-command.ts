import type { AllMiddlewareArgs, SlackCommandMiddlewareArgs } from '@slack/bolt';
import { generateAiResponse } from '../../services/ai-response.js';
import { buildAlowareAnalyticsReport } from '../../services/aloware-analytics.js';
import { isAlowareChannel, isReplyGenerationRequest, REPLY_BLOCKED_MESSAGE } from '../../services/aloware-policy.js';
import { isChannelAllowed } from '../../services/channel-access.js';
import { timeOperation } from '../../services/telemetry.js';

const sampleCommandCallback = async ({
  ack,
  client,
  command,
  logger,
  respond,
}: AllMiddlewareArgs & SlackCommandMiddlewareArgs) => {
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
      ? await timeOperation({
          logger,
          name: 'slash_command.generate_aloware_report',
          context: {
            channel_id: command.channel_id,
          },
          fn: async () =>
            buildAlowareAnalyticsReport({
              channelId: command.channel_id,
              client,
              logger,
              prompt,
            }),
        })
      : await timeOperation({
          logger,
          name: 'slash_command.generate_openai_response',
          context: {
            channel_id: command.channel_id,
          },
          fn: async () => generateAiResponse(prompt),
        });
    await respond(answer);
  } catch (error) {
    logger.error(error);
    await respond('I ran into an error while generating analytics. Please verify channel access and try again.');
  }
};

export { sampleCommandCallback };
