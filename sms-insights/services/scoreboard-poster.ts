import type { Logger } from '@slack/bolt';
import type { Block, KnownBlock } from '@slack/types';
import type { WebClient } from '@slack/web-api';
import { DASHBOARD_URL } from './report-poster.js';
import { getScoreboardData, type ScoreboardV2 } from './scoreboard.js';

export const ALOWARE_CHANNEL_ID = 'C09ULGH1BEC';
export const ALOWARE_CHANNEL_NAME = 'alowaresmsupdates';

// ─── Formatting helpers ───────────────────────────────────────────────────────

const fmtNum = (n: number): string => n.toLocaleString();
const fmtPct = (n: number): string => `${n.toFixed(1)}%`;

const replyRateIndicator = (rate: number): string =>
  rate >= 15 ? '🟢' : rate >= 8 ? '🟡' : '🔴';

const optOutIndicator = (rate: number): string =>
  rate <= 3 ? '🟢' : rate <= 6 ? '🟡' : '🔴';

const miniBar = (value: number, max: number, blocks = 5): string => {
  const filled = max > 0 ? Math.min(blocks, Math.round((value / max) * blocks)) : 0;
  return '▓'.repeat(filled) + '░'.repeat(blocks - filled);
};

// ─── Block Kit builder ────────────────────────────────────────────────────────

export const buildScoreboardBlocks = (
  data: ScoreboardV2,
  messageTs?: string,
): (KnownBlock | Block)[] => {
  const { weekly, monthly, sequences, compliance, timing, window: win } = data;

  // ── Setter leaderboard ────────────────────────────────────────────────────
  const setterEntries = [
    { name: 'Jack', count: weekly.bookings.jack },
    { name: 'Brandon', count: weekly.bookings.brandon },
    { name: 'Self-Booked', count: weekly.bookings.selfBooked },
  ].sort((a, b) => b.count - a.count);

  const medals = ['🥇', '🥈', '🥉'];
  const setterLines = setterEntries
    .filter((e) => e.count > 0)
    .map((e, i) => `${medals[i] ?? '•'} *${e.name}:* ${e.count} booking${e.count === 1 ? '' : 's'}`);

  if (setterLines.length === 0) setterLines.push('_No bookings recorded this week_');

  // ── Top sequences (by bookings, limit 5) ─────────────────────────────────
  const topSeqs = [...sequences]
    .filter((s) => s.canonicalBookedCalls > 0 || s.uniqueContacted >= 5)
    .sort((a, b) => b.canonicalBookedCalls - a.canonicalBookedCalls || b.replyRatePct - a.replyRatePct)
    .slice(0, 5);

  const seqLines =
    topSeqs.length > 0
      ? topSeqs.map((s, i) => {
          const label = s.version ? `${s.leadMagnet} _(${s.version})_` : s.leadMagnet;
          return `${i + 1}. *${label}* — ${s.canonicalBookedCalls} booked · ${fmtPct(s.replyRatePct)} reply · ${fmtNum(s.uniqueContacted)} contacts`;
        })
      : ['_No sequence data this week_'];

  // ── Compliance ────────────────────────────────────────────────────────────
  const topOptOut = compliance.topOptOutSequences[0];
  const complianceLine = topOptOut
    ? `${optOutIndicator(compliance.optOutRateWeeklyPct)} ${fmtPct(compliance.optOutRateWeeklyPct)} opt-out rate · Highest risk: *${topOptOut.label}* (${fmtPct(topOptOut.optOutRatePct)})`
    : `${optOutIndicator(compliance.optOutRateWeeklyPct)} ${fmtPct(compliance.optOutRateWeeklyPct)} opt-out rate · No elevated risk sequences 🟢`;

  // ── Timing ────────────────────────────────────────────────────────────────
  const medianReply =
    timing.medianTimeToFirstReplyMinutes !== null
      ? timing.medianTimeToFirstReplyMinutes < 60
        ? `${Math.round(timing.medianTimeToFirstReplyMinutes)} min`
        : `${(timing.medianTimeToFirstReplyMinutes / 60).toFixed(1)} hr`
      : 'n/a';

  // ── Best day of week ──────────────────────────────────────────────────────
  const bestDay = [...timing.replyRateByDayOfWeek]
    .filter((d) => d.outboundCount >= 5)
    .sort((a, b) => b.replyRatePct - a.replyRatePct)[0];

  // ── Reply rate bar ────────────────────────────────────────────────────────
  const replyBar = miniBar(weekly.replies.overall.ratePct, 25);

  // ── Sequence vs manual split ──────────────────────────────────────────────
  const seqBookings = weekly.bookings.sequenceInitiated;
  const manualBookings = weekly.bookings.manualInitiated;
  const bookingAttribution =
    weekly.bookings.total > 0
      ? `${seqBookings} sequence-initiated · ${manualBookings} manual`
      : 'No bookings this week';

  // ── Action button value ───────────────────────────────────────────────────
  const refreshValue = JSON.stringify({ messageTs: messageTs ?? null });

  return [
    // ── Header ────────────────────────────────────────────────────────────────
    {
      type: 'header',
      text: { type: 'plain_text', text: '📊  Weekly Scoreboard', emoji: true },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `📅 Week of *${win.weekStart}* → *${win.weekEnd}*  ·  🌎 ${win.timeZone}`,
        },
      ],
    },
    { type: 'divider' },

    // ── Volume & reply overview ───────────────────────────────────────────────
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*📤 Messages Sent*\n${fmtNum(weekly.volume.total)}\n_${fmtPct(weekly.volume.sequencePct)} sequence · ${fmtPct(weekly.volume.manualPct)} manual_`,
        },
        {
          type: 'mrkdwn',
          text: `*👥 Unique Leads*\n${fmtNum(weekly.uniqueLeads.total)}`,
        },
        {
          type: 'mrkdwn',
          text: `*💬 Reply Rate*\n${replyRateIndicator(weekly.replies.overall.ratePct)} ${fmtPct(weekly.replies.overall.ratePct)} (${fmtNum(weekly.replies.overall.count)})\n\`${replyBar}\``,
        },
        {
          type: 'mrkdwn',
          text: `*📅 Bookings This Week*\n${weekly.bookings.total}\n_${bookingAttribution}_`,
        },
      ],
    },
    { type: 'divider' },

    // ── Setter leaderboard ────────────────────────────────────────────────────
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🏆 Bookings by Setter*\n${setterLines.join('\n')}`,
      },
    },
    { type: 'divider' },

    // ── Top sequences ─────────────────────────────────────────────────────────
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🔥 Top Sequences This Week*\n${seqLines.join('\n')}`,
      },
    },
    { type: 'divider' },

    // ── Timing & compliance ───────────────────────────────────────────────────
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*🕐 Median Reply Time*\n${medianReply}`,
        },
        {
          type: 'mrkdwn',
          text: `*📆 Best Day to Send*\n${bestDay ? `${bestDay.dayOfWeek} (${fmtPct(bestDay.replyRatePct)})` : 'n/a'}`,
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*⚠️ Compliance*\n${complianceLine}`,
      },
    },
    { type: 'divider' },

    // ── Month-to-date context ─────────────────────────────────────────────────
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `📈 *Month to date (${win.monthStart} → ${win.monthEnd}):* ${monthly.bookings.total} bookings · ${fmtNum(monthly.volume.total)} messages · ${fmtPct(monthly.replies.overall.ratePct)} reply rate`,
        },
      ],
    },

    // ── Actions ───────────────────────────────────────────────────────────────
    { type: 'divider' },
    {
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '🔄 Refresh Scoreboard', emoji: true },
          action_id: 'sms_scoreboard_refresh',
          value: refreshValue,
          style: 'primary',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '📈 Open Dashboard', emoji: true },
          action_id: 'sms_report_open_dashboard',
          url: DASHBOARD_URL,
        },
      ],
    },
  ];
};

