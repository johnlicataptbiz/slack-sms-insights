import type { App } from '@slack/bolt';
import type { Logger } from '@slack/bolt';
import {
  getConversionTrends,
  getSetterPerformance,
  getSLATrends,
  getTeamPerformanceTrends,
} from './analytics-queries.js';
import { getAttributionLagStatus } from './attribution-health.js';
import { refreshBookedCallAttribution } from './booked-call-attribution-refresh.js';
import { postDerekComment } from './bot-personality.js';
import { autoAssignWorkItems } from './comprehensive-fixes.js';
import { logDailyRun } from './daily-run-logger.js';
import { refreshKpiFacts } from './kpi-facts.js';
import { getDefaultLrnBackfillOptions, runLrnBackfill } from './lrn-refresh.js';
import { refreshTeamContext } from './message-context.js';
import { getPrismaClient } from './prisma.js';
import { postProactiveAlert, quickAlertCheck, shouldSendAlert } from './proactive-alerts.js';
import { generateAndPostReport } from './report-poster.js';

const BUSINESS_TIMEZONE = 'America/Chicago';
const DAILY_REPORT_CHANNEL_ID = 'C09ULGH1BEC'; // #alowaresmsupdates
const DAILY_REPORT_CHANNEL_NAME = 'alowaresmsupdates';
const CHECK_INTERVAL_MS = 60_000; // check every minute
const INBOX_WATCH_INTERVAL_MINUTES = 5;
const INBOX_ALERT_COOLDOWN_MS = 60 * 60 * 1000;
const ATTRIBUTION_LAG_THRESHOLD_HOURS = 24;
const ATTRIBUTION_HEALTH_CHECK_INTERVAL_MINUTES = 15;
const ATTRIBUTION_ALERT_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const ATTRIBUTION_REFRESH_HOUR_CT = 5;
const ATTRIBUTION_REFRESH_MINUTE_CT = 45;
const ATTRIBUTION_REFRESH_LOOKBACK_DAYS = 30;
const KPI_REFRESH_HOUR_CT = 5;
const KPI_REFRESH_MINUTE_CT = 55;
const KPI_REFRESH_LOOKBACK_DAYS = 14;
const REPORT_HOUR_CT = 6;
const REPORT_MINUTE_CT = 0;
const LRN_REFRESH_DEFAULT_HOUR_CT = 2;
const LRN_REFRESH_DEFAULT_MINUTE_CT = 15;
const PROACTIVE_ALERTS_INTERVAL_MINUTES = 60;
const PROACTIVE_ALERTS_CHECK_ENABLED = (process.env.PROACTIVE_ALERTS_ENABLED ?? 'true').toLowerCase() === 'true';
const ALERTS_WEBHOOK_URL = process.env.ALERTS_WEBHOOK_URL || 'http://localhost:3000/api/alerts/webhook';

let lastRunDate: string | null = null;
let cronIntervalId: ReturnType<typeof setInterval> | null = null;
let lastLrnRefreshDate: string | null = null;
let lrnIntervalId: ReturnType<typeof setInterval> | null = null;
let lastInboxWatchSlot: string | null = null;
let lastInboxAlertAt = 0;
let lastInboxAlertSignature: string | null = null;
let lastAutoAssignAt = 0;
let lastAttributionHealthSlot: string | null = null;
let lastAttributionAlertAt = 0;
let lastAttributionRefreshDate: string | null = null;
let lastKpiRefreshDate: string | null = null;
let lastProactiveAlertsSlot: string | null = null;

const getPrisma = () => getPrismaClient();

type InboxWatchCounts = {
  criticalCount: number;
  staleCount: number;
  unassignedCount: number;
  needsReplyCount: number;
};

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
type AppLike = {
  logger: Logger;
  client: any;
};

