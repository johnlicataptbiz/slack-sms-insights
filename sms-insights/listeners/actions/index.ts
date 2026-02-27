import type { App } from '@slack/bolt';
import { isAlowareChannel } from '../../services/aloware-policy.js';
import { buildReportActionBlocks, generateAndPostReport, splitReportText } from '../../services/report-poster.js';
import { buildAlowareAnalyticsReportBundle, buildDailySnapshotBlocks } from '../../services/aloware-analytics.js';
import {
  ALOWARE_CHANNEL_ID,
  buildScoreboardBlocks,
  generateAndPostScoreboard,
} from '../../services/scoreboard-poster.js';
import { getScoreboardData } from '../../services/scoreboard.js';

type ReportActionValue = {
  channelId?: string;
  messageTs?: string | null;
  prompt?: string;
};

const parseActionValue = (raw: string | undefined): ReportActionValue => {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as ReportActionValue;
  } catch {
    return {};
  }
};

const register = (app: App) => {
  // ── HubSpot URL button (legacy — just ack) ────────────────────────────────
  app.action('hubspot_open_contact', async ({ ack }) => {
    await ack();
  });

  // ── Dashboard link button (just ack — Slack opens the URL automatically) ──
  app.action('sms_report_open_dashboard', async ({ ack }) => {
    await ack();
  });

  // ── 📋 Full Report — post the full report text in a thread reply ──────────
  app.action('sms_report_view_full', async ({ ack, action, body, client, logger }) => {
    await ack();

    const value = parseActionValue('value' in action ? (action as { value?: string }).value : undefined);
    const channelId = value.channelId ?? body.channel?.id;
    const prompt = value.prompt ?? 'daily report';
    const threadTs = (body as { message?: { ts?: string } }).message?.ts;

    if (!channelId || !threadTs) {
      logger.warn('[sms_report_view_full] Missing channelId or threadTs');
      return;
    }

    try {
      // Generate the report text
      const reportBundle = await buildAlowareAnalyticsReportBundle({
        channelId,
        client,
        logger,
        prompt,
      });

      const chunks = splitReportText(reportBundle.reportText);
      for (const [index, chunk] of chunks.entries()) {
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: chunks.length > 1 ? `*Full Report — Part ${index + 1}/${chunks.length}*\n${chunk}` : chunk,
        });
      }
    } catch (error) {
      logger.error('[sms_report_view_full] Failed:', error);
      await client.chat
        .postMessage({
          channel: channelId,
          thread_ts: threadTs,
          text: '❌ Failed to fetch full report. Please try again.',
        })
        .catch(() => {});
    }
  });

  // ── 📅 Yesterday — generate yesterday's report and post it ───────────────
  app.action('sms_report_view_yesterday', async ({ ack, action, body, client, logger }) => {
    await ack();

    const value = parseActionValue('value' in action ? (action as { value?: string }).value : undefined);
    const channelId = value.channelId ?? body.channel?.id;

    if (!channelId) {
      logger.warn('[sms_report_view_yesterday] Missing channelId');
      return;
    }

    if (!isAlowareChannel(channelId)) {
      logger.warn('[sms_report_view_yesterday] Not an Aloware channel:', channelId);
      return;
    }

    try {
      await generateAndPostReport({
        client,
        logger,
        channelId,
        prompt: 'daily report yesterday',
        reportType: 'manual',
      });
    } catch (error) {
      logger.error('[sms_report_view_yesterday] Failed:', error);
      await client.chat
        .postMessage({
          channel: channelId,
          text: '❌ Failed to generate yesterday\'s report. Please try again.',
        })
        .catch(() => {});
    }
  });

  // ── 🔄 Refresh — regenerate and update the existing message in-place ──────
  app.action('sms_report_refresh', async ({ ack, action, body, client, logger }) => {
    await ack();

    const value = parseActionValue('value' in action ? (action as { value?: string }).value : undefined);
    const channelId = value.channelId ?? body.channel?.id;
    const prompt = value.prompt ?? 'daily report';
    // Use the stored messageTs from the button value, or fall back to the current message ts
    const messageTs = value.messageTs ?? (body as { message?: { ts?: string } }).message?.ts;

    if (!channelId || !messageTs) {
      logger.warn('[sms_report_refresh] Missing channelId or messageTs');
      return;
    }

    if (!isAlowareChannel(channelId)) {
      logger.warn('[sms_report_refresh] Not an Aloware channel:', channelId);
      return;
    }

    // Show a "refreshing…" state on the message immediately
    try {
      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        text: '🔄 Refreshing report…',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '🔄 *Refreshing report…* This usually takes 5–15 seconds.',
            },
          },
        ],
      });
    } catch {
      // Non-fatal — proceed even if the optimistic update fails
    }

    try {
      await generateAndPostReport({
        client,
        logger,
        channelId,
        prompt,
        reportType: 'manual',
        updateTs: messageTs,
      });
    } catch (error) {
      logger.error('[sms_report_refresh] Failed:', error);

      // Restore a minimal error state on the message
      await client.chat
        .update({
          channel: channelId,
          ts: messageTs,
          text: '❌ Failed to refresh report. Please try again.',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '❌ *Failed to refresh report.* Please try again or use `/sms-report` to generate a new one.',
              },
            },
            ...buildReportActionBlocks(channelId, messageTs, prompt),
          ],
        })
        .catch(() => {});
    }
  });
  // ── 📊 Scoreboard View — post the weekly scoreboard to #alowaresmsupdates ─
  app.action('sms_scoreboard_view', async ({ ack, client, logger }) => {
    await ack();

    try {
      await generateAndPostScoreboard({
        client,
        logger,
        channelId: ALOWARE_CHANNEL_ID,
      });
    } catch (error) {
      logger.error('[sms_scoreboard_view] Failed:', error);
      await client.chat
        .postMessage({
          channel: ALOWARE_CHANNEL_ID,
          text: '❌ Failed to generate scoreboard. Please try `/sms-scoreboard` to try again.',
        })
        .catch(() => {});
    }
  });

  // ── 🔄 Refresh Scoreboard — regenerate and update the scoreboard in-place ─
  app.action('sms_scoreboard_refresh', async ({ ack, action, body, client, logger }) => {
    await ack();

    const value = parseActionValue('value' in action ? (action as { value?: string }).value : undefined);
    const messageTs = value.messageTs ?? (body as { message?: { ts?: string } }).message?.ts;
    const channelId = body.channel?.id ?? ALOWARE_CHANNEL_ID;

    if (!messageTs) {
      logger.warn('[sms_scoreboard_refresh] Missing messageTs — posting fresh scoreboard instead');
      try {
        await generateAndPostScoreboard({ client, logger, channelId: ALOWARE_CHANNEL_ID });
      } catch (error) {
        logger.error('[sms_scoreboard_refresh] Fallback post failed:', error);
      }
      return;
    }

    // Show a "refreshing…" state immediately
    try {
      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        text: '🔄 Refreshing scoreboard…',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '🔄 *Refreshing scoreboard…* This usually takes 5–10 seconds.',
            },
          },
        ],
      });
    } catch {
      // Non-fatal
    }

    try {
      const data = await getScoreboardData({}, logger);
      const updatedBlocks = buildScoreboardBlocks(data, messageTs);
      const fallbackText = `Weekly Scoreboard — ${data.window.weekStart} to ${data.window.weekEnd} · ${data.weekly.bookings.total} bookings`;

      await client.chat.update({
        channel: channelId,
        ts: messageTs,
        text: fallbackText,
        blocks: updatedBlocks,
      });
    } catch (error) {
      logger.error('[sms_scoreboard_refresh] Failed:', error);

      // Restore a minimal error state
      await client.chat
        .update({
          channel: channelId,
          ts: messageTs,
          text: '❌ Failed to refresh scoreboard. Please try again.',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: '❌ *Failed to refresh scoreboard.* Please try again or use `/sms-scoreboard` to generate a new one.',
              },
            },
          ],
        })
        .catch(() => {});
    }
  });
};

export default { register };
