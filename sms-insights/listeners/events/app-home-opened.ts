import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { getDailyRuns } from '../../services/daily-run-logger.js';
import { DASHBOARD_URL } from '../../services/report-poster.js';

const appHomeOpenedCallback = async ({
  client,
  event,
  logger,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<'app_home_opened'>) => {
  // Only render the Home tab — ignore Messages tab events
  if (event.tab !== 'home') {
    return;
  }

  // ── Fetch recent runs from DB for live "Recent Reports" section ───────────
  const recentRuns = await getDailyRuns(
    { limit: 3, daysBack: 14, legacyMode: 'exclude' },
    logger,
  ).catch(() => []);

  // ── Format recent run rows ────────────────────────────────────────────────
  const runStatusEmoji = (status: string): string =>
    status === 'success' ? '✅' : status === 'error' ? '❌' : '⏳';

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
    await client.views.publish({
      user_id: event.user,
      view: {
        type: 'home',
        blocks: [
          // ── Hero ──────────────────────────────────────────────────────────
          {
            type: 'header',
            text: {
              type: 'plain_text',
              text: '📊  SMS Insights — PT Biz Command Center',
              emoji: true,
            },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `Hey <@${event.user}> 👋  Welcome to *SMS Insights* — your real-time SMS performance hub.\nDaily analytics, setter scoreboard, AI-powered reports, and interactive snapshots, all inside Slack.`,
            },
          },
          { type: 'divider' },

          // ── Quick Actions ─────────────────────────────────────────────────
          {
            type: 'header',
            text: { type: 'plain_text', text: '⚡  Quick Actions', emoji: true },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: '📈 Open Dashboard', emoji: true },
                action_id: 'sms_report_open_dashboard',
                url: DASHBOARD_URL,
                style: 'primary',
              },
              {
                type: 'button',
                text: { type: 'plain_text', text: '📊 Weekly Scoreboard', emoji: true },
                action_id: 'sms_scoreboard_view',
                value: JSON.stringify({ channelId: 'C09ULGH1BEC' }),
              },
            ],
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `🔐 Dashboard access is password-protected  ·  <${DASHBOARD_URL}|Open Dashboard>`,
              },
            ],
          },
          { type: 'divider' },

          // ── Recent Reports (live from DB) ─────────────────────────────────
          {
            type: 'header',
            text: { type: 'plain_text', text: '🕐  Recent Reports', emoji: true },
          },
          ...(recentRunFields.length > 0
            ? [
                {
                  type: 'section' as const,
                  fields: recentRunFields,
                },
                {
                  type: 'context' as const,
                  elements: [
                    {
                      type: 'mrkdwn' as const,
                      text: `<${DASHBOARD_URL}|View all reports →>`,
                    },
                  ],
                },
              ]
            : [
                {
                  type: 'section' as const,
                  text: {
                    type: 'mrkdwn' as const,
                    text: '_No recent reports found. Reports auto-post at 6:00 AM CT or use `/sms-report` to generate one._',
                  },
                },
              ]),
          { type: 'divider' },

          // ── Slash Commands ────────────────────────────────────────────────
          {
            type: 'header',
            text: { type: 'plain_text', text: '🛠  Slash Commands', emoji: true },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: [
                '*Use these commands in `#alowaresmsupdates` (or any channel for scoreboard):*',
                '',
                '`/sms-report`  →  Generate *today\'s* full SMS performance report',
                '`/sms-report yesterday`  →  Generate *yesterday\'s* report',
                '`/sms-report 2025-01-15`  →  Report for a *specific date* (YYYY-MM-DD)',
                '`/sms-report 1/15`  →  Report for a *specific date* (MM/DD)',
                '`/sms-scoreboard`  →  Post the *weekly setter scoreboard* with bookings, sequences & compliance',
                '',
                '*Use this command in any allowed channel:*',
                '',
                '`/ask [question]`  →  Ask any analytics question in plain English',
              ].join('\n'),
            },
          },
          { type: 'divider' },

          // ── Capabilities ──────────────────────────────────────────────────
          {
            type: 'header',
            text: { type: 'plain_text', text: '🤖  What SMS Insights Can Do', emoji: true },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: '📊 *Daily SMS Snapshots*\nLeads, replies, bookings & conversion rates' },
              { type: 'mrkdwn', text: '📅 *Historical Reports*\nAny date, on demand' },
              { type: 'mrkdwn', text: '🔄 *Live Refresh*\nUpdate any report in-place with latest data' },
              { type: 'mrkdwn', text: '💬 *Plain-English Q&A*\nAsk analytics questions naturally' },
              { type: 'mrkdwn', text: '🏆 *Weekly Scoreboard*\nSetter leaderboard, top sequences & compliance' },
              { type: 'mrkdwn', text: '📈 *Trend Analysis*\nWeek-over-week and period comparisons' },
            ],
          },
          { type: 'divider' },

          // ── Schedule ──────────────────────────────────────────────────────
          {
            type: 'header',
            text: { type: 'plain_text', text: '🕕  Automated Schedule', emoji: true },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: [
                'Reports are automatically posted every morning at *6:00 AM CT* in `#alowaresmsupdates`.',
                '',
                'Each automated report includes:',
                '• A rich *Block Kit summary card* with 🟢🟡🔴 performance indicators',
                '• Interactive buttons — *Full Report*, *Yesterday*, *📊 Scoreboard*, *Refresh*, *Dashboard*',
                '• The complete report text posted in a *thread* for deep-dive reading',
              ].join('\n'),
            },
          },
          { type: 'divider' },

          // ── Pro Tips ──────────────────────────────────────────────────────
          {
            type: 'header',
            text: { type: 'plain_text', text: '💡  Pro Tips', emoji: true },
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: [
                '• Hit *🔄 Refresh* on any report card to pull the latest data without generating a new message',
                '• Hit *📅 Yesterday* to instantly compare with the previous day\'s performance',
                '• Hit *📊 Scoreboard* on any report card to see the weekly setter leaderboard',
                '• Mention *@SMS Insights* in any allowed channel to ask a question or request a report',
                '• Use `/ask` for free-form questions like _"how many leads did we get this week?"_',
              ].join('\n'),
            },
          },

          // ── Footer ────────────────────────────────────────────────────────
          { type: 'divider' },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `*SMS Insights*  ·  PT Biz SMS  ·  Reports auto-post at 6:00 AM CT  ·  <${DASHBOARD_URL}|Dashboard>`,
              },
            ],
          },
        ],
      },
    });
  } catch (error) {
    logger.error('[app_home_opened] Failed to publish home view:', error);
  }
};

export { appHomeOpenedCallback };
