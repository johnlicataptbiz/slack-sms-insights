import type { App } from '@slack/bolt';
import type { WebClient } from '@slack/web-api';
import { upsertBookedCall, upsertBookedCallReaction } from '../../services/booked-calls-store.js';
import { syncBookedCallToPersonalBoardFromSlackMessage } from '../../services/monday-personal-writeback.js';

const BOOKED_CALLS_CHANNEL_ID = process.env.BOOKED_CALLS_CHANNEL_ID;

const slackTsToDate = (ts: string | undefined): Date => {
  const raw = ts || `${Date.now() / 1000}`;
  const seconds = Number.parseFloat(raw);
  if (Number.isFinite(seconds)) return new Date(seconds * 1000);
  return new Date();
};

const refreshReactionsForMessage = async (client: WebClient, channelId: string, messageTs: string) => {
  const result = await client.reactions.get({
    channel: channelId,
    timestamp: messageTs,
    full: true,
  });

  if (!result.ok) {
    throw new Error(`Slack API error: ${result.error}`);
  }

  const message = result.message as
    | {
        ts?: string;
        text?: string;
        reactions?: Array<{ name?: string; count?: number; users?: string[] }>;
        team?: string;
      }
    | undefined;

  const slackMessageTs = message?.ts || messageTs;
  const text = message?.text || '';
  const reactions = message?.reactions || [];

  // Ensure booked_call row exists (in case reactions arrive before backfill)
  const bookedCall = await upsertBookedCall({
    slackTeamId: message?.team || 'unknown',
    slackChannelId: channelId,
    slackMessageTs,
    eventTs: slackTsToDate(slackMessageTs),
    text,
    raw: message ?? { ts: slackMessageTs, text },
  });

  if (!bookedCall) return;

  for (const r of reactions) {
    const name = (r.name || '').trim();
    if (!name) continue;
    await upsertBookedCallReaction({
      bookedCallId: bookedCall.id,
      reactionName: name,
      reactionCount: r.count || 0,
      users: r.users || null,
    });
  }
};

type ReactionEvent = {
  item?: { channel?: string; ts?: string };
};

type ReactionHandlerArgs = {
  client: WebClient;
  event: ReactionEvent;
  logger: { debug?: (...args: unknown[]) => void; error?: (...args: unknown[]) => void };
};

export const registerReactionListeners = (app: App) => {
  // reaction_added / reaction_removed payloads include item.channel + item.ts
  const handler = async ({ client, event, logger }: ReactionHandlerArgs) => {
    try {
      const channelId = event?.item?.channel as string | undefined;
      const messageTs = event?.item?.ts as string | undefined;
      if (!channelId || !messageTs) return;

      // Only track booked calls channel (avoid noise)
      if (BOOKED_CALLS_CHANNEL_ID && channelId !== BOOKED_CALLS_CHANNEL_ID) return;

      // If we don't have the booked_call row yet, refresh will create it.
      // If we do have it, refresh will update reaction counts/users.
      await refreshReactionsForMessage(client, channelId, messageTs);

      try {
        const result = await syncBookedCallToPersonalBoardFromSlackMessage({ channelId, messageTs });
        logger?.debug?.('personal monday booked-call sync from reaction', { channelId, messageTs, result });
      } catch (syncError) {
        logger?.error?.('Failed personal monday sync from reaction', syncError);
      }

      logger?.debug?.('booked call reactions refreshed', { channelId, messageTs });
    } catch (err) {
      logger?.error?.('Failed to refresh reactions', err);
    }
  };

  app.event('reaction_added', handler);
  app.event('reaction_removed', handler);
};
