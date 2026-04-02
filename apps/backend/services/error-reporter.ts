import type { App } from '@slack/bolt';
type AppLike = {
  logger: {
    error: (...args: unknown[]) => void;
  };
  client: {
    chat: {
      postMessage: (args: Record<string, unknown>) => Promise<unknown>;
    };
  };
};

type SlackWebApiPlatformError = {
  code?: string;
  data?: {
    error?: string;
  };
  message?: string;
  stack?: string;
};

const isSlackWebApiPlatformError = (error: unknown): error is SlackWebApiPlatformError => {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return true;
};

export async function reportError(app: App, error: unknown, context: string) {
  const runtime = app as unknown as AppLike;
  const adminChannel = process.env.SYSTEM_ADMIN_CHANNEL_ID || process.env.ALOWARE_WATCHER_CHANNEL_ID;

  runtime.logger.error(`[${context}] Error:`, error);

  const slackError = isSlackWebApiPlatformError(error) ? error : undefined;

  if (
    !adminChannel ||
    (slackError?.code === 'slack_webapi_platform_error' && slackError?.data?.error === 'invalid_auth')
  ) {
    if (slackError?.data?.error === 'invalid_auth') {
      runtime.logger.error(
        `[${context}] Slack reporting skipped due to invalid_auth. Check SLACK_BOT_TOKEN and SLACK_APP_TOKEN.`,
      );
    }
    return;
  }

  try {
    await runtime.client.chat.postMessage({
      channel: adminChannel,
      text: `🚨 System Error in ${context}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: '🚨 System Error Detected',
            emoji: true,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Context:* \`${context}\`\n*Error:* \`${slackError?.message || String(error)}\``,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Stack:* \n\`\`\`${slackError?.stack?.slice(0, 500) || 'No stack trace available'}\`\`\``,
          },
        },
        {
          type: 'context',
          elements: [
            {
              type: 'mrkdwn',
              text: `📍 Machine: ${process.env.RAILWAY_ENVIRONMENT_NAME || 'Local Development'}`,
            },
          ],
        },
      ],
    });
  } catch (logError) {
    runtime.logger.error('Failed to send error report to Slack:', logError);
  }
}
