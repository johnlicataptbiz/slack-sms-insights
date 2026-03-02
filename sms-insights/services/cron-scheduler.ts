import type { App } from '@slack/bolt';
import { logDailyRun } from './daily-run-logger.js';
import { generateAndPostReport } from './report-poster.js';

const DAILY_REPORT_CHANNEL_ID = 'C09ULGH1BEC'; // #alowaresmsupdates
const DAILY_REPORT_CHANNEL_NAME = 'alowaresmsupdates';
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
  const [month, day, year] = (datePart ?? '').split('/');
  const [hourStr, minuteStr] = (timePart ?? '').split(':');
  return {
    date: `${year}-${month}-${day}`,
    hour: Number.parseInt(hourStr ?? '0', 10),
    minute: Number.parseInt(minuteStr ?? '0', 10),
  };
};

/**
 * Starts a persistent interval-based cron that fires the daily report at
 * 6:00 AM CT every day.
 *
 * Instead of posting a trigger message and waiting for the bot to respond,
 * this directly generates the report and posts it as a rich Block Kit card
 * with interactive buttons. The full report text is posted in a thread reply.
 */
export const startDailyReportCron = async (app: App): Promise<void> => {
  app.logger.info(
    `[cron] Daily report cron started — fires at ${REPORT_HOUR_CT}:${String(REPORT_MINUTE_CT).padStart(2, '0')} AM CT`,
  );

  cronIntervalId = setInterval(() => {
    void (async () => {
      try {
        const { date, hour, minute } = getCTDateParts();

        // Only fire at the exact target minute
        if (hour !== REPORT_HOUR_CT || minute !== REPORT_MINUTE_CT) return;

        // Deduplicate: only fire once per calendar day (CT)
        if (lastRunDate === date) return;

        lastRunDate = date;
        app.logger.info(`[cron] Triggering daily report for ${date}`);

        await generateAndPostReport({
          client: app.client,
          logger: app.logger,
          channelId: DAILY_REPORT_CHANNEL_ID,
          channelName: DAILY_REPORT_CHANNEL_NAME,
          prompt: 'daily report',
          reportType: 'daily',
        });

        app.logger.info(`[cron] ✅ Daily report posted for ${date}`);
      } catch (error) {
        app.logger.error('[cron] Failed to post daily report:', error);
        // Reset so it retries on the next tick (next minute)
        lastRunDate = null;

        try {
          await logDailyRun(
            {
              channelId: DAILY_REPORT_CHANNEL_ID,
              channelName: DAILY_REPORT_CHANNEL_NAME,
              reportType: 'daily',
              status: 'error',
              errorMessage: error instanceof Error ? error.message : String(error),
            },
            app.logger,
          );
        } catch (logError) {
          app.logger.warn('[cron] Failed to log error run:', logError);
        }
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
