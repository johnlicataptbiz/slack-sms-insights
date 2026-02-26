import type { Logger } from '@slack/bolt';
import { Pool } from 'pg';

let pool: Pool | undefined;

export const initDatabase = async (logger?: Pick<Logger, 'info' | 'error'>): Promise<void> => {
  if (pool) {
    return;
  }

  const databaseUrl = process.env.DATABASE_URL;
  logger?.info(
    `Checking DATABASE_URL: ${databaseUrl ? `Present (starts with ${databaseUrl.substring(0, 10)}...)` : 'MISSING'}`,
  );

  if (!databaseUrl) {
    logger?.error('DATABASE_URL not set; database logging disabled');
    return;
  }

  pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
    idleTimeoutMillis: 30000,
    // Railway proxy can be latent; avoid frequent timeouts in local dev.
    connectionTimeoutMillis: Number.parseInt(process.env.PG_CONNECT_TIMEOUT_MS || '20000', 10),
    query_timeout: Number.parseInt(process.env.PG_QUERY_TIMEOUT_MS || '60000', 10),
    statement_timeout: Number.parseInt(process.env.PG_STATEMENT_TIMEOUT_MS || '60000', 10),
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

    // v3: legacy run archival flag.
    await client.query(`
      ALTER TABLE daily_runs
      ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN NOT NULL DEFAULT FALSE;
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

    // HubSpot booked calls posted into Slack (#bookedcalls) + reactions for setter attribution.
    await client.query(`
      CREATE TABLE IF NOT EXISTS booked_calls (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        slack_team_id TEXT NOT NULL,
        slack_channel_id TEXT NOT NULL,
        slack_message_ts TEXT NOT NULL,
        event_ts TIMESTAMPTZ NOT NULL,
        text TEXT,
        raw JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (slack_channel_id, slack_message_ts)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS booked_call_reactions (
        booked_call_id UUID NOT NULL REFERENCES booked_calls(id) ON DELETE CASCADE,
        reaction_name TEXT NOT NULL,
        reaction_count INTEGER NOT NULL DEFAULT 0,
        users JSONB,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (booked_call_id, reaction_name)
      );
    `);

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

    // Link events to projected conversations for exact conversation history retrieval.
    await client.query(`
      ALTER TABLE sms_events
      ADD COLUMN IF NOT EXISTS conversation_id UUID;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'fk_sms_events_conversation'
        ) THEN
          ALTER TABLE sms_events
          ADD CONSTRAINT fk_sms_events_conversation
          FOREIGN KEY (conversation_id)
          REFERENCES conversations(id)
          ON DELETE SET NULL;
        END IF;
      END
      $$;
    `);

    // Backfill missing conversation_id links for previously ingested events.
    await client.query(`
      UPDATE sms_events e
      SET conversation_id = c.id
      FROM conversations c
      WHERE e.conversation_id IS NULL
        AND c.contact_key = CASE
          WHEN e.contact_id IS NOT NULL THEN 'contact:' || e.contact_id
          WHEN e.contact_phone IS NOT NULL THEN 'phone:' || regexp_replace(e.contact_phone, '\\D', '', 'g')
          ELSE NULL
        END;
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

    // Monday integration state (phase 1: additive schema only).
    await client.query(`
      CREATE TABLE IF NOT EXISTS monday_sync_state (
        board_id TEXT PRIMARY KEY,
        cursor TEXT,
        last_sync_at TIMESTAMPTZ,
        status TEXT CHECK (status IN ('idle', 'running', 'success', 'error')),
        error TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Persisted column mapping per board to avoid code edits when monday column IDs drift.
    await client.query(`
      CREATE TABLE IF NOT EXISTS monday_column_mappings (
        board_id TEXT PRIMARY KEY,
        mapping_json JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Normalized monday snapshots used for weekly aggregation + parity checks.
    await client.query(`
      CREATE TABLE IF NOT EXISTS monday_call_snapshots (
        board_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        item_name TEXT,
        updated_at TIMESTAMPTZ NOT NULL,
        call_date DATE,
        setter TEXT,
        stage TEXT,
        disposition TEXT CHECK (disposition IN ('booked', 'no_show', 'cancelled', 'other')),
        is_booked BOOLEAN NOT NULL DEFAULT FALSE,
        contact_key TEXT,
        raw JSONB,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (board_id, item_id)
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS monday_weekly_reports (
        week_start DATE PRIMARY KEY,
        source_board_id TEXT,
        summary_json JSONB NOT NULL,
        monday_item_id TEXT,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS monday_booked_call_pushes (
        board_id TEXT NOT NULL,
        slack_channel_id TEXT NOT NULL,
        slack_message_ts TEXT NOT NULL,
        setter_bucket TEXT NOT NULL,
        monday_item_id TEXT,
        status TEXT NOT NULL CHECK (status IN ('pending', 'synced', 'error', 'skipped')),
        error TEXT,
        payload_json JSONB,
        pushed_at TIMESTAMPTZ,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (board_id, slack_channel_id, slack_message_ts)
      );
    `);

    // Contact profile cache for inbox card rendering and qualification context.
    await client.query(`
      CREATE TABLE IF NOT EXISTS inbox_contact_profiles (
        contact_key TEXT PRIMARY KEY,
        conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
        contact_id TEXT,
        aloware_contact_id TEXT,
        name TEXT,
        phone TEXT,
        email TEXT,
        timezone TEXT,
        niche TEXT,
        revenue_mix_category TEXT NOT NULL DEFAULT 'unknown' CHECK (revenue_mix_category IN ('mostly_cash', 'mostly_insurance', 'balanced', 'unknown')),
        employment_status TEXT NOT NULL DEFAULT 'unknown' CHECK (employment_status IN ('full_time', 'part_time', 'unknown')),
        coaching_interest TEXT NOT NULL DEFAULT 'unknown' CHECK (coaching_interest IN ('high', 'medium', 'low', 'unknown')),
        dnc BOOLEAN NOT NULL DEFAULT FALSE,
        raw JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Per-conversation qualification + escalation state machine.
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversation_state (
        conversation_id UUID PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
        qualification_full_or_part_time TEXT NOT NULL DEFAULT 'unknown' CHECK (qualification_full_or_part_time IN ('full_time', 'part_time', 'unknown')),
        qualification_niche TEXT,
        qualification_revenue_mix TEXT NOT NULL DEFAULT 'unknown' CHECK (qualification_revenue_mix IN ('mostly_cash', 'mostly_insurance', 'balanced', 'unknown')),
        qualification_coaching_interest TEXT NOT NULL DEFAULT 'unknown' CHECK (qualification_coaching_interest IN ('high', 'medium', 'low', 'unknown')),
        qualification_progress_step INTEGER NOT NULL DEFAULT 0,
        escalation_level INTEGER NOT NULL DEFAULT 1 CHECK (escalation_level BETWEEN 1 AND 4),
        escalation_reason TEXT,
        escalation_overridden BOOLEAN NOT NULL DEFAULT FALSE,
        last_podcast_sent_at TIMESTAMPTZ,
        next_followup_due_at TIMESTAMPTZ,
        cadence_status TEXT NOT NULL DEFAULT 'idle' CHECK (cadence_status IN ('idle', 'podcast_sent', 'call_offered', 'nurture_pool')),
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Outbound send audit trail with policy decisions and provider payloads.
    await client.query(`
      CREATE TABLE IF NOT EXISTS send_attempts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        message_body TEXT NOT NULL,
        sender_identity TEXT,
        line_id TEXT,
        from_number TEXT,
        allowlist_decision BOOLEAN NOT NULL DEFAULT FALSE,
        dnc_decision BOOLEAN NOT NULL DEFAULT FALSE,
        idempotency_key TEXT,
        status TEXT NOT NULL CHECK (status IN ('blocked', 'queued', 'sent', 'failed')),
        retry_count INTEGER NOT NULL DEFAULT 0,
        request_payload JSONB,
        response_payload JSONB,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_send_attempts_conversation_idempotency
      ON send_attempts (conversation_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL;
    `);

    // Per-user outbound line defaults for deterministic sending across multiple Aloware lines.
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_send_preferences (
        user_id TEXT PRIMARY KEY,
        default_line_id INTEGER,
        default_from_number TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Generated draft history + compliance diagnostics.
    await client.query(`
      CREATE TABLE IF NOT EXISTS draft_suggestions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        prompt_snapshot_hash TEXT NOT NULL,
        retrieved_exemplar_ids JSONB,
        generated_text TEXT NOT NULL,
        lint_score DOUBLE PRECISION NOT NULL DEFAULT 0,
        structural_score DOUBLE PRECISION NOT NULL DEFAULT 0,
        lint_issues JSONB,
        accepted BOOLEAN NOT NULL DEFAULT FALSE,
        edited BOOLEAN NOT NULL DEFAULT FALSE,
        send_linked_event_id UUID REFERENCES sms_events(id) ON DELETE SET NULL,
        raw JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Labeled successful outbound examples used for retrieval during drafting.
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversion_examples (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        source_outbound_event_id UUID NOT NULL UNIQUE REFERENCES sms_events(id) ON DELETE CASCADE,
        booked_call_label TEXT,
        closed_won_label TEXT,
        escalation_level INTEGER NOT NULL DEFAULT 1 CHECK (escalation_level BETWEEN 1 AND 4),
        structure_signature TEXT,
        qualifier_snapshot JSONB,
        channel_marker TEXT NOT NULL DEFAULT 'sms',
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      CREATE INDEX IF NOT EXISTS idx_daily_runs_legacy_timestamp
      ON daily_runs (is_legacy, timestamp DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_booked_calls_event_ts
      ON booked_calls (event_ts DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_booked_calls_channel_ts
      ON booked_calls (slack_channel_id, slack_message_ts);
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
      CREATE INDEX IF NOT EXISTS idx_sms_events_conversation_event_ts
      ON sms_events (conversation_id, event_ts DESC);
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

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_monday_sync_state_updated_at
      ON monday_sync_state (updated_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_monday_call_snapshots_board_updated
      ON monday_call_snapshots (board_id, updated_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_monday_call_snapshots_call_date
      ON monday_call_snapshots (call_date);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_monday_weekly_reports_week_start
      ON monday_weekly_reports (week_start DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_monday_booked_call_pushes_status_updated
      ON monday_booked_call_pushes (status, updated_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inbox_contact_profiles_contact_key
      ON inbox_contact_profiles (contact_key);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversation_state_conversation_id
      ON conversation_state (conversation_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_send_attempts_conversation_created
      ON send_attempts (conversation_id, created_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_user_send_preferences_updated
      ON user_send_preferences (updated_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_draft_suggestions_conversation_created
      ON draft_suggestions (conversation_id, created_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversion_examples_booked_escalation
      ON conversion_examples (booked_call_label, escalation_level);
    `);

    // Enforce "one open needs_reply per conversation" at the DB level.
    // This removes the update-then-insert race in the work item engine.
    await client.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_open_needs_reply_per_conversation
      ON work_items (conversation_id)
      WHERE type = 'needs_reply' AND resolved_at IS NULL;
    `);

    // ─── Performance indexes for array/JSONB queries ─────────────────────────────

    // GIN index for objection_tags array containment queries (e.g., "find all with 'price' objection")
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversation_state_objection_tags_gin
      ON conversation_state USING GIN(objection_tags);
    `);

    // Index for escalation_level filtering (common query for stage gating)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversation_state_escalation_level
      ON conversation_state (escalation_level);
    `);

    // Index for cadence_status filtering
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversation_state_cadence_status
      ON conversation_state (cadence_status);
    `);

    // Index for coaching_interest filtering (lead qualification queries)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversation_state_coaching_interest
      ON conversation_state (qualification_coaching_interest);
    `);

    // Index for conversation status filtering (open/closed/dnc)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_status
      ON conversations (status);
    `);

    // Index for contact_key lookups (frequently used in conversation resolution)
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_contact_key
      ON conversations (contact_key);
    `);
  } finally {
    client.release();
  }
};