export const startDailyReportCron = async (appRaw: App): Promise<void> => {
  const app = appRaw as unknown as AppLike;
  app.logger.info(
    `[cron] Daily report cron started — fires at ${REPORT_HOUR_CT}:${String(REPORT_MINUTE_CT).padStart(2, '0')} AM CT`,
  );

  cronIntervalId = setInterval(() => {
    void (async () => {
      const { date, hour, minute } = getCTDateParts();

      // ── Background maintenance tasks — each isolated so a Prisma Accelerate
      //    failure does NOT pollute the daily-run log or reset the report
      //    dedup guard (lastRunDate). ─────────────────────────────────────────
      if (shouldRunInboxWatch(date, hour, minute)) {
        try {
          const thresholds = getInboxWatchThresholds();
          const counts = await loadInboxWatchCounts();
          await postInboxWatchAlert(app, counts, thresholds);
          await maybeAutoAssignInboxBacklog(app, counts, thresholds);
        } catch (error) {
          app.logger.error('[cron] Inbox watch failed (non-fatal):', error);
        }
      }

      if (shouldRunProactiveAlerts(date, hour, minute)) {
        await checkProactiveAlerts(app);
      }

      try {
        await maybeAlertAttributionLag(app, date, hour, minute);
      } catch (error) {
        app.logger.error('[cron] Attribution lag check failed (non-fatal):', error);
      }

      try {
        await maybeRefreshBookedCallAttribution(app, date, hour, minute);
      } catch (error) {
        app.logger.error('[cron] Booked call attribution refresh failed (non-fatal):', error);
      }

      try {
        await maybeRefreshKpiFacts(app, date, hour, minute);
      } catch (error) {
        app.logger.error('[cron] KPI facts refresh failed (non-fatal):', error);
      }

      // ── Daily report — only fires at REPORT_HOUR_CT:REPORT_MINUTE_CT CT ──
      if (hour !== REPORT_HOUR_CT || minute !== REPORT_MINUTE_CT) return;

      // Deduplicate: only fire once per calendar day (CT)
      if (lastRunDate === date) return;

      lastRunDate = date;
      app.logger.info(`[cron] Triggering daily report for ${date}`);

      try {
        await generateAndPostReport({
          client: app.client,
          logger: app.logger,
          channelId: DAILY_REPORT_CHANNEL_ID,
          channelName: DAILY_REPORT_CHANNEL_NAME,
          // Keep cron reports pinned to prior-day results even if a retry happens later.
          prompt: 'daily report yesterday',
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

const getInboxWatchThresholds = () => ({
  critical: Math.max(1, parseIntOr(process.env.INBOX_ALERT_CRITICAL_THRESHOLD, 50)),
  stale: Math.max(1, parseIntOr(process.env.INBOX_ALERT_STALE_THRESHOLD, 50)),
  unassigned: Math.max(1, parseIntOr(process.env.INBOX_ALERT_UNASSIGNED_THRESHOLD, 10)),
});

const shouldRunInboxWatch = (date: string, hour: number, minute: number): boolean => {
  if (minute % INBOX_WATCH_INTERVAL_MINUTES !== 0) return false;
  const slot = `${date}-${pad2(hour)}:${pad2(minute)}`;
  if (lastInboxWatchSlot === slot) return false;
  lastInboxWatchSlot = slot;
  return true;
};

const shouldRunAttributionHealthCheck = (date: string, hour: number, minute: number): boolean => {
  if (minute % ATTRIBUTION_HEALTH_CHECK_INTERVAL_MINUTES !== 0) return false;
  const slot = `${date}-${pad2(hour)}:${pad2(minute)}`;
  if (lastAttributionHealthSlot === slot) return false;
  lastAttributionHealthSlot = slot;
  return true;
};

const shouldRunProactiveAlerts = (date: string, hour: number, minute: number): boolean => {
  if (!PROACTIVE_ALERTS_CHECK_ENABLED) return false;
  if (minute % PROACTIVE_ALERTS_INTERVAL_MINUTES !== 0) return false;
  const slot = `${date}-${pad2(hour)}:${pad2(minute)}`;
  if (lastProactiveAlertsSlot === slot) return false;
  lastProactiveAlertsSlot = slot;
  return true;
};

const checkProactiveAlerts = async (app: AppLike): Promise<void> => {
  try {
    // Use the intelligent proactive alert system
    const { shouldAlert, alerts } = await quickAlertCheck();

    if (!shouldAlert || alerts.length === 0) {
      app.logger.debug('[cron] No proactive alerts needed');
      return;
    }

    // Check cooldown to prevent alert spam
    const alertKey = `proactive-alerts-${new Date().toISOString().slice(0, 10)}`;
    if (!shouldSendAlert(alertKey)) {
      app.logger.debug('[cron] Proactive alerts in cooldown, skipping');
      return;
    }

    // Get the alerts channel
    const alertsChannelId = process.env.ALERTS_CHANNEL_ID || DAILY_REPORT_CHANNEL_ID;

    // Post the alert with rich Block Kit formatting
    await postProactiveAlert(app.client, alertsChannelId, alerts, app.logger);

    app.logger.info(`[cron] Posted ${alerts.length} proactive alert(s)`);
  } catch (error) {
    app.logger.error('[cron] Proactive alerts check failed (non-fatal):', error);
  }
};

const loadInboxWatchCounts = async (): Promise<InboxWatchCounts> => {
  const prisma = getPrisma();
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      critical_count: number | bigint | string;
      stale_count: number | bigint | string;
      unassigned_count: number | bigint | string;
      needs_reply_count: number | bigint | string;
    }>
  >(
    `
    WITH open_items AS (
      SELECT wi.conversation_id, COUNT(*) AS open_needs_reply_count
      FROM work_items wi
      WHERE wi.resolved_at IS NULL
        AND wi.type = 'needs_reply'
      GROUP BY wi.conversation_id
    )
    SELECT
      COUNT(*) FILTER (
        WHERE COALESCE(cs.escalation_level, 99) = 1
          AND COALESCE(oi.open_needs_reply_count, 0) > 0
      ) AS critical_count,
      COUNT(*) FILTER (
        WHERE COALESCE(oi.open_needs_reply_count, 0) > 0
          AND NOW() - COALESCE(c.last_touch_at, c.updated_at, c.created_at) > INTERVAL '48 hours'
      ) AS stale_count,
      COUNT(*) FILTER (
        WHERE COALESCE(oi.open_needs_reply_count, 0) > 0
          AND (c.current_rep_id IS NULL OR BTRIM(c.current_rep_id) = '')
      ) AS unassigned_count,
      COUNT(*) FILTER (WHERE COALESCE(oi.open_needs_reply_count, 0) > 0) AS needs_reply_count
    FROM conversations c
    LEFT JOIN conversation_state cs ON cs.conversation_id = c.id
    LEFT JOIN open_items oi ON oi.conversation_id = c.id
    WHERE c.status = 'open'::"ConversationStatus"
    `,
  );

  const row = rows[0];
  return {
    criticalCount: Number(row?.critical_count ?? 0),
    staleCount: Number(row?.stale_count ?? 0),
    unassignedCount: Number(row?.unassigned_count ?? 0),
    needsReplyCount: Number(row?.needs_reply_count ?? 0),
  };
};

const postInboxWatchAlert = async (
  app: AppLike,
  counts: InboxWatchCounts,
  thresholds: { critical: number; stale: number; unassigned: number },
): Promise<void> => {
  const channelId = (process.env.INBOX_ALERT_CHANNEL_ID || DAILY_REPORT_CHANNEL_ID).trim();
  const now = Date.now();
  const signature = `${counts.criticalCount}|${counts.staleCount}|${counts.unassignedCount}|${counts.needsReplyCount}`;
  const breached =
    counts.criticalCount >= thresholds.critical ||
    counts.staleCount >= thresholds.stale ||
    counts.unassignedCount >= thresholds.unassigned;
  if (!breached) return;
  if (now - lastInboxAlertAt < INBOX_ALERT_COOLDOWN_MS && signature === lastInboxAlertSignature) return;

  // Trigger webhook to alerts API (for Slack Workflow integration)
  const webhookUrl = `${process.env.SMS_INSIGHTS_API_BASE_URL || 'http://localhost:3000'}/api/alerts/inbox`;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        critical: counts.criticalCount,
        stale: counts.staleCount,
        unassigned: counts.unassignedCount,
        needsReply: counts.needsReplyCount,
      }),
    });
  } catch (error) {
    app.logger.error('[cron] inbox alert webhook failed:', error);
  }

  // Also post directly to Slack channel
  await app.client.chat.postMessage({
    channel: channelId,
    text:
      `Inbox backlog alert: critical=${counts.criticalCount} (>=${thresholds.critical}), ` +
      `stale=${counts.staleCount} (>=${thresholds.stale}), ` +
      `unassigned=${counts.unassignedCount} (>=${thresholds.unassigned}), ` +
      `needs_reply=${counts.needsReplyCount}`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            ':rotating_light: *Inbox backlog alert*\n' +
            `• Critical (L1 + needs reply): *${counts.criticalCount}* (threshold ${thresholds.critical})\n` +
            `• Stale (>48h + needs reply): *${counts.staleCount}* (threshold ${thresholds.stale})\n` +
            `• Unassigned + needs reply: *${counts.unassignedCount}* (threshold ${thresholds.unassigned})\n` +
            `• Total needs reply: *${counts.needsReplyCount}*`,
        },
      },
    ],
  });

  lastInboxAlertAt = now;
  lastInboxAlertSignature = signature;
};

