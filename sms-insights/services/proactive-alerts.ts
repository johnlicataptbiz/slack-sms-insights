/**
 * Proactive Alerts Service
 * 
 * Intelligent alerting system that monitors metrics and sends proactive
 * notifications when thresholds are breached or anomalies are detected.
 */

import type { Logger } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { getPrismaClient } from './prisma.js';

// Goal configuration
interface GoalConfig {
  target: number;
  unit: string;
  warnThreshold: number; // 0.0 - 1.0
  max?: boolean; // For "don't exceed" metrics like opt-outs
}

interface MetricSnapshot {
  name: string;
  value: number;
  goal?: GoalConfig;
  history?: number[];
}

interface Alert {
  type: 'critical' | 'warning' | 'opportunity' | 'info';
  title: string;
  message: string;
  metric?: string;
  action?: string;
  url?: string;
  buttons?: AlertButton[];
}

interface AlertButton {
  text: string;
  actionId: string;
  value: string;
  style?: 'primary' | 'danger';
}

// Goal definitions
const DAILY_GOALS = {
  bookings: { target: 3, unit: 'bookings', warnThreshold: 0.67 },
  replyRate: { target: 10, unit: '%', warnThreshold: 0.8 },
  optOutRate: { target: 3, unit: '%', max: true, warnThreshold: 0.67 },
};

const CRITICAL_THRESHOLDS = {
  bookingsBelowTargetPct: 0.5, // Critical if < 50% of daily goal
  optOutAboveTargetPct: 1.5, // Critical if > 150% of opt-out max
  replyRateDropPct: 0.5, // Critical if reply rate < 50% of target
};

const OPPORTUNITY_THRESHOLDS = {
  highEngagementLowConversion: { replyRate: 15, bookings: 2 },
  milestoneBookings: 5, // Alert when hitting 5+ bookings in a day
  bestReplyRateIn30Days: 15,
};

/**
 * Calculate progress towards a goal
 */
export const calculateProgress = (
  current: number,
  goal: GoalConfig,
): { progress: number; status: 'on_track' | 'warning' | 'critical'; percentOfTarget: number } => {
  const percentOfTarget = goal.max
    ? Math.max(0, 100 - (current / goal.target) * 100)
    : (current / goal.target) * 100;

  const progress = Math.min(percentOfTarget, 100);

  let status: 'on_track' | 'warning' | 'critical';
  if (goal.max) {
    if (current <= goal.target) status = 'on_track';
    else if (current <= goal.target * goal.warnThreshold) status = 'warning';
    else status = 'critical';
  } else {
    if (percentOfTarget >= 100) status = 'on_track';
    else if (percentOfTarget >= goal.warnThreshold * 100) status = 'warning';
    else status = 'critical';
  }

  return { progress, status, percentOfTarget };
};

/**
 * Calculate trend from historical data
 */
export const calculateTrend = (
  current: number,
  history: number[],
  window = 7,
): { direction: 'up' | 'down' | 'stable'; changePercent: number; sparkline: string } => {
  const recent = history.slice(-window);
  if (recent.length === 0) {
    return { direction: 'stable', changePercent: 0, sparkline: '▬▬▬▬' };
  }

  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const direction = current > avg * 1.1 ? 'up' : current < avg * 0.9 ? 'down' : 'stable';
  const changePercent = avg > 0 ? ((current - avg) / avg) * 100 : 0;

  // Build sparkline
  const minVal = Math.min(...recent, current);
  const maxVal = Math.max(...recent, current);
  const range = maxVal - minVal || 1;

  const toBlock = (val: number): string => {
    const normalized = (val - minVal) / range;
    if (normalized < 0.25) return '▁';
    if (normalized < 0.5) return '▂';
    if (normalized < 0.75) return '▃';
    return '▄';
  };

  const sparkline = recent.map(toBlock).join('') + toBlock(current);

  return { direction, changePercent, sparkline };
};

/**
 * Build emoji-based status indicator
 */
export const getStatusEmoji = (status: 'on_track' | 'warning' | 'critical'): string => {
  switch (status) {
    case 'on_track':
      return '🟢';
    case 'warning':
      return '🟡';
    case 'critical':
      return '🔴';
  }
};

/**
 * Build progress bar string
 */
export const buildProgressBar = (current: number, target: number, width = 10): string => {
  const ratio = Math.min(current / target, 1);
  const filled = Math.round(ratio * width);
  return '▓'.repeat(filled) + '░'.repeat(width - filled);
};

/**
 * Detect anomalies from current metrics
 */