// ─── Post helper ─────────────────────────────────────────────────────────────

export const generateAndPostScoreboard = async ({
  client,
  logger,
  channelId = ALOWARE_CHANNEL_ID,
  threadTs,
}: {
  client: WebClient;
  logger: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>;
  channelId?: string;
  threadTs?: string;
}): Promise<{ ts?: string }> => {
  logger.info('[scoreboard] Generating scoreboard data…');

  let data: ScoreboardV2;
  try {
    data = await getScoreboardData({}, logger);
  } catch (error) {
    logger.error('[scoreboard] Failed to fetch scoreboard data:', error);
    throw error;
  }

  const blocks = buildScoreboardBlocks(data);
  const fallbackText = `Weekly Scoreboard — ${data.window.weekStart} to ${data.window.weekEnd} · ${data.weekly.bookings.total} bookings · ${fmtPct(data.weekly.replies.overall.ratePct)} reply rate`;

  const postResult = await client.chat.postMessage({
    channel: channelId,
    thread_ts: threadTs,
    text: fallbackText,
    blocks,
  });

  const postedTs = typeof postResult.ts === 'string' ? postResult.ts : undefined;

  // Update the message so the Refresh button embeds its own ts
  if (postedTs) {
    const updatedBlocks = buildScoreboardBlocks(data, postedTs);
    await client.chat
      .update({
        channel: channelId,
        ts: postedTs,
        text: fallbackText,
        blocks: updatedBlocks,
      })
      .catch(() => {
        // Non-fatal — Refresh button just won't be able to update in-place
      });
  }

  logger.info(`[scoreboard] ✅ Scoreboard posted (ts: ${postedTs ?? 'unknown'})`);
  return { ts: postedTs };
};
