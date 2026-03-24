import type { App } from '@slack/bolt';

const DAILY_REPORT_CHANNEL_ID = 'C09ULGH1BEC'; // #alowaresmsupdates
const REPORT_TIME_CT = { hour: 6, minute: 0 }; // 6:00 AM

/**
 * Schedules the daily analysis request by posting as the user token.
 * This triggers the bot's app_mention listener.
 */
export const scheduleDailyReport = async (app: App) => {
  const userToken = process.env.SLACK_USER_TOKEN;
  const botUserId = (await app.client.auth.test()).user_id;

  if (!userToken || !botUserId) {
    app.logger.warn('Scheduler skipped: SLACK_USER_TOKEN or bot ID missing.');
    return;
  }

  // Calculate 6:00 AM CT in UTC
  // CT is currently UTC-6 (Standard Time) or UTC-5 (Daylight Time).
  // For now, we'll use a conservative approach or check the actual offset.
  const now = new Date();

  // Use Intl to find the current hour in Central Time
  const ctString = now.toLocaleString('en-US', { timeZone: 'America/Chicago' });
  const ctDate = new Date(ctString);

  const nextRun = new Date(ctDate);
  nextRun.setHours(REPORT_TIME_CT.hour, REPORT_TIME_CT.minute, 0, 0);

  // If it's already past 6:00 AM CT, schedule for tomorrow
  if (ctDate >= nextRun) {
    nextRun.setDate(nextRun.getDate() + 1);
  }

  // Convert the local CT "nextRun" back to a UTC timestamp for Slack
  // 1. Get the ISO string from the CT date
  // 2. Adjust for the offset
  const _formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  // This is a bit tricky in vanilla JS without a library, but the chat.scheduleMessage
  // API accepts a unix timestamp.
  // We can calculate the target UTC time by finding the difference.

  const targetInCT = nextRun.getTime();
  const nowInCT = ctDate.getTime();
  const waitMs = targetInCT - nowInCT;

  const postTimeSeconds = Math.floor((now.getTime() + waitMs) / 1000);

  try {
    // Check for existing scheduled messages to avoid duplicates
    const scheduled = await app.client.chat.scheduledMessages.list({
      token: userToken,
      channel: DAILY_REPORT_CHANNEL_ID,
    });

    const alreadyScheduled = (scheduled.scheduled_messages || []).some((m) => {
      return m.post_at === postTimeSeconds && m.text?.includes('daily report');
    });

    if (alreadyScheduled) {
      app.logger.info(`Daily report already scheduled for ${nextRun.toLocaleString()}`);
      return;
    }

    // Schedule the mention
    await app.client.chat.scheduleMessage({
      token: userToken,
      channel: DAILY_REPORT_CHANNEL_ID,
      post_at: postTimeSeconds,
      text: `<@${botUserId}> daily report`,
    });

    app.logger.info(`Successfully scheduled daily report for ${nextRun.toLocaleString()}`);
  } catch (error) {
    app.logger.error('Failed to schedule daily report:', error);
  }
};
