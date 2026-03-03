import type { App } from '@slack/bolt';
import { logDailyRun } from './daily-run-logger.js';
import { getDefaultLrnBackfillOptions, runLrnBackfill } from './lrn-refresh.js';
import { generateAndPostReport } from './report-poster.js';

const BUSINESS_TIMEZONE = 'America/Chicago';
const DAILY_REPORT_CHANNEL_ID = 'C09ULGH1BEC'; // #alowaresmsupdates
const DAILY_REPORT_CHANNEL_NAME = 'alowaresmsupdates';
const CHECK_INTERVAL_MS = 60_000; // check every minute
const REPORT_HOUR_CT = 6;
const REPORT_MINUTE_CT = 0;
const LRN_REFRESH_DEFAULT_HOUR_CT = 2;
const LRN_REFRESH_DEFAULT_MINUTE_CT = 15;

let lastRunDate: string | null = null;
let cronIntervalId: ReturnType<typeof setInterval> | null = null;
let lastLrnRefreshDate: string | null = null;
let lrnIntervalId: ReturnType<typeof setInterval> | null = null;

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

const pad2 = (value: number): string => String(value).padStart(2, '0');

const addDaysToYmd = (ymd: string, days: number): string => {
  const [yearRaw, monthRaw, dayRaw] = ymd.split('-');
  const year = Number.parseInt(yearRaw || '0', 10);
  const month = Number.parseInt(monthRaw || '1', 10);
  const day = Number.parseInt(dayRaw || '1', 10);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}`;
};

const resolveNextRunCt = (targetHour: number, targetMinute: number): { date: string; time: string } => {
  const { date, hour, minute } = getCTDateParts();
  const sameDayEligible = hour < targetHour || (hour === targetHour && minute < targetMinute);
  const nextDate = sameDayEligible ? date : addDaysToYmd(date, 1);
  return {
    date: nextDate,
    time: `${pad2(targetHour)}:${pad2(targetMinute)}`,
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

const parseBool = (value: string | undefined, fallback = false): boolean => {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
};

const parseIntOr = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt((value || '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const isLrnRefreshEnabled = (): boolean => parseBool(process.env.ALOWARE_LRN_REFRESH_CRON_ENABLED, false);

export const getCronStatusSnapshot = (): {
  timezone: string;
  serverTimeIso: string;
  dailyReport: {
    running: boolean;
    targetHourCt: number;
    targetMinuteCt: number;
    lastRunDateCt: string | null;
    nextRunCt: { date: string; time: string };
  };
  lrnRefresh: {
    running: boolean;
    enabled: boolean;
    targetHourCt: number;
    targetMinuteCt: number;
    lastRunDateCt: string | null;
    nextRunCt: { date: string; time: string };
    options: {
      limit: number;
      delayMs: number;
      staleDays: number;
      forceAll: boolean;
    };
  };
} => {
  const lrnEnabled = isLrnRefreshEnabled();
  const defaultOptions = getDefaultLrnBackfillOptions();
  const lrnTargetHour = Math.max(0, Math.min(23, parseIntOr(process.env.ALOWARE_LRN_REFRESH_HOUR_CT, LRN_REFRESH_DEFAULT_HOUR_CT)));
  const lrnTargetMinute = Math.max(
    0,
    Math.min(59, parseIntOr(process.env.ALOWARE_LRN_REFRESH_MINUTE_CT, LRN_REFRESH_DEFAULT_MINUTE_CT)),
  );
  const limit = Math.max(1, parseIntOr(process.env.ALOWARE_LRN_REFRESH_LIMIT, defaultOptions.limit));
  const delayMs = Math.max(0, parseIntOr(process.env.ALOWARE_LRN_REFRESH_DELAY_MS, defaultOptions.delayMs));
  const staleDays = Math.max(0, parseIntOr(process.env.ALOWARE_LRN_REFRESH_STALE_DAYS, defaultOptions.staleDays));
  const forceAll = parseBool(process.env.ALOWARE_LRN_REFRESH_FORCE_ALL, false);

  return {
    timezone: BUSINESS_TIMEZONE,
    serverTimeIso: new Date().toISOString(),
    dailyReport: {
      running: cronIntervalId !== null,
      targetHourCt: REPORT_HOUR_CT,
      targetMinuteCt: REPORT_MINUTE_CT,
      lastRunDateCt: lastRunDate,
      nextRunCt: resolveNextRunCt(REPORT_HOUR_CT, REPORT_MINUTE_CT),
    },
    lrnRefresh: {
      running: lrnIntervalId !== null,
      enabled: lrnEnabled,
      targetHourCt: lrnTargetHour,
      targetMinuteCt: lrnTargetMinute,
      lastRunDateCt: lastLrnRefreshDate,
      nextRunCt: resolveNextRunCt(lrnTargetHour, lrnTargetMinute),
      options: {
        limit,
        delayMs,
        staleDays,
        forceAll,
      },
    },
  };
};

export const startLrnRefreshCron = (app: App): void => {
  if (!isLrnRefreshEnabled()) {
    app.logger.info('[cron] LRN refresh cron disabled (ALOWARE_LRN_REFRESH_CRON_ENABLED=false)');
    return;
  }

  const targetHour = Math.max(0, Math.min(23, parseIntOr(process.env.ALOWARE_LRN_REFRESH_HOUR_CT, LRN_REFRESH_DEFAULT_HOUR_CT)));
  const targetMinute = Math.max(
    0,
    Math.min(59, parseIntOr(process.env.ALOWARE_LRN_REFRESH_MINUTE_CT, LRN_REFRESH_DEFAULT_MINUTE_CT)),
  );
  const defaultOptions = getDefaultLrnBackfillOptions();
  const limit = Math.max(1, parseIntOr(process.env.ALOWARE_LRN_REFRESH_LIMIT, defaultOptions.limit));
  const delayMs = Math.max(0, parseIntOr(process.env.ALOWARE_LRN_REFRESH_DELAY_MS, defaultOptions.delayMs));
  const staleDays = Math.max(0, parseIntOr(process.env.ALOWARE_LRN_REFRESH_STALE_DAYS, defaultOptions.staleDays));
  const forceAll = parseBool(process.env.ALOWARE_LRN_REFRESH_FORCE_ALL, false);

  app.logger.info(
    `[cron] LRN refresh cron started — fires at ${targetHour}:${String(targetMinute).padStart(2, '0')} CT ` +
      `(limit=${limit}, delayMs=${delayMs}, staleDays=${staleDays}, forceAll=${forceAll})`,
  );

  lrnIntervalId = setInterval(() => {
    void (async () => {
      const { date, hour, minute } = getCTDateParts();
      if (hour !== targetHour || minute !== targetMinute) return;
      if (lastLrnRefreshDate === date) return;

      lastLrnRefreshDate = date;
      app.logger.info(`[cron] Triggering nightly LRN refresh for ${date}`);

      try {
        const summary = await runLrnBackfill(
          {
            dryRun: false,
            limit,
            offset: 0,
            delayMs,
            staleDays,
            forceAll,
          },
          app.logger,
        );
        app.logger.info('[cron] ✅ LRN refresh completed', summary);
      } catch (error) {
        app.logger.error('[cron] LRN refresh failed:', error);
        // Reset so it retries on next tick
        lastLrnRefreshDate = null;
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
  if (lrnIntervalId !== null) {
    clearInterval(lrnIntervalId);
    lrnIntervalId = null;
  }
};
