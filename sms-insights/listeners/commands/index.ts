import type { App } from '@slack/bolt';
import { generateAiResponse } from '../../services/ai-response.js';
import { buildAlowareAnalyticsReport } from '../../services/aloware-analytics.js';
import { isAlowareChannel, isReplyGenerationRequest, REPLY_BLOCKED_MESSAGE } from '../../services/aloware-policy.js';
import { isChannelAllowed } from '../../services/channel-access.js';
import { generateAndPostReport } from '../../services/report-poster.js';
import {
  ALOWARE_CHANNEL_ID,
  ALOWARE_CHANNEL_NAME,
  generateAndPostScoreboard,
} from '../../services/scoreboard-poster.js';
import { createManualMondayBookedCall } from '../../services/monday-personal-writeback.js';

const SLACK_TEXT_CHUNK_LIMIT = 3000;

const splitSlackText = (text: string, maxLen = SLACK_TEXT_CHUNK_LIMIT): string[] => {
  const normalized = text.replaceAll('\r', '').trim();
  if (normalized.length <= maxLen) return [normalized];

  const chunks: string[] = [];
  let remaining = normalized;
  while (remaining.length > maxLen) {
    const window = remaining.slice(0, maxLen);
    const splitAt = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '));
    const cut = splitAt > Math.floor(maxLen * 0.6) ? splitAt : maxLen;
    chunks.push(remaining.slice(0, cut).trimEnd());
    remaining = remaining.slice(cut).trimStart();
  }
  if (remaining.length > 0) chunks.push(remaining);
  return chunks;
};

/**
 * Converts the user's /sms-report argument into a prompt string.
 * - No arg / "today"  → "daily report"
 * - "yesterday"       → "daily report yesterday"
 * - "YYYY-MM-DD"      → "daily report YYYY-MM-DD"
 * - "MM/DD"           → "daily report MM/DD"
 */
const resolveReportPrompt = (text: string): string => {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed || trimmed === 'today') return 'daily report';
  if (trimmed === 'yesterday') return 'daily report yesterday';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return `daily report ${trimmed}`;
  if (/^\d{1,2}\/\d{1,2}(\/\d{2,4})?$/.test(trimmed)) return `daily report ${trimmed}`;
  return `daily report ${trimmed}`;
};

