import { Pool } from 'pg';
import type { Logger } from '@slack/bolt';

let pool: Pool | undefined;

export const initDatabase = async (logger?: Pick<Logger, 'info' | 'error'>): Promise<void> => {
  if (pool) {
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    logger?.error('DATABASE_URL not set; database logging disabled');
    return;
  }

  pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });

  pool.on('error', (err) => {
    logger?.error('Unexpected database pool error:', err);
  });

  try {
    const client = await pool.connect();
    client.release();
    logger?.info('✅ Database connection pool initialized');
  } catch (error) {
    logger?.error('Failed to initialize database connection pool:', error);
    pool = undefined;
  }
};

export const getPool = (): Pool | undefined => {
  return pool;
};

export const closeDatabase = async (): Promise<void> => {
  if (!pool) {
    return;
  }
  await pool.end();
  pool = undefined;
};

export const initializeSchema = async (): Promise<void> => {
  if (!pool) {
    return;
  }

  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS daily_runs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        timestamp TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        report_date DATE,
        channel_id TEXT NOT NULL,
        channel_name TEXT,
        report_type TEXT NOT NULL CHECK (report_type IN ('daily', 'manual', 'test')),
        status TEXT NOT NULL CHECK (status IN ('success', 'error', 'pending')),
        error_message TEXT,
        summary_text TEXT,
        full_report TEXT,
        duration_ms INTEGER,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Persistent cache for setter-feedback dedupe so suppression survives restarts.
    await client.query(`
      CREATE TABLE IF NOT EXISTS setter_feedback_dedupe (
        channel_id TEXT NOT NULL,
        thread_ts TEXT NOT NULL,
        message_ts TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (channel_id, thread_ts)
      );
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_setter_feedback_dedupe_created_at
      ON setter_feedback_dedupe (created_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_runs_channel_timestamp
      ON daily_runs (channel_id, timestamp DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_runs_timestamp
      ON daily_runs (timestamp DESC);
    `);
  } finally {
    client.release();
  }
};
