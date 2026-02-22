import type { Logger } from '@slack/bolt';
import type { Pool } from 'pg';
import { getPool } from './db.js';

export type UserSendPreferencesRow = {
  user_id: string;
  default_line_id: number | null;
  default_from_number: string | null;
  created_at: string;
  updated_at: string;
};

const getDbOrThrow = (): Pool => {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool;
};

export const getUserSendPreferences = async (
  userId: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<UserSendPreferencesRow | null> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query<UserSendPreferencesRow>(
      `
      SELECT *
      FROM user_send_preferences
      WHERE user_id = $1
      LIMIT 1;
      `,
      [userId],
    );

    return result.rows[0] ?? null;
  } catch (err) {
    logger?.error('getUserSendPreferences failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const upsertUserSendPreferences = async (
  params: {
    userId: string;
    defaultLineId?: number | null;
    defaultFromNumber?: string | null;
  },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<UserSendPreferencesRow> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();

  try {
    const result = await client.query<UserSendPreferencesRow>(
      `
      INSERT INTO user_send_preferences (user_id, default_line_id, default_from_number)
      VALUES ($1,$2,$3)
      ON CONFLICT (user_id)
      DO UPDATE SET
        default_line_id = EXCLUDED.default_line_id,
        default_from_number = EXCLUDED.default_from_number,
        updated_at = NOW()
      RETURNING *;
      `,
      [params.userId, params.defaultLineId ?? null, params.defaultFromNumber ?? null],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to upsert user send preferences');
    }

    return row;
  } catch (err) {
    logger?.error('upsertUserSendPreferences failed', err);
    throw err;
  } finally {
    client.release();
  }
};
