import type { Logger } from '@slack/bolt';
import type { Block, KnownBlock } from '@slack/types';
import type { WebClient } from '@slack/web-api';
import { buildAlowareAnalyticsReportBundle, buildDailySnapshotBlocks } from './aloware-analytics.js';
import {
  buildDailyReportSummary,
  extractDailySnapshotReportDate,
  isDailySnapshotReport,
} from './daily-report-summary.js';
import { logDailyRun } from './daily-run-logger.js';

const SLACK_TEXT_CHUNK_LIMIT = 3500;
export const DASHBOARD_URL = 'https://ptbizsms.com/v2/runs';
export const DASHBOARD_PASSWORD = process.env.DASHBOARD_PASSWORD?.trim() || 'bigbizin26';

// ─── Text Splitting ───────────────────────────────────────────────────────────

export const splitReportText = (text: string, maxLen = SLACK_TEXT_CHUNK_LIMIT): string[] => {
  const normalized = text.replaceAll('\r', '').trim();
  if (normalized.length <= maxLen) return [normalized];

  const chunks: string[] = [];
  let current = '';
  const paragraphs = normalized.split('\n\n');

  for (const paragraph of paragraphs) {
    const candidate = current.length > 0 ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= maxLen) {
      current = candidate;
      continue;
    }
    if (current.trim()) chunks.push(current.trimEnd());
    if (paragraph.length <= maxLen) {
      current = paragraph;
      continue;
    }
    let remaining = paragraph;
    while (remaining.length > maxLen) {
      const window = remaining.slice(0, maxLen);
      const splitAt = Math.max(window.lastIndexOf('\n'), window.lastIndexOf(' '));
      const cut = splitAt > Math.floor(maxLen * 0.6) ? splitAt : maxLen;
      chunks.push(remaining.slice(0, cut).trimEnd());
      remaining = remaining.slice(cut).trimStart();
    }
    current = remaining;
  }
  if (current.trim()) chunks.push(current.trimEnd());
  return chunks.length > 0 ? chunks : [normalized];
};

// ─── Block Kit Builders ───────────────────────────────────────────────────────

/**
 * Builds the interactive action row appended to every report card.
 * `messageTs` is used by the Refresh button so it can update the message in-place.
 */
export const buildReportActionBlocks = (
  channelId: string,
  messageTs?: string,
  prompt = 'daily report',
): (KnownBlock | Block)[] => {
  return [
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '📋 Full Report', emoji: true },
          action_id: 'sms_report_view_full',
          value: JSON.stringify({ channelId, prompt }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '📅 Yesterday', emoji: true },
          action_id: 'sms_report_view_yesterday',
          value: JSON.stringify({ channelId }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '📊 Scoreboard', emoji: true },
          action_id: 'sms_scoreboard_view',
          value: JSON.stringify({ channelId }),
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '🔄 Refresh', emoji: true },
          action_id: 'sms_report_refresh',
          value: JSON.stringify({ channelId, messageTs: messageTs ?? null, prompt }),
          style: 'primary',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '📈 Dashboard', emoji: true },
          action_id: 'sms_report_open_dashboard',
          url: DASHBOARD_URL,
        },
      ],
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `🔐 Dashboard password: \`${DASHBOARD_PASSWORD}\` · <${DASHBOARD_URL}|Open Dashboard>`,
        },
      ],
    },
  ];
};

// ─── Core Report Generator ────────────────────────────────────────────────────

export type GenerateReportResult = {
  ts: string | undefined;
  reportText: string;
};

/**
 * Generates a daily SMS report and posts it to Slack as a rich Block Kit card.
 * The full report text is posted in a thread reply.
 *
 * If `updateTs` is provided, the existing message at that timestamp is updated
 * in-place (used by the Refresh button).
 */
export const generateAndPostReport = async ({
  client,
  logger,
  channelId,
  channelName,
  prompt = 'daily report',
  threadTs,
  reportType = 'daily',
  updateTs,
}: {
  client: WebClient;
  logger: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>;
  channelId: string;
  channelName?: string;
  prompt?: string;
  threadTs?: string;
  reportType?: 'daily' | 'manual' | 'test';
  updateTs?: string;
}): Promise<GenerateReportResult> => {
  const startMs = Date.now();

  const reportBundle = await buildAlowareAnalyticsReportBundle({
    channelId,
    client,
    logger,
    prompt,
  });

  // Build the summary Block Kit blocks
  const summaryBlocks: (KnownBlock | Block)[] = reportBundle.summary
    ? buildDailySnapshotBlocks(reportBundle.summary)
    : [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '📊 *SMS Report Generated*\nSee thread for full details.',
          },
        },
      ];

  let postedTs: string | undefined;

  if (updateTs) {
    // ── Refresh: update the existing message in-place ──────────────────────
    const actionBlocks = buildReportActionBlocks(channelId, updateTs, prompt);
    await client.chat.update({
      channel: channelId,
      ts: updateTs,
      text: 'Daily SMS Snapshot (refreshed)',
      blocks: [...summaryBlocks, ...actionBlocks],
    });
    postedTs = updateTs;
  } else {
    // ── New post ───────────────────────────────────────────────────────────
    const postResult = await client.chat.postMessage({
      channel: channelId,
      thread_ts: threadTs,
      text: 'Daily SMS Snapshot — see thread for full report',
      blocks: [...summaryBlocks, ...buildReportActionBlocks(channelId, undefined, prompt)],
    });
    postedTs = typeof postResult.ts === 'string' ? postResult.ts : undefined;

    // Immediately update the message so the Refresh button knows its own ts
    if (postedTs) {
      await client.chat
        .update({
          channel: channelId,
          ts: postedTs,
          text: 'Daily SMS Snapshot — see thread for full report',
          blocks: [...summaryBlocks, ...buildReportActionBlocks(channelId, postedTs, prompt)],
        })
        .catch(() => {
          // Non-fatal — the button just won't be able to refresh in-place
        });
    }

    // ── Post full report text in thread ────────────────────────────────────
    if (reportBundle.reportText && postedTs) {
      const chunks = splitReportText(reportBundle.reportText);
      for (const [index, chunk] of chunks.entries()) {
        await client.chat.postMessage({
          channel: channelId,
          thread_ts: postedTs,
          text: chunks.length > 1 ? `*Part ${index + 1}/${chunks.length}*\n${chunk}` : chunk,
        });
      }
    }
  }

  // ── Log the run ────────────────────────────────────────────────────────────
  const durationMs = Date.now() - startMs;
  const isDailySnapshot = isDailySnapshotReport(reportBundle.reportText);
  const summaryText = isDailySnapshot
    ? buildDailyReportSummary(reportBundle.reportText)
    : reportBundle.reportText.split('\n').slice(0, 5).join('\n');

  try {
    await logDailyRun(
      {
        channelId,
        channelName: channelName ?? 'unknown',
        reportDate: isDailySnapshot
          ? extractDailySnapshotReportDate(reportBundle.reportText) ?? undefined
          : undefined,
        reportType,
        status: 'success',
        summaryText,
        fullReport: reportBundle.reportText,
        durationMs,
      },
      logger,
    );
  } catch (logError) {
    logger.warn('[report-poster] Failed to log run:', logError);
  }

  return { ts: postedTs, reportText: reportBundle.reportText };
};
