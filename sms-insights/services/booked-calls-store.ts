import type { Logger } from '@slack/bolt';
import { getPool } from './db.js';

export type BookedCallRow = {
  id: string;
  slack_team_id: string;
  slack_channel_id: string;
  slack_message_ts: string;
  event_ts: string;
  text: string | null;
  raw: unknown;
  created_at: string;
};

export type BookedCallReactionRow = {
  booked_call_id: string;
  reaction_name: string;
  reaction_count: number;
  users: unknown;
  updated_at: string;
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
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  try {
    const { rows } = await pool.query<BookedCallRow>(
      `
      INSERT INTO booked_calls (
        slack_team_id,
        slack_channel_id,
        slack_message_ts,
        event_ts,
        text,
        raw
      )
      VALUES ($1, $2, $3, $4, $5, $6::jsonb)
      ON CONFLICT (slack_channel_id, slack_message_ts)
      DO UPDATE SET
        event_ts = EXCLUDED.event_ts,
        text = EXCLUDED.text,
        raw = EXCLUDED.raw
      RETURNING *
      `,
      [
        input.slackTeamId,
        input.slackChannelId,
        input.slackMessageTs,
        input.eventTs.toISOString(),
        input.text,
        JSON.stringify(input.raw ?? null),
      ],
    );

    return rows[0] || null;
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
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  try {
    const { rows } = await pool.query<BookedCallReactionRow>(
      `
      INSERT INTO booked_call_reactions (
        booked_call_id,
        reaction_name,
        reaction_count,
        users,
        updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, NOW())
      ON CONFLICT (booked_call_id, reaction_name)
      DO UPDATE SET
        reaction_count = EXCLUDED.reaction_count,
        users = EXCLUDED.users,
        updated_at = NOW()
      RETURNING *
      `,
      [input.bookedCallId, input.reactionName, input.reactionCount, JSON.stringify(input.users ?? null)],
    );

    return rows[0] || null;
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
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  const fromIso = params.from.toISOString();
  const toIso = params.to.toISOString();

  try {
    const { rows } = await pool.query<
      BookedCallRow & {
        reaction_name: string | null;
        reaction_count: number | null;
        users: unknown;
      }
    >(
      `
      SELECT
        bc.*,
        r.reaction_name,
        r.reaction_count,
        r.users
      FROM booked_calls bc
      LEFT JOIN booked_call_reactions r
        ON r.booked_call_id = bc.id
      WHERE bc.event_ts >= $1::timestamptz
        AND bc.event_ts <= $2::timestamptz
        AND ($3::text IS NULL OR bc.slack_channel_id = $3::text)
        AND ($4::text IS NULL OR bc.slack_message_ts = $4::text)
      ORDER BY bc.event_ts ASC
      `,
      [fromIso, toIso, params.channelId ?? null, params.slackMessageTs ?? null],
    );

    const byId = new Map<
      string,
      BookedCallRow & {
        reactions: Array<Pick<BookedCallReactionRow, 'reaction_name' | 'reaction_count' | 'users'>>;
      }
    >();

    for (const r of rows) {
      const existing =
        byId.get(r.id) ||
        ({
          id: r.id,
          slack_team_id: r.slack_team_id,
          slack_channel_id: r.slack_channel_id,
          slack_message_ts: r.slack_message_ts,
          event_ts: r.event_ts,
          text: r.text,
          raw: r.raw,
          created_at: r.created_at,
          reactions: [],
        } satisfies BookedCallRow & {
          reactions: Array<Pick<BookedCallReactionRow, 'reaction_name' | 'reaction_count' | 'users'>>;
        });

      if (r.reaction_name) {
        existing.reactions.push({
          reaction_name: r.reaction_name,
          reaction_count: r.reaction_count ?? 0,
          users: r.users,
        });
      }

      byId.set(r.id, existing);
    }

    return [...byId.values()];
  } catch (err) {
    logger?.error?.('Failed to list booked calls in range', err);
    return [];
  }
};
