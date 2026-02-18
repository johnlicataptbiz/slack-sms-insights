import type { App } from '@slack/bolt';

export async function reportError(app: App, error: any, context: string) {
  const adminChannel = process.env.SYSTEM_ADMIN_CHANNEL_ID || process.env.ALOWARE_WATCHER_CHANNEL_ID;

  app.logger.error(`[${context}] Error:`, error);

  if (!adminChannel || error?.code === 'slack_webapi_platform_error' && error?.data?.error === 'invalid_auth') {
    return;
  }

  try {
    await app.client.chat.postMessage({
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
            text: `*Context:* \`${context}\`\n*Error:* \`${error?.message || error}\``,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Stack:* \n\`\`\`${error?.stack?.slice(0, 500) || 'No stack trace available'}\`\`\``,
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
    app.logger.error('Failed to send error report to Slack:', logError);
  }
}