export const detectAnomalies = (metrics: {
  bookings: number;
  replyRate: number;
  optOutRate: number;
  goals: typeof DAILY_GOALS;
  history?: {
    bookings: number[];
    replyRate: number[];
    optOutRate: number[];
  };
}): Alert[] => {
  const alerts: Alert[] = [];

  // Critical: Bookings below threshold
  if (metrics.bookings < metrics.goals.bookings.target * CRITICAL_THRESHOLDS.bookingsBelowTargetPct) {
    alerts.push({
      type: 'critical',
      title: 'Booking Alert',
      message: `Only ${metrics.bookings} bookings today — ${Math.round((metrics.bookings / metrics.goals.bookings.target) * 100)}% of daily goal`,
      metric: 'bookings',
      action: 'Review active sequences and outreach volume',
    });
  }

  // Critical: Opt-out rate elevated
  if (metrics.optOutRate > metrics.goals.optOutRate.target * CRITICAL_THRESHOLDS.optOutAboveTargetPct) {
    alerts.push({
      type: 'warning',
      title: 'Opt-Out Rate Elevated',
      message: `Opt-out rate at ${metrics.optOutRate}% (max ${metrics.goals.optOutRate.target}%)`,
      metric: 'optOutRate',
      action: 'Review message copy and targeting',
    });
  }

  // Opportunity: High engagement, low conversion
  if (
    metrics.replyRate >= OPPORTUNITY_THRESHOLDS.highEngagementLowConversion.replyRate &&
    metrics.bookings < OPPORTUNITY_THRESHOLDS.highEngagementLowConversion.bookings
  ) {
    alerts.push({
      type: 'opportunity',
      title: 'Conversion Opportunity',
      message: `High reply rate (${metrics.replyRate}%) but only ${metrics.bookings} bookings`,
      metric: 'replyRate',
      action: 'Focus on booking conversations',
    });
  }

  // Milestone: Good booking day
  if (metrics.bookings >= OPPORTUNITY_THRESHOLDS.milestoneBookings) {
    alerts.push({
      type: 'info',
      title: 'Milestone',
      message: `${metrics.bookings} bookings today — great work! 🎉`,
    });
  }

  // Trend alerts if history available
  if (metrics.history?.bookings) {
    const trend = calculateTrend(metrics.bookings, metrics.history.bookings);
    if (trend.direction === 'up' && trend.changePercent > 20) {
      alerts.push({
        type: 'info',
        title: 'Upward Trend',
        message: `Bookings trending up (+${Math.round(trend.changePercent)}% vs ${trend.sparkline.length}-day avg)`,
        metric: 'bookings',
      });
    }
  }

  return alerts;
};

/**
 * Build alert blocks for Slack message
 */