const register = (app: App) => {
  // ── /ask — generic AI / analytics query ──────────────────────────────────
  app.command('/ask', async ({ ack, client, command, logger, respond }) => {
    try {
      await ack();
    } catch (error) {
      logger.error(error);
      return;
    }

    const prompt = command.text?.trim();
    if (!prompt) {
      await respond('Usage: `/ask <question>`');
      return;
    }

    if (!isChannelAllowed(command.channel_id)) {
      await respond('This app is currently enabled only in selected channels.');
      return;
    }

    if (isAlowareChannel(command.channel_id) && isReplyGenerationRequest(prompt)) {
      await respond(REPLY_BLOCKED_MESSAGE);
      return;
    }

    try {
      const answer = isAlowareChannel(command.channel_id)
        ? await buildAlowareAnalyticsReport({
            channelId: command.channel_id,
            client,
            logger,
            prompt,
          })
        : await generateAiResponse(prompt);

      for (const chunk of splitSlackText(answer)) {
        await respond(chunk);
      }
    } catch (error) {
      logger.error(error);
      await respond('I ran into an error while generating analytics. Please verify channel access and try again.');
    }
  });

  // ── /sms-report — rich daily report with Block Kit + interactive buttons ─
  app.command('/sms-report', async ({ ack, client, command, logger }) => {
    try {
      await ack();
    } catch (error) {
      logger.error(error);
      return;
    }

    if (!isChannelAllowed(command.channel_id)) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: '⛔ This command is only available in selected channels.',
      });
      return;
    }

    if (!isAlowareChannel(command.channel_id)) {
      await client.chat.postEphemeral({
        channel: command.channel_id,
        user: command.user_id,
        text: '⛔ `/sms-report` is only available in the SMS Aloware updates channel.',
      });
      return;
    }

    // Post a "generating…" placeholder so the user gets immediate feedback
    let loadingTs: string | undefined;
    try {
      const loadingResult = await client.chat.postMessage({
        channel: command.channel_id,
        text: '⏳ Generating SMS report…',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `⏳ *Generating SMS report…* <@${command.user_id}> requested this. Usually takes 5–15 seconds.`,
            },
          },
        ],
      });
      loadingTs = typeof loadingResult.ts === 'string' ? loadingResult.ts : undefined;
    } catch {
      // Non-fatal — proceed without the loading message
    }

    const prompt = resolveReportPrompt(command.text ?? '');

    try {
      await generateAndPostReport({
        client,
        logger,
        channelId: command.channel_id,
        channelName: command.channel_name,
        prompt,
        reportType: 'manual',
      });

      // Delete the loading placeholder now that the real report is posted
      if (loadingTs) {
        await client.chat.delete({ channel: command.channel_id, ts: loadingTs }).catch(() => {});
      }
    } catch (error) {
      logger.error('[/sms-report] Failed to generate report:', error);

      // Replace the loading message with an error notice
      if (loadingTs) {
        await client.chat
          .update({
            channel: command.channel_id,
            ts: loadingTs,
            text: '❌ Failed to generate report. Please try again.',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '❌ *Failed to generate report.* Please try again or check the logs.',
                },
              },
            ],
          })
          .catch(() => {});
      }
    }
  });
  // ── /sms-scoreboard — weekly scoreboard with setter leaderboard + sequences
  app.command('/sms-scoreboard', async ({ ack, client, command, logger }) => {
    try {
      await ack();
    } catch (error) {
      logger.error(error);
      return;
    }

    const isInAlowareChannel = isAlowareChannel(command.channel_id);

    // Post an ephemeral loading message immediately for feedback
    let loadingTs: string | undefined;
    try {
      const loadingResult = await client.chat.postMessage({
        channel: ALOWARE_CHANNEL_ID,
        text: '⏳ Generating weekly scoreboard…',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `⏳ *Generating weekly scoreboard…* <@${command.user_id}> requested this. Usually takes 5–10 seconds.`,
            },
          },
        ],
      });
      loadingTs = typeof loadingResult.ts === 'string' ? loadingResult.ts : undefined;
    } catch {
      // Non-fatal — proceed without the loading message
    }

    try {
      await generateAndPostScoreboard({
        client,
        logger,
        channelId: ALOWARE_CHANNEL_ID,
      });

      // Delete the loading placeholder
      if (loadingTs) {
        await client.chat.delete({ channel: ALOWARE_CHANNEL_ID, ts: loadingTs }).catch(() => {});
      }

      // If the command was run from a different channel, notify the user
      if (!isInAlowareChannel) {
        await client.chat
          .postEphemeral({
            channel: command.channel_id,
            user: command.user_id,
            text: `✅ Weekly scoreboard posted to <#${ALOWARE_CHANNEL_ID}|${ALOWARE_CHANNEL_NAME}>.`,
          })
          .catch(() => {});
      }
    } catch (error) {
      logger.error('[/sms-scoreboard] Failed to generate scoreboard:', error);

      // Replace the loading message with an error notice
      if (loadingTs) {
        await client.chat
          .update({
            channel: ALOWARE_CHANNEL_ID,
            ts: loadingTs,
            text: '❌ Failed to generate scoreboard. Please try again.',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '❌ *Failed to generate scoreboard.* Please try again or check the logs.',
                },
              },
            ],
          })
          .catch(() => {});
      }
    }
  });

  app.command('/manual-monday', async ({ ack, command, logger, respond }) => {
    try {
      await ack();
    } catch (error) {
      logger.error(error);
      return;
    }

    if (!isChannelAllowed(command.channel_id)) {
      await respond('⛔ This command is only available in selected channels.');
      return;
    }

    const parts = (command.text || "")
      .split("|")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    const contactName = parts[0];
    if (!contactName) {
      await respond(
        'Usage: `/manual-monday <Contact Name> | [Phone] | [Setter jack/brandon] | [Line] | [Notes]`',
      );
      return;
    }

    const setterBucket: 'jack' | 'brandon' =
      parts[2] && parts[2].toLowerCase() === "brandon" ? "brandon" : "jack";

    const payload = {
      contactName,
      contactPhone: parts[1] || undefined,
      setter: setterBucket,
      line: parts[3] || undefined,
      notes: parts[4] || undefined,
    };

    try {
      await createManualMondayBookedCall(payload);
      await respond(`✅ Manual Monday booked call created for *${contactName}*.`);
    } catch (error) {
      logger.error('[/manual-monday] Manual call failed:', error);
      await respond(
        `❌ Manual Monday push failed: ${String((error as Error)?.message || error)}`,
      );
    }
  });
};

export default { register };