const maybeAutoAssignInboxBacklog = async (
  app: AppLike,
  counts: InboxWatchCounts,
  thresholds: { critical: number; stale: number; unassigned: number },
): Promise<void> => {
  const enabled = parseBool(process.env.INBOX_AUTO_ASSIGN_ENABLED, false);
  if (!enabled) return;
  if (counts.unassignedCount < thresholds.unassigned) return;

  const now = Date.now();
  if (now - lastAutoAssignAt < INBOX_ALERT_COOLDOWN_MS) return;

  const result = await autoAssignWorkItems();
  lastAutoAssignAt = now;
  app.logger.info('[cron] Inbox auto-assign executed', {
    assigned: result.assigned,
    errors: result.errors.length,
  });
};

const maybeRefreshBookedCallAttribution = async (
  app: AppLike,
  date: string,
  hour: number,
  minute: number,
): Promise<void> => {
  if (hour !== ATTRIBUTION_REFRESH_HOUR_CT || minute !== ATTRIBUTION_REFRESH_MINUTE_CT) return;
  if (lastAttributionRefreshDate === date) return;

  const to = new Date();
  const from = new Date(to.getTime() - ATTRIBUTION_REFRESH_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const result = await refreshBookedCallAttribution(
    {
      from,
      to,
      channelId: process.env.BOOKED_CALLS_CHANNEL_ID || undefined,
    },
    app.logger,
  );
  lastAttributionRefreshDate = date;
  app.logger.info('[cron] booked_call_attribution refresh complete', result);
};

const maybeAlertAttributionLag = async (app: AppLike, date: string, hour: number, minute: number): Promise<void> => {
  if (!shouldRunAttributionHealthCheck(date, hour, minute)) return;

  const lagStatus = await getAttributionLagStatus(ATTRIBUTION_LAG_THRESHOLD_HOURS);
  if (!lagStatus.isLagging) return;
  if (Date.now() - lastAttributionAlertAt < ATTRIBUTION_ALERT_COOLDOWN_MS) return;

  // Trigger webhook to alerts API (for Slack Workflow integration)
  const webhookUrl = `${process.env.SMS_INSIGHTS_API_BASE_URL || 'http://localhost:3000'}/api/alerts/attribution`;
  try {
    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        lagHours: lagStatus.lagHours,
        maxBookedCallsTs: lagStatus.maxBookedCallsTs,
        maxAttributionTs: lagStatus.maxAttributionTs,
      }),
    });
  } catch (error) {
    app.logger.error('[cron] attribution alert webhook failed:', error);
  }

  const channelId = (process.env.ATTRIBUTION_ALERT_CHANNEL_ID || DAILY_REPORT_CHANNEL_ID).trim();
  await app.client.chat.postMessage({
    channel: channelId,
    text:
      `Attribution lag alert: booked_call_attribution is ${lagStatus.lagHours}h behind booked_calls ` +
      `(booked_calls=${lagStatus.maxBookedCallsTs}, attribution=${lagStatus.maxAttributionTs})`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text:
            ':warning: *Booked-call attribution lag detected*\n' +
            `• Lag: *${lagStatus.lagHours}h* (threshold ${ATTRIBUTION_LAG_THRESHOLD_HOURS}h)\n` +
            `• Latest booked_calls: \`${lagStatus.maxBookedCallsTs || 'n/a'}\`\n` +
            `• Latest booked_call_attribution: \`${lagStatus.maxAttributionTs || 'n/a'}\``,
        },
      },
    ],
  });
  lastAttributionAlertAt = Date.now();
};

