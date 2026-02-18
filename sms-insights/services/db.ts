import type { Logger } from '@slack/bolt';
import { Pool } from 'pg';

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
    // NOTE: This project currently uses "initializeSchema" instead of a dedicated
    // migration runner. Keep changes additive and backwards compatible.
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

    // --- v2 operational command center tables (additive) ---

    // Append-only normalized SMS events (ingested from Slack Aloware integration messages).
    await client.query(`
      CREATE TABLE IF NOT EXISTS sms_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slack_team_id TEXT NOT NULL,
        slack_channel_id TEXT NOT NULL,
        slack_message_ts TEXT NOT NULL,
        event_ts TIMESTAMPTZ NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound', 'unknown')),
        contact_id TEXT,
        contact_phone TEXT,
        contact_name TEXT,
        aloware_user TEXT,
        body TEXT,
        line TEXT,
        sequence TEXT,
        raw JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (slack_channel_id, slack_message_ts)
      );
    `);

    // Conversation projection for fast "current state" queries.
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversations (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        contact_key TEXT NOT NULL UNIQUE,
        contact_id TEXT,
        contact_phone TEXT,
        current_rep_id TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed', 'dnc')),
        last_inbound_at TIMESTAMPTZ,
        last_outbound_at TIMESTAMPTZ,
        last_touch_at TIMESTAMPTZ,
        unreplied_inbound_count INTEGER NOT NULL DEFAULT 0,
        next_followup_due_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Action queue.
    await client.query(`
      CREATE TABLE IF NOT EXISTS work_items (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type TEXT NOT NULL,
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        rep_id TEXT,
        severity TEXT NOT NULL DEFAULT 'med' CHECK (severity IN ('low', 'med', 'high')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        due_at TIMESTAMPTZ NOT NULL,
        resolved_at TIMESTAMPTZ,
        resolution TEXT,
        source_event_id UUID REFERENCES sms_events(id) ON DELETE SET NULL
      );
    `);

    // --- indexes ---
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

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_events_event_ts
      ON sms_events (event_ts DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_events_contact_id_event_ts
      ON sms_events (contact_id, event_ts DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sms_events_contact_phone_event_ts
      ON sms_events (contact_phone, event_ts DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_rep_last_touch
      ON conversations (current_rep_id, last_touch_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_next_followup_due
      ON conversations (next_followup_due_at);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_work_items_rep_resolved_due
      ON work_items (rep_id, resolved_at, due_at);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_work_items_type_resolved_due
      ON work_items (type, resolved_at, due_at);
    `);
  } finally {
    client.release();
  }
};
