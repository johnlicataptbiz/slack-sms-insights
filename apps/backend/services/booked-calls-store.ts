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
    const rows = (await prisma.$queryRawUnsafe(
      `
        INSERT INTO booked_calls (
          slack_team_id,
          slack_channel_id,
          slack_message_ts,
          event_ts,
          text,
          raw
        ) VALUES ($1,$2,$3,$4,$5,$6::jsonb)
        ON CONFLICT (slack_channel_id, slack_message_ts)
        DO UPDATE SET
          event_ts = EXCLUDED.event_ts,
          text = EXCLUDED.text,
          raw = EXCLUDED.raw
        RETURNING
          id,
          slack_team_id,
          slack_channel_id,
          slack_message_ts,
          event_ts,
          text,
          raw,
          created_at
      `,
      input.slackTeamId,
      input.slackChannelId,
      input.slackMessageTs,
      input.eventTs,
      input.text,
      JSON.stringify(input.raw ?? null),
    )) as BookedCallRow[];
    return rows[0] ?? null;
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
    const rows = (await prisma.$queryRawUnsafe(
      `
        INSERT INTO booked_call_reactions (
          booked_call_id,
          reaction_name,
          reaction_count,
          users
        ) VALUES ($1,$2,$3,$4::jsonb)
        ON CONFLICT (booked_call_id, reaction_name)
        DO UPDATE SET
          reaction_count = EXCLUDED.reaction_count,
          users = EXCLUDED.users,
          updated_at = NOW()
        RETURNING
          booked_call_id,
          reaction_name,
          reaction_count,
          users,
          updated_at
      `,
      input.bookedCallId,
      input.reactionName,
      input.reactionCount,
      JSON.stringify(input.users ?? null),
    )) as BookedCallReactionRow[];
    return rows[0] ?? null;
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
    const rows = (await prisma.$queryRawUnsafe(
      `
        SELECT
          bc.id,
          bc.slack_team_id,
          bc.slack_channel_id,
          bc.slack_message_ts,
          bc.event_ts,
          bc.text,
          bc.raw,
          bc.created_at,
          COALESCE(
            json_agg(
              json_build_object(
                'reaction_name', bcr.reaction_name,
                'reaction_count', bcr.reaction_count,
                'users', bcr.users
              )
            ) FILTER (WHERE bcr.booked_call_id IS NOT NULL),
            '[]'::json
          ) AS reactions
        FROM booked_calls bc
        LEFT JOIN booked_call_reactions bcr ON bcr.booked_call_id = bc.id
        WHERE bc.event_ts >= $1
          AND bc.event_ts <= $2
          AND ($3::text IS NULL OR bc.slack_channel_id = $3)
          AND ($4::text IS NULL OR bc.slack_message_ts = $4)
        GROUP BY
          bc.id,
          bc.slack_team_id,
          bc.slack_channel_id,
          bc.slack_message_ts,
          bc.event_ts,
          bc.text,
          bc.raw,
          bc.created_at
        ORDER BY bc.event_ts ASC
      `,
      params.from,
      params.to,
      params.channelId ?? null,
      params.slackMessageTs ?? null,
    )) as Array<
      BookedCallRow & {
        reactions: Array<Pick<BookedCallReactionRow, 'reaction_name' | 'reaction_count' | 'users'>>;
      }
    >;

    return rows.map((r) => ({
      ...r,
      reactions: Array.isArray(r.reactions) ? r.reactions : [],
    }));
  } catch (err) {
    logger?.error?.('Failed to list booked calls in range', err);
    return [];
  }
};
