import { getPool } from './db.js';

export const hasRecentPersistentFeedback = async ({
  channelId,
  threadTs,
  dedupeMinutes,
}: {
  channelId: string;
  threadTs: string;
  dedupeMinutes: number;
}): Promise<boolean> => {
  const pool = getPool();
  if (!pool) return false;

  const client = await pool.connect();
  try {
    const res = await client.query(
      'SELECT created_at FROM setter_feedback_dedupe WHERE channel_id = $1 AND thread_ts = $2 LIMIT 1',
      [channelId, threadTs],
    );
    if (!res.rows || res.rows.length === 0) return false;
    const createdAt = new Date(res.rows[0].created_at).getTime();
    const ageMs = Date.now() - createdAt;
    return ageMs < dedupeMinutes * 60_000;
  } finally {
    client.release();
  }
};

export const insertPersistentFeedback = async ({
  channelId,
  threadTs,
  messageTs,
}: {
  channelId: string;
  threadTs: string;
  messageTs?: string;
}): Promise<void> => {
  const pool = getPool();
  if (!pool) return;

  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO setter_feedback_dedupe (channel_id, thread_ts, message_ts) VALUES ($1, $2, $3)
       ON CONFLICT (channel_id, thread_ts) DO UPDATE SET message_ts = EXCLUDED.message_ts, created_at = CURRENT_TIMESTAMP`,
      [channelId, threadTs, messageTs || null],
    );
  } finally {
    client.release();
  }
};