const maybeRefreshKpiFacts = async (app: AppLike, date: string, hour: number, minute: number): Promise<void> => {
  if (hour !== KPI_REFRESH_HOUR_CT || minute !== KPI_REFRESH_MINUTE_CT) return;
  if (lastKpiRefreshDate === date) return;

  const now = new Date();
  const from = new Date(now.getTime() - KPI_REFRESH_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  await refreshKpiFacts({ from, to: now, timeZone: BUSINESS_TIMEZONE }, app.logger);
  lastKpiRefreshDate = date;
  app.logger.info('[cron] KPI facts refresh complete', {
    from: from.toISOString(),
    to: now.toISOString(),
  });
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
  const lrnTargetHour = Math.max(
    0,
    Math.min(23, parseIntOr(process.env.ALOWARE_LRN_REFRESH_HOUR_CT, LRN_REFRESH_DEFAULT_HOUR_CT)),
  );
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

export const startLrnRefreshCron = (appRaw: App): void => {
  const app = appRaw as unknown as AppLike;
  if (!isLrnRefreshEnabled()) {
    app.logger.info('[cron] LRN refresh cron disabled (ALOWARE_LRN_REFRESH_CRON_ENABLED=false)');
    return;
  }

  const targetHour = Math.max(
    0,
    Math.min(23, parseIntOr(process.env.ALOWARE_LRN_REFRESH_HOUR_CT, LRN_REFRESH_DEFAULT_HOUR_CT)),
  );
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
