import type { App } from '@slack/bolt';
import { WebClient } from '@slack/web-api';

const DAILY_REPORT_CHANNEL_ID = 'C09ULGH1BEC'; // #alowaresmsupdates
const CHECK_INTERVAL_MS = 60_000; // check every minute
const REPORT_HOUR_CT = 6;
const REPORT_MINUTE_CT = 0;

let lastRunDate: string | null = null;
let cronIntervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Returns the current date/hour/minute in America/Chicago timezone.
 */
const getCTDateParts = (): { date: string; hour: number; minute: number } => {
  const now = new Date();
  // e.g. "02/25/2026, 06:00"
  const ctString = now.toLocaleString('en-US', {
    timeZone: 'America/Chicago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const [datePart, timePart] = ctString.split(', ');
  const [month, day, year] = datePart.split('/');
  const [hourStr, minuteStr] = timePart.split(':');
  return {
    date: `${year}-${month}-${day}`,
    hour: Number.parseInt(hourStr, 10),
    minute: Number.parseInt(minuteStr, 10),
  };
};

/**
 * Starts a persistent interval-based cron that fires the daily report at
 * 6:00 AM CT every day by posting as the user token (required to tag bots).
 *
 * Unlike the old one-shot chat.scheduleMessage approach, this cron survives
 * across days without needing a service restart.
 */
export const startDailyReportCron = async (app: App): Promise<void> => {
  const userToken = process.env.SLACK_USER_TOKEN?.trim();
  if (!userToken) {
    app.logger.warn('[cron] SLACK_USER_TOKEN not set; daily report cron disabled.');
    return;
  }

  let botUserId: string | undefined;
  try {
    const authResult = await app.client.auth.test();
    botUserId = authResult.user_id as string | undefined;
  } catch (error) {
    app.logger.error('[cron] Failed to resolve bot user ID:', error);
    return;
  }

  if (!botUserId) {
    app.logger.warn('[cron] Could not resolve bot user ID; daily report cron disabled.');
    return;
  }

  const userClient = new WebClient(userToken);

  app.logger.info(
    `[cron] Daily report cron started — fires at ${REPORT_HOUR_CT}:${String(REPORT_MINUTE_CT).padStart(2, '0')} AM CT targeting <@${botUserId}>`,
  );

  cronIntervalId = setInterval(() => {
    void (async () => {
      try {
        const { date, hour, minute } = getCTDateParts();

        // Only fire at the exact target minute
        if (hour !== REPORT_HOUR_CT || minute !== REPORT_MINUTE_CT) {
          return;
        }

        // Deduplicate: only fire once per calendar day (CT)
        if (lastRunDate === date) {
          return;
        }

        lastRunDate = date;
        app.logger.info(`[cron] Triggering daily report for ${date}`);

        await userClient.chat.postMessage({
          channel: DAILY_REPORT_CHANNEL_ID,
          text: `<@${botUserId}> daily report`,
        });

        app.logger.info(`[cron] ✅ Daily report message posted for ${date}`);
      } catch (error) {
        app.logger.error('[cron] Failed to post daily report message:', error);
        // Reset so it retries on the next tick (next minute)
        lastRunDate = null;
      }
    })();
  }, CHECK_INTERVAL_MS);
};

/**
 * Stops the cron interval. Useful for graceful shutdown or tests.
 */
export const stopDailyReportCron = (): void => {
  if (cronIntervalId !== null) {
    clearInterval(cronIntervalId);
    cronIntervalId = null;
  }
};
