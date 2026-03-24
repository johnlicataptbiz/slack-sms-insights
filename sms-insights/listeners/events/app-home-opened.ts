import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { getDailyRuns } from '../../services/daily-run-logger.js';
import { DASHBOARD_URL } from '../../services/report-poster.js';
import { DashboardCard } from '../../src/ui/components/DashboardCard.js';
import { ProgressiveDisclosure } from '../../src/ui/layouts/ProgressiveDisclosure.js';
import { SkeletonLoader } from '../../src/ui/components/SkeletonLoader.js';
import { PersonalizedDashboard } from '../../src/ui/components/PersonalizedDashboard.js';
import { FloatingActionsBar } from '../../src/ui/components/FloatingActionsBar.js';
import { ActivityFeed } from '../../src/ui/components/ActivityFeed.js';
import { UIStateManager } from '../../src/services/ui-state-manager.js';
import { uiCache } from '../../src/services/ui-cache.js';
import { prisma } from '../../src/lib/prisma.js';

const appHomeOpenedCallback = async ({
  client,
  event,
  logger,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<'app_home_opened'>) => {
  // Only render the Home tab — ignore Messages tab events
  if (event.tab !== 'home') {
    return;
  }

  // ── Initialize UI services ─────────────────────────────────────────────
  const uiStateManager = new UIStateManager(prisma);

  // ── Fetch user UI state with caching ───────────────────────────────────
  let userState = uiCache.get(event.user);
  if (!userState) {
    userState = await uiStateManager.getUserState(event.user).catch(() => null);
    if (userState) {
      uiCache.set(event.user, userState);
    }
  }

  const recentRuns = await getDailyRuns({ limit: 3, daysBack: 14, legacyMode: 'exclude' }, logger).catch(() => []);

  // ── Format recent run rows ────────────────────────────────────────────────
  const runStatusEmoji = (status: string): string => (status === 'success' ? '✅' : status === 'error' ? '❌' : '⏳');

  const formatRunDate = (row: { report_date: string | null; timestamp: string }): string => {
    const raw = row.report_date ?? row.timestamp;
    try {
      return new Date(raw).toLocaleDateString('en-US', {
        timeZone: 'America/Chicago',
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return raw;
    }
  };

  const recentRunFields = recentRuns.slice(0, 3).map((run) => {
    const emoji = runStatusEmoji(run.status);
    const dateLabel = formatRunDate(run);
    const typeLabel = run.report_type === 'daily' ? 'Auto' : 'Manual';
    const firstLine = run.summary_text?.split('\n')[1]?.trim() ?? '';
    const preview = firstLine.length > 0 ? `\n_${firstLine}_` : '';
    return {
      type: 'mrkdwn' as const,
      text: `${emoji} *${dateLabel}* _(${typeLabel})_${preview}`,
    };
  });

  try {
    // ── Get user role and create personalized dashboard ─────────────────────
    const userRole = PersonalizedDashboard.getUserRole(event.user);

    // Prepare data for personalized sections
    const dashboardData = {
      recentRuns: recentRuns.map(run => ({
        id: run.id || `run_${Date.now()}`,
        date: formatRunDate(run),
        type: run.report_type === 'daily' ? 'Auto' : 'Manual',
        summary: run.summary_text?.split('\n')[1]?.trim() || 'Report generated',
        status: run.status,
      })),
      todayCalls: 0, // Would be fetched from database
      conversionRate: 0, // Would be calculated from data
      conversionTrend: { direction: 'up' as const, value: 5 },
      activeSetters: 0, // Would be fetched from database
      teamCallsToday: 0, // Would be fetched from database
      teamCallsTrend: { direction: 'up' as const, value: 12 },
      apiStatus: 'Operational', // Would check actual API status
      dbStatus: 'Healthy', // Would check actual DB status
    };

    // Create personalized sections
    const sections = PersonalizedDashboard.createPersonalizedSections(userState, userRole, dashboardData);

    // Add activity feed section
    sections.push({
      id: 'activity-feed',
      title: 'Live Activity Feed',
      content: ActivityFeed.createFeed(ActivityFeed.createMockActivities(), 3),
      priority: 'low' as const,
    });

    // Build the complete UI with progressive loading
    const userPrefs = userState ? {
      expandedSections: userState.expandedSections,
      theme: userState.theme,
    } : undefined;

    const blocks = [
      // Hero header (always visible)
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: '🚀 SMS Insights — PT Biz Command Center',
          emoji: true,
        },
      },
      { type: 'divider' },

      // Floating actions bar
      FloatingActionsBar.createDefaultBar(),
      { type: 'divider' },

      // Progressive disclosure sections with personalization
      ...ProgressiveDisclosure.createSections(sections, userPrefs),
    ];

    await client.views.publish({
      user_id: event.user,
      view: {
        type: 'home',
        blocks,
      },
    });
  } catch (error) {
    logger.error('[app_home_opened] Failed to publish home view:', error);
  }
};

export { appHomeOpenedCallback };