export const buildAlertBlocks = (
  alerts: Alert[],
  showActions = true,
): Array<{ type: string; [key: string]: unknown }> => {
  if (alerts.length === 0) return [];

  const blocks: Array<{ type: string; [key: string]: unknown }> = [
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*⚠️ Alerts (${alerts.length})*`,
      },
    },
  ];

  for (const alert of alerts) {
    const emoji = alert.type === 'critical' ? '🔴' : alert.type === 'warning' ? '🟡' : alert.type === 'opportunity' ? '💡' : 'ℹ️';

    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `${emoji} *${alert.title}*\n${alert.message}${alert.action ? `\n_→ ${alert.action}_` : ''}`,
      },
    });
  }

  return blocks;
};

/**
 * Post proactive alert to Slack channel
 */
export const postProactiveAlert = async (
  client: WebClient,
  channelId: string,
  alerts: Alert[],
  logger?: Logger,
): Promise<boolean> => {
  if (alerts.length === 0) return true;

  try {
    const blocks = buildAlertBlocks(alerts);

    // Add action buttons if this is a significant alert
    const hasCriticalOrOpportunity = alerts.some((a) => a.type === 'critical' || a.type === 'opportunity');
    if (hasCriticalOrOpportunity) {
      blocks.push({
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '📊 View Dashboard', emoji: true },
            action_id: 'alert_view_dashboard',
            url: 'https://ptbizsms.com/v2/runs',
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '📈 Drill Down', emoji: true },
            action_id: 'alert_drill_down',
            value: JSON.stringify({ type: 'alerts' }),
            style: 'primary',
          },
        ],
      } as { type: string; elements: unknown[] });
    }

    await client.chat.postMessage({
      channel: channelId,
      text: `⚠️ ${alerts.length} alert(s) from PT Biz SMS`,
      blocks,
    });

    logger?.info(`[proactive-alerts] Posted ${alerts.length} alerts to ${channelId}`);
    return true;
  } catch (error) {
    logger?.error('[proactive-alerts] Failed to post alert:', error);
    return false;
  }
};

/**
 * Check if we should send an alert (cooldown management)
 */
const alertCooldowns = new Map<string, number>();
const DEFAULT_COOLDOWN_MS = 60 * 60 * 1000; // 1 hour

export const shouldSendAlert = (alertKey: string, cooldownMs = DEFAULT_COOLDOWN_MS): boolean => {
  const lastSent = alertCooldowns.get(alertKey) || 0;
  const now = Date.now();

  if (now - lastSent < cooldownMs) {
    return false;
  }

  alertCooldowns.set(alertKey, now);
  return true;
};

/**
 * Get current metric snapshot from database with historical data
 */
export const getCurrentMetricSnapshot = async (
  targetDate?: Date,
  historyDays: number = 30,
): Promise<{
  bookings: number;
  replyRate: number;
  optOutRate: number;
  conversations: number;
  history: {
    bookings: number[];
    replyRate: number[];
    optOutRate: number[];
  };
}> => {
  const prisma = getPrismaClient();
  const date = targetDate || new Date();
  const dateStr = date.toISOString().slice(0, 10);
  const fromDate = new Date(date);
  fromDate.setDate(fromDate.getDate() - historyDays);

  // Get today's metrics from fact tables
  const [todayFacts] = await prisma.$queryRawUnsafe<Array<{
    total_sent: bigint | null;
    total_replied: bigint | null;
    total_opted_out: bigint | null;
  }>>(
    `
    SELECT 
      COALESCE(SUM(fact.total_sent), 0)::bigint as total_sent,
      COALESCE(SUM(fact.total_replied), 0)::bigint as total_replied,
      COALESCE(SUM(fact.total_opted_out), 0)::bigint as total_opted_out
    FROM fact_sms_daily fact
    WHERE fact.day = $1::date
    `,
    [dateStr],
  );

  // Get historical data for trend calculation
  const [historicalFacts] = await prisma.$queryRawUnsafe<Array<{
    daily_bookings: bigint | null;
    daily_sent: bigint | null;
    daily_replied: bigint | null;
    daily_opted_out: bigint | null;
    reply_rate: number | null;
  }>>(
    `
    SELECT 
      COALESCE(SUM(fact.total_sent), 0)::bigint as daily_sent,
      COALESCE(SUM(fact.total_replied), 0)::bigint as daily_replied,
      COALESCE(SUM(fact.total_opted_out), 0)::bigint as daily_opted_out,
      CASE WHEN SUM(fact.total_sent) > 0 
        THEN (SUM(fact.total_replied)::numeric / SUM(fact.total_sent) * 100)
        ELSE 0 
      END as reply_rate
    FROM fact_sms_daily fact
    WHERE fact.day >= $1::date AND fact.day <= $2::date
    ORDER BY fact.day ASC
    `,
    [fromDate.toISOString().slice(0, 10), dateStr],
  );

  // Get booking counts from booked_calls
  const [todayBookings] = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
    `
    SELECT COUNT(*)::bigint as count
    FROM booked_calls bc
    WHERE DATE(bc.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago') = $1::date
    `,
    [dateStr],
  );

  const historicalBookings = await prisma.$queryRawUnsafe<Array<{ day: string; count: bigint }>>(
    `
    SELECT 
      DATE(bc.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')::text as day,
      COUNT(*)::bigint as count
    FROM booked_calls bc
    WHERE bc.created_at >= $1::timestamptz
    GROUP BY DATE(bc.created_at AT TIME ZONE 'UTC' AT TIME ZONE 'America/Chicago')
    ORDER BY day ASC
    `,
    [fromDate.toISOString()],
  );

  const totalSent = Number(todayFacts?.total_sent || 0);
  const totalReplied = Number(todayFacts?.total_replied || 0);
  const totalOptedOut = Number(todayFacts?.total_opted_out || 0);

  return {
    bookings: Number(todayBookings?.count || 0),
    replyRate: totalSent > 0 ? (totalReplied / totalSent) * 100 : 0,
    optOutRate: totalSent > 0 ? (totalOptedOut / totalSent) * 100 : 0,
    conversations: totalSent,
    history: {
      bookings: historicalBookings.map((r: { count: bigint | number }) => Number(r.count)),
      replyRate: historicalFacts ? [Number(historicalFacts?.reply_rate || 0)] : [],
      optOutRate: [],
    },
  };
};

/**
 * Quick check if today's metrics warrant an alert
 */
export const quickAlertCheck = async (): Promise<{
  shouldAlert: boolean;
  alerts: Alert[];
}> => {
  try {
    const snapshot = await getCurrentMetricSnapshot();

    const alerts = detectAnomalies({
      bookings: snapshot.bookings,
      replyRate: snapshot.replyRate,
      optOutRate: snapshot.optOutRate,
      goals: DAILY_GOALS,
      history: snapshot.history,
    });

    return {
      shouldAlert: alerts.length > 0,
      alerts,
    };
  } catch (error) {
    return {
      shouldAlert: false,
      alerts: [],
    };
  }
};

export type { Alert, AlertButton, GoalConfig, MetricSnapshot };
