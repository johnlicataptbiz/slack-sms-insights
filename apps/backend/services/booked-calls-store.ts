import type { Logger } from '@slack/bolt';
import { getPrismaClient } from './prisma.js';

const getPrisma = () => getPrismaClient();

export type BookedCallRow = {
  id: string;
  slack_team_id: string;
  slack_channel_id: string;
  slack_message_ts: string;
  event_ts: Date;
  text: string | null;
  raw: unknown;
  created_at: Date;
};

export type BookedCallReactionRow = {
  booked_call_id: string;
  reaction_name: string;
  reaction_count: number;
  users: unknown;
  updated_at: Date;
};

export const upsertBookedCall = async (
  input: {
    slackTeamId: string;
    slackChannelId: string;
    slackMessageTs: string;
    eventTs: Date;
    text: string | null;
    raw: unknown;
  },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<BookedCallRow | null> => {
  const prisma = getPrisma();

  try {
    const result = await prisma.booked_calls.upsert({
      where: {
        slack_channel_id_slack_message_ts: {
          slack_channel_id: input.slackChannelId,
          slack_message_ts: input.slackMessageTs,
        },
      },
      update: {
        event_ts: input.eventTs,
        text: input.text,
        raw: (input.raw ?? null) as any,
      },
      create: {
        slack_team_id: input.slackTeamId,
        slack_channel_id: input.slackChannelId,
        slack_message_ts: input.slackMessageTs,
        event_ts: input.eventTs,
        text: input.text,
        raw: (input.raw ?? null) as any,
      },
    });

    return result as unknown as BookedCallRow;
  } catch (err) {
    logger?.error?.('Failed to upsert booked call', err);
    return null;
  }
};

export const upsertBookedCallReaction = async (
  input: {
    bookedCallId: string;
    reactionName: string;
    reactionCount: number;
    users: string[] | null;
  },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<BookedCallReactionRow | null> => {
  const prisma = getPrisma();

  try {
    const result = await prisma.booked_call_reactions.upsert({
      where: {
        booked_call_id_reaction_name: {
          booked_call_id: input.bookedCallId,
          reaction_name: input.reactionName,
        },
      },
      update: {
        reaction_count: input.reactionCount,
        users: (input.users ?? null) as any,
        updated_at: new Date(),
      },
      create: {
        booked_call_id: input.bookedCallId,
        reaction_name: input.reactionName,
        reaction_count: input.reactionCount,
        users: (input.users ?? null) as any,
      },
    });

    return result as unknown as BookedCallReactionRow;
  } catch (err) {
    logger?.error?.('Failed to upsert booked call reaction', err);
    return null;
  }
};

export const listBookedCallsInRange = async (
  params: { from: Date; to: Date; channelId?: string; slackMessageTs?: string },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<
  Array<
    BookedCallRow & {
      reactions: Array<Pick<BookedCallReactionRow, 'reaction_name' | 'reaction_count' | 'users'>>;
    }
  >
> => {
  const prisma = getPrisma();

  try {
    const where: any = {
      event_ts: {
        gte: params.from,
        lte: params.to,
      },
    };
    if (params.channelId) where.slack_channel_id = params.channelId;
    if (params.slackMessageTs) where.slack_message_ts = params.slackMessageTs;

    const rows = await prisma.booked_calls.findMany({
      where,
      include: {
        booked_call_reactions: {
          select: {
            reaction_name: true,
            reaction_count: true,
            users: true,
          },
        },
      },
      orderBy: { event_ts: 'asc' },
    });

    return rows.map((r) => ({
      id: r.id,
      slack_team_id: r.slack_team_id,
      slack_channel_id: r.slack_channel_id,
      slack_message_ts: r.slack_message_ts,
      event_ts: r.event_ts,
      text: r.text,
      raw: r.raw,
      created_at: r.created_at,
      reactions: r.booked_call_reactions.map((reac) => ({
        reaction_name: reac.reaction_name,
        reaction_count: reac.reaction_count,
        users: reac.users,
      })),
    })) as unknown as Array<
      BookedCallRow & {
        reactions: Array<Pick<BookedCallReactionRow, 'reaction_name' | 'reaction_count' | 'users'>>;
      }
    >;
  } catch (err) {
    logger?.error?.('Failed to list booked calls in range', err);
    return [];
  }
};
