import type { Logger } from '@slack/bolt';
import { Pool } from 'pg';
import { resolveNodePostgresConnectionString } from './database-url.js';

let pool: Pool | undefined;

export const initDatabase = async (logger?: Pick<Logger, 'info' | 'error'>): Promise<void> => {
  if (pool) {
    return;
  }

  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  const accelerateUrl = (process.env.PRISMA_ACCELERATE_URL || '').trim();
  const resolvedUrl = databaseUrl || accelerateUrl;

  logger?.info(
    `Checking DATABASE_URL: ${databaseUrl ? `Present (starts with ${databaseUrl.substring(0, 10)}...)` : 'MISSING'}`,
  );
  if (!databaseUrl && accelerateUrl) {
    logger?.info('DATABASE_URL missing; falling back to PRISMA_ACCELERATE_URL');
  }

  if (!resolvedUrl) {
    logger?.error('DATABASE_URL or PRISMA_ACCELERATE_URL not set; database logging disabled');
    return;
  }

  const connectionString = resolveNodePostgresConnectionString(resolvedUrl, logger);

  pool = new Pool({
    connectionString,
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

    // Governance registry for monday boards. This drives curated funnel scope and scorecard routing.
    await client.query(`
      CREATE TABLE IF NOT EXISTS monday_board_registry (
        board_id TEXT PRIMARY KEY,
        board_label TEXT NOT NULL,
        board_class TEXT NOT NULL CHECK (board_class IN (
          'lead_funnel',
          'personal_calls',
          'sales_scorecard',
          'marketing_scorecard',
          'retention_scorecard',
          'other',
          'inactive'
        )),
        metric_grain TEXT NOT NULL CHECK (metric_grain IN ('lead_item', 'aggregate_metric')),
        include_in_funnel BOOLEAN NOT NULL DEFAULT FALSE,
        include_in_exec BOOLEAN NOT NULL DEFAULT FALSE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        owner_team TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Name/role dimension used for setter/closer reporting.
    await client.query(`
      CREATE TABLE IF NOT EXISTS actor_directory (
        canonical_name TEXT PRIMARY KEY,
        role TEXT NOT NULL CHECK (role IN ('setter', 'closer', 'other')),
        aliases TEXT[] NOT NULL DEFAULT '{}',
        active BOOLEAN NOT NULL DEFAULT TRUE,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
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

    // Per-column latest values for Monday call items (read-only analytics surface).
    await client.query(`
      CREATE TABLE IF NOT EXISTS monday_call_column_latest (
        board_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        column_id TEXT NOT NULL,
        column_title TEXT,
        column_type TEXT,
        text_value TEXT,
        value_json JSONB,
        item_updated_at TIMESTAMPTZ NOT NULL,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (board_id, item_id, column_id)
      );
    `);

    // Append-only per-column history to preserve state transitions over time.
    await client.query(`
      CREATE TABLE IF NOT EXISTS monday_call_column_history (
        board_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        column_id TEXT NOT NULL,
        column_title TEXT,
        column_type TEXT,
        text_value TEXT,
        value_json JSONB,
        item_updated_at TIMESTAMPTZ NOT NULL,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (board_id, item_id, column_id, item_updated_at)
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

    // Normalized read-only monday lead outcome records (sales lifecycle outcome focus).
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_outcomes (
        board_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        lead_name TEXT,
        contact_key TEXT,
        call_date DATE,
        setter TEXT,
        set_by TEXT,
        source TEXT,
        stage TEXT,
        outcome_label TEXT,
        outcome_reason TEXT,
        outcome_category TEXT NOT NULL DEFAULT 'unknown'
          CHECK (outcome_category IN ('closed_won', 'closed_lost', 'bad_timing', 'bad_fit', 'no_show', 'cancelled', 'booked', 'other', 'unknown')),
        is_booked BOOLEAN NOT NULL DEFAULT FALSE,
        item_updated_at TIMESTAMPTZ NOT NULL,
        raw JSONB,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (board_id, item_id)
      );
    `);

    // Normalized read-only monday lead attribution records (source + setter lineage).
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_attribution (
        board_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        lead_name TEXT,
        contact_key TEXT,
        source TEXT,
        setter TEXT,
        set_by TEXT,
        campaign TEXT,
        sequence TEXT,
        lead_status TEXT,
        first_touch_date DATE,
        call_date DATE,
        closed_date DATE,
        item_updated_at TIMESTAMPTZ NOT NULL,
        raw JSONB,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (board_id, item_id)
      );
    `);

    // Normalized read-only per-item activity projection for setter performance rollups.
    await client.query(`
      CREATE TABLE IF NOT EXISTS setter_activity (
        board_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        activity_date DATE,
        setter TEXT,
        set_by TEXT,
        source TEXT,
        stage TEXT,
        outcome_category TEXT NOT NULL DEFAULT 'unknown'
          CHECK (outcome_category IN ('closed_won', 'closed_lost', 'bad_timing', 'bad_fit', 'no_show', 'cancelled', 'booked', 'other', 'unknown')),
        is_booked BOOLEAN NOT NULL DEFAULT FALSE,
        is_closed_won BOOLEAN NOT NULL DEFAULT FALSE,
        is_closed_lost BOOLEAN NOT NULL DEFAULT FALSE,
        is_bad_timing BOOLEAN NOT NULL DEFAULT FALSE,
        is_bad_fit BOOLEAN NOT NULL DEFAULT FALSE,
        is_no_show BOOLEAN NOT NULL DEFAULT FALSE,
        is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
        item_updated_at TIMESTAMPTZ NOT NULL,
        raw JSONB,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (board_id, item_id)
      );
    `);

    // Aggregate scorecard facts extracted from monday metric boards.
    await client.query(`
      CREATE TABLE IF NOT EXISTS monday_metric_facts (
        board_id TEXT NOT NULL,
        item_id TEXT NOT NULL,
        metric_date DATE,
        metric_owner TEXT,
        metric_name TEXT NOT NULL,
        metric_value_num DOUBLE PRECISION,
        metric_value_text TEXT,
        status_value TEXT,
        item_updated_at TIMESTAMPTZ NOT NULL,
        raw JSONB,
        synced_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (board_id, item_id, metric_name, item_updated_at)
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
        lead_source TEXT,
        sequence_id TEXT,
        disposition_status_id TEXT,
        tags JSONB,
        text_authorized BOOLEAN,
        is_blocked BOOLEAN,
        cnam_city TEXT,
        cnam_state TEXT,
        cnam_country TEXT,
        last_engagement_at TIMESTAMPTZ,
        inbound_sms_count INTEGER,
        outbound_sms_count INTEGER,
        inbound_call_count INTEGER,
        outbound_call_count INTEGER,
        unread_count INTEGER,
        lrn_line_type TEXT,
        lrn_carrier TEXT,
        lrn_city TEXT,
        lrn_state TEXT,
        lrn_country TEXT,
        lrn_last_checked_at TIMESTAMPTZ,
        revenue_mix_category TEXT NOT NULL DEFAULT 'unknown' CHECK (revenue_mix_category IN ('mostly_cash', 'mostly_insurance', 'balanced', 'unknown')),
        employment_status TEXT NOT NULL DEFAULT 'unknown' CHECK (employment_status IN ('full_time', 'part_time', 'unknown')),
        coaching_interest TEXT NOT NULL DEFAULT 'unknown' CHECK (coaching_interest IN ('high', 'medium', 'low', 'unknown')),
        dnc BOOLEAN NOT NULL DEFAULT FALSE,
        raw JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS lead_source TEXT;
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS sequence_id TEXT;
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS disposition_status_id TEXT;
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS tags JSONB;
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS text_authorized BOOLEAN;
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN;
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS cnam_city TEXT;
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS cnam_state TEXT;
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS cnam_country TEXT;
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS last_engagement_at TIMESTAMPTZ;
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS inbound_sms_count INTEGER;
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS outbound_sms_count INTEGER;
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS inbound_call_count INTEGER;
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS outbound_call_count INTEGER;
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS unread_count INTEGER;
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS lrn_line_type TEXT;
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS lrn_carrier TEXT;
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS lrn_city TEXT;
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS lrn_state TEXT;
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS lrn_country TEXT;
    `);
    await client.query(`
      ALTER TABLE inbox_contact_profiles
      ADD COLUMN IF NOT EXISTS lrn_last_checked_at TIMESTAMPTZ;
    `);

    // Per-conversation qualification + escalation state machine.
    await client.query(`
      CREATE TABLE IF NOT EXISTS conversation_state (
        conversation_id UUID PRIMARY KEY REFERENCES conversations(id) ON DELETE CASCADE,
        qualification_full_or_part_time TEXT NOT NULL DEFAULT 'unknown' CHECK (qualification_full_or_part_time IN ('full_time', 'part_time', 'unknown')),
        qualification_niche TEXT,
        qualification_revenue_mix TEXT NOT NULL DEFAULT 'unknown' CHECK (qualification_revenue_mix IN ('mostly_cash', 'mostly_insurance', 'balanced', 'unknown')),
        qualification_delivery_model TEXT NOT NULL DEFAULT 'unknown' CHECK (qualification_delivery_model IN ('brick_and_mortar', 'mobile', 'online', 'hybrid', 'unknown')),
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
    await client.query(`
      ALTER TABLE conversation_state
      ADD COLUMN IF NOT EXISTS qualification_delivery_model TEXT NOT NULL DEFAULT 'unknown'
      CHECK (qualification_delivery_model IN ('brick_and_mortar', 'mobile', 'online', 'hybrid', 'unknown'));
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

    // Sequence version operating decisions (for Sequences V2 workflow actions).
    await client.query(`
      CREATE TABLE IF NOT EXISTS sequence_version_decisions (
        sequence_label TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('active', 'testing', 'rewrite', 'archived')),
        updated_by TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
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
      CREATE INDEX IF NOT EXISTS idx_monday_board_registry_active_class
      ON monday_board_registry (active, board_class);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_actor_directory_role_active
      ON actor_directory (role, active);
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
      CREATE INDEX IF NOT EXISTS idx_monday_call_column_latest_board_item
      ON monday_call_column_latest (board_id, item_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_monday_call_column_latest_board_column
      ON monday_call_column_latest (board_id, column_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_monday_call_column_history_board_column_updated
      ON monday_call_column_history (board_id, column_id, item_updated_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_monday_call_column_history_board_item_updated
      ON monday_call_column_history (board_id, item_id, item_updated_at DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_monday_weekly_reports_week_start
      ON monday_weekly_reports (week_start DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lead_outcomes_board_call_date
      ON lead_outcomes (board_id, call_date DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lead_outcomes_category_call_date
      ON lead_outcomes (outcome_category, call_date DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lead_outcomes_setter_call_date
      ON lead_outcomes (setter, call_date DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lead_attribution_board_call_date
      ON lead_attribution (board_id, call_date DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_lead_attribution_source
      ON lead_attribution (source);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_setter_activity_setter_activity_date
      ON setter_activity (setter, activity_date DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_setter_activity_category_activity_date
      ON setter_activity (outcome_category, activity_date DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_monday_metric_facts_board_date
      ON monday_metric_facts (board_id, metric_date DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_monday_metric_facts_metric_name_date
      ON monday_metric_facts (metric_name, metric_date DESC);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_monday_metric_facts_owner_date
      ON monday_metric_facts (metric_owner, metric_date DESC);
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
      CREATE INDEX IF NOT EXISTS idx_inbox_contact_profiles_lead_source
      ON inbox_contact_profiles (lead_source);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inbox_contact_profiles_sequence_id
      ON inbox_contact_profiles (sequence_id);
    `);

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_inbox_contact_profiles_last_engagement_at
      ON inbox_contact_profiles (last_engagement_at DESC);
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

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_sequence_version_decisions_status_updated
      ON sequence_version_decisions (status, updated_at DESC);
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

    // --- seed defaults (idempotent) ---

    await client.query(`
      INSERT INTO monday_board_registry (
        board_id, board_label, board_class, metric_grain, include_in_funnel, include_in_exec, active, owner_team, notes
      )
      VALUES
        ('5077164868', 'Acquisition Funnel', 'lead_funnel', 'lead_item', TRUE, TRUE, TRUE, 'sales', 'Primary lead-level funnel board'),
        ('10029059942', 'My Calls', 'personal_calls', 'lead_item', FALSE, TRUE, TRUE, 'sales', 'Personal calls tracking board'),
        ('5753238048', 'Lead Gen Scorecard', 'marketing_scorecard', 'aggregate_metric', FALSE, TRUE, TRUE, 'marketing', 'Aggregate lead-generation metrics'),
        ('5753199181', 'Revenue Scorecard', 'sales_scorecard', 'aggregate_metric', FALSE, TRUE, TRUE, 'sales', 'Aggregate revenue tracking'),
        ('5753276147', 'Acquisition Channel Scorecard', 'marketing_scorecard', 'aggregate_metric', FALSE, TRUE, TRUE, 'marketing', 'Acquisition KPI scorecard'),
        ('5753287414', 'Offers and Deals Scorecard', 'sales_scorecard', 'aggregate_metric', FALSE, TRUE, TRUE, 'sales', 'Offer/deal conversion scorecard'),
        ('5753255244', 'Client Success Scorecard', 'retention_scorecard', 'aggregate_metric', FALSE, TRUE, TRUE, 'client_success', 'Retention/NPS/renewal scorecard'),
        ('7308299531', 'Leads Goal Scorecard', 'marketing_scorecard', 'aggregate_metric', FALSE, TRUE, TRUE, 'marketing', 'Leads goal vs actual'),
        ('18243916010', 'Prospect Mix Scorecard', 'marketing_scorecard', 'aggregate_metric', FALSE, TRUE, TRUE, 'marketing', 'Prospect quality summary metrics'),
        ('7305565062', 'Sets Goal Scorecard', 'sales_scorecard', 'aggregate_metric', FALSE, TRUE, TRUE, 'sales', 'Sets goal vs actual'),
        ('7305459135', 'NBR Goal Scorecard', 'sales_scorecard', 'aggregate_metric', FALSE, TRUE, TRUE, 'sales', 'NBR goal scorecard'),
        ('7304979676', 'Calls Goal Scorecard', 'sales_scorecard', 'aggregate_metric', FALSE, TRUE, TRUE, 'sales', 'Calls goal scorecard'),
        ('25973001', 'Legacy Monday Board', 'other', 'aggregate_metric', FALSE, FALSE, TRUE, 'ops', 'Legacy/unknown board'),
        ('7306094171', 'Churn Scorecard', 'retention_scorecard', 'aggregate_metric', FALSE, TRUE, TRUE, 'client_success', 'Churn tracking scorecard')
      ON CONFLICT (board_id) DO NOTHING;
    `);

    // Backfill registry rows for any boards already synced but not seeded.
    await client.query(`
      INSERT INTO monday_board_registry (
        board_id, board_label, board_class, metric_grain, include_in_funnel, include_in_exec, active, owner_team, notes
      )
      SELECT
        ms.board_id,
        'Board ' || ms.board_id,
        'other',
        'aggregate_metric',
        FALSE,
        FALSE,
        TRUE,
        'ops',
        'Auto-registered from monday_sync_state'
      FROM monday_sync_state ms
      LEFT JOIN monday_board_registry br ON br.board_id = ms.board_id
      WHERE br.board_id IS NULL;
    `);

    await client.query(`
      INSERT INTO actor_directory (canonical_name, role, aliases, active, notes)
      VALUES
        ('John Licata', 'closer', ARRAY['john licata', 'john'], TRUE, 'Default closer'),
        ('Toni Counts', 'closer', ARRAY['toni counts', 'antonia toni counts', 'toni'], TRUE, 'Default closer'),
        ('Brandon Erwin', 'setter', ARRAY['brandon erwin', 'brandon'], TRUE, 'Default setter'),
        ('Jack Licata', 'setter', ARRAY['jack licata', 'jack'], TRUE, 'Default setter')
      ON CONFLICT (canonical_name) DO NOTHING;
    `);

    // --- canonical analytics views for metabase + app ---
    await client.query(`
      CREATE OR REPLACE VIEW analytics_actor_directory_v AS
      SELECT canonical_name, role, aliases, active, notes, created_at, updated_at
      FROM actor_directory
      WHERE active = TRUE;
    `);

    await client.query(`
      CREATE OR REPLACE VIEW analytics_board_registry_v AS
      WITH snapshots AS (
        SELECT board_id, COUNT(*)::int AS snapshot_count, MAX(updated_at) AS latest_item_updated_at
        FROM monday_call_snapshots
        GROUP BY board_id
      ),
      outcomes AS (
        SELECT board_id, COUNT(*)::int AS lead_outcome_count
        FROM lead_outcomes
        GROUP BY board_id
      ),
      attribution AS (
        SELECT board_id, COUNT(*)::int AS lead_attribution_count
        FROM lead_attribution
        GROUP BY board_id
      ),
      activities AS (
        SELECT board_id, COUNT(*)::int AS setter_activity_count
        FROM setter_activity
        GROUP BY board_id
      ),
      metrics AS (
        SELECT board_id, COUNT(*)::int AS metric_fact_count
        FROM monday_metric_facts
        GROUP BY board_id
      ),
      coverage AS (
        SELECT
          board_id,
          COUNT(*) FILTER (WHERE column_title = 'Set By:' AND text_value IS NOT NULL AND BTRIM(text_value) <> '')::int AS set_by_populated,
          COUNT(*) FILTER (
            WHERE column_title = 'Original Source'
            AND text_value IS NOT NULL
            AND BTRIM(text_value) <> ''
            AND LOWER(BTRIM(text_value)) <> 'unknown'
          )::int AS source_populated,
          COUNT(*) FILTER (
            WHERE column_title = 'Campaign'
            AND text_value IS NOT NULL
            AND BTRIM(text_value) <> ''
            AND LOWER(BTRIM(text_value)) <> 'unknown'
          )::int AS campaign_populated,
          COUNT(*) FILTER (WHERE column_title = 'Touchpoints' AND text_value IS NOT NULL AND BTRIM(text_value) <> '')::int AS touchpoints_populated
        FROM monday_call_column_latest
        GROUP BY board_id
      )
      SELECT
        br.board_id,
        br.board_label,
        br.board_class,
        br.metric_grain,
        br.include_in_funnel,
        br.include_in_exec,
        br.active,
        br.owner_team,
        br.notes,
        ms.status AS sync_status,
        ms.last_sync_at,
        ms.updated_at AS sync_updated_at,
        ms.error AS sync_error,
        COALESCE(s.snapshot_count, 0) AS snapshot_count,
        s.latest_item_updated_at,
        COALESCE(o.lead_outcome_count, 0) AS lead_outcome_count,
        COALESCE(a.lead_attribution_count, 0) AS lead_attribution_count,
        COALESCE(sa.setter_activity_count, 0) AS setter_activity_count,
        COALESCE(m.metric_fact_count, 0) AS metric_fact_count,
        COALESCE(c.set_by_populated, 0) AS set_by_populated,
        COALESCE(c.source_populated, 0) AS source_populated,
        COALESCE(c.campaign_populated, 0) AS campaign_populated,
        COALESCE(c.touchpoints_populated, 0) AS touchpoints_populated,
        br.created_at,
        br.updated_at
      FROM monday_board_registry br
      LEFT JOIN monday_sync_state ms ON ms.board_id = br.board_id
      LEFT JOIN snapshots s ON s.board_id = br.board_id
      LEFT JOIN outcomes o ON o.board_id = br.board_id
      LEFT JOIN attribution a ON a.board_id = br.board_id
      LEFT JOIN activities sa ON sa.board_id = br.board_id
      LEFT JOIN metrics m ON m.board_id = br.board_id
      LEFT JOIN coverage c ON c.board_id = br.board_id;
    `);

    await client.query(`
      CREATE OR REPLACE VIEW analytics_lead_funnel_fact_v AS
      SELECT
        lo.board_id,
        lo.item_id,
        lo.lead_name,
        lo.contact_key,
        lo.call_date,
        lo.setter,
        lo.set_by,
        lo.source,
        la.campaign,
        la.sequence,
        lo.stage,
        lo.outcome_label,
        lo.outcome_reason,
        lo.outcome_category,
        lo.is_booked,
        lo.item_updated_at,
        lo.synced_at
      FROM lead_outcomes lo
      LEFT JOIN lead_attribution la
        ON la.board_id = lo.board_id
       AND la.item_id = lo.item_id
      JOIN monday_board_registry br
        ON br.board_id = lo.board_id
      WHERE br.active = TRUE
        AND br.metric_grain = 'lead_item'
        AND br.include_in_funnel = TRUE;
    `);

    await client.query(`
      CREATE OR REPLACE VIEW analytics_monday_scorecard_fact_v AS
      SELECT
        mf.board_id,
        br.board_label,
        br.board_class,
        mf.item_id,
        mf.metric_date,
        mf.metric_owner,
        mf.metric_name,
        mf.metric_value_num,
        mf.metric_value_text,
        mf.status_value,
        mf.item_updated_at,
        mf.synced_at
      FROM monday_metric_facts mf
      JOIN monday_board_registry br ON br.board_id = mf.board_id
      WHERE br.active = TRUE
        AND br.metric_grain = 'aggregate_metric';
    `);

    await client.query(`
      CREATE OR REPLACE VIEW analytics_sequence_outcomes_v AS
      SELECT
        laf.board_id,
        laf.item_id,
        laf.contact_key,
        laf.call_date,
        laf.source,
        laf.campaign,
        laf.sequence,
        laf.setter,
        laf.set_by,
        laf.stage,
        laf.outcome_category,
        laf.is_booked,
        laf.item_updated_at
      FROM analytics_lead_funnel_fact_v laf;
    `);

    await client.query(`
      CREATE OR REPLACE VIEW analytics_data_quality_v AS
      SELECT
        br.board_id,
        br.board_label,
        br.board_class,
        br.metric_grain,
        br.include_in_funnel,
        br.active,
        br.sync_status,
        br.last_sync_at,
        br.snapshot_count,
        br.lead_outcome_count,
        br.lead_attribution_count,
        br.metric_fact_count,
        CASE
          WHEN br.lead_attribution_count > 0 THEN ROUND((br.source_populated::numeric / br.lead_attribution_count::numeric) * 100, 2)
          ELSE 0
        END AS source_coverage_pct,
        CASE
          WHEN br.lead_attribution_count > 0 THEN ROUND((br.campaign_populated::numeric / br.lead_attribution_count::numeric) * 100, 2)
          ELSE 0
        END AS campaign_coverage_pct,
        CASE
          WHEN br.lead_attribution_count > 0 THEN ROUND((br.set_by_populated::numeric / br.lead_attribution_count::numeric) * 100, 2)
          ELSE 0
        END AS set_by_coverage_pct,
        CASE
          WHEN br.lead_attribution_count > 0 THEN ROUND((br.touchpoints_populated::numeric / br.lead_attribution_count::numeric) * 100, 2)
          ELSE 0
        END AS touchpoints_coverage_pct
      FROM analytics_board_registry_v br;
    `);
  } finally {
    client.release();
  }
};
