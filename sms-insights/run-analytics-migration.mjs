import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error("ERROR: DATABASE_URL environment variable is not set");
  console.error("Please set DATABASE_URL to your production PostgreSQL connection string");
  process.exit(1);
}

const migrationSQL = `
-- Create sequence_registry table if not exists
CREATE TABLE IF NOT EXISTS sequence_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  normalized_label TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lead_magnet TEXT,
  version_tag TEXT,
  owner_rep TEXT,
  is_manual_bucket BOOLEAN NOT NULL DEFAULT FALSE
);

-- Create fact_sms_daily table if not exists
CREATE TABLE IF NOT EXISTS fact_sms_daily (
  day DATE NOT NULL,
  sequence_id UUID NOT NULL,
  rep_id TEXT NOT NULL,
  messages_sent INTEGER NOT NULL DEFAULT 0,
  unique_contacted INTEGER NOT NULL DEFAULT 0,
  replies_received INTEGER NOT NULL DEFAULT 0,
  opt_outs INTEGER NOT NULL DEFAULT 0,
  reply_rate_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  opt_out_rate_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  booking_signals_sms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, sequence_id, rep_id)
);

-- Create fact_booking_daily table if not exists
CREATE TABLE IF NOT EXISTS fact_booking_daily (
  day DATE NOT NULL,
  sequence_id UUID NOT NULL,
  rep_id TEXT NOT NULL,
  booked_total INTEGER NOT NULL DEFAULT 0,
  booked_jack INTEGER NOT NULL DEFAULT 0,
  booked_brandon INTEGER NOT NULL DEFAULT 0,
  booked_self INTEGER NOT NULL DEFAULT 0,
  booked_after_sms_reply INTEGER NOT NULL DEFAULT 0,
  booking_rate_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  diagnostic_booking_signals INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, sequence_id, rep_id)
);

-- Create fact_lead_quality_daily table if not exists
CREATE TABLE IF NOT EXISTS fact_lead_quality_daily (
  day DATE NOT NULL,
  sequence_id UUID NOT NULL,
  rep_id TEXT NOT NULL,
  leads_count INTEGER NOT NULL DEFAULT 0,
  progress_step_0_count INTEGER NOT NULL DEFAULT 0,
  progress_step_1_count INTEGER NOT NULL DEFAULT 0,
  progress_step_2_count INTEGER NOT NULL DEFAULT 0,
  progress_step_3_count INTEGER NOT NULL DEFAULT 0,
  progress_step_4_count INTEGER NOT NULL DEFAULT 0,
  revenue_mix_mostly_cash INTEGER NOT NULL DEFAULT 0,
  revenue_mix_mostly_ins INTEGER NOT NULL DEFAULT 0,
  revenue_mix_balanced INTEGER NOT NULL DEFAULT 0,
  revenue_mix_unknown INTEGER NOT NULL DEFAULT 0,
  employment_full_time INTEGER NOT NULL DEFAULT 0,
  employment_part_time INTEGER NOT NULL DEFAULT 0,
  employment_unknown INTEGER NOT NULL DEFAULT 0,
  coaching_interest_high INTEGER NOT NULL DEFAULT 0,
  coaching_interest_medium INTEGER NOT NULL DEFAULT 0,
  coaching_interest_low INTEGER NOT NULL DEFAULT 0,
  coaching_interest_unknown INTEGER NOT NULL DEFAULT 0,
  avg_lead_score DOUBLE PRECISION,
  source_bucket_unknown INTEGER NOT NULL DEFAULT 0,
  source_bucket_known INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, sequence_id, rep_id)
);

-- Create fact_monday_health_daily table if not exists
CREATE TABLE IF NOT EXISTS fact_monday_health_daily (
  day DATE NOT NULL,
  board_id TEXT NOT NULL,
  board_class TEXT NOT NULL,
  sync_status TEXT,
  is_stale BOOLEAN NOT NULL DEFAULT FALSE,
  source_coverage_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  campaign_coverage_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  set_by_coverage_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  touchpoints_coverage_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  snapshot_count INTEGER NOT NULL DEFAULT 0,
  lead_attribution_count INTEGER NOT NULL DEFAULT 0,
  metric_fact_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, board_id)
);

-- Create indexes for fact tables
CREATE INDEX IF NOT EXISTS idx_fact_sms_daily_day ON fact_sms_daily(day);
CREATE INDEX IF NOT EXISTS idx_fact_sms_daily_sequence_day ON fact_sms_daily(sequence_id, day);
CREATE INDEX IF NOT EXISTS idx_fact_sms_daily_rep_day ON fact_sms_daily(rep_id, day);

CREATE INDEX IF NOT EXISTS idx_fact_booking_daily_day ON fact_booking_daily(day);
CREATE INDEX IF NOT EXISTS idx_fact_booking_daily_sequence_day ON fact_booking_daily(sequence_id, day);
CREATE INDEX IF NOT EXISTS idx_fact_booking_daily_rep_day ON fact_booking_daily(rep_id, day);

CREATE INDEX IF NOT EXISTS idx_fact_lead_quality_daily_day ON fact_lead_quality_daily(day);
CREATE INDEX IF NOT EXISTS idx_fact_lead_quality_daily_sequence_day ON fact_lead_quality_daily(sequence_id, day);
CREATE INDEX IF NOT EXISTS idx_fact_lead_quality_daily_rep_day ON fact_lead_quality_daily(rep_id, day);

CREATE INDEX IF NOT EXISTS idx_fact_monday_health_daily_day ON fact_monday_health_daily(day);
CREATE INDEX IF NOT EXISTS idx_fact_monday_health_daily_class_day ON fact_monday_health_daily(board_class, day);
CREATE INDEX IF NOT EXISTS idx_fact_monday_health_daily_status_day ON fact_monday_health_daily(sync_status, day);

-- Add missing columns to sms_events table if not exists
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS sequence_id UUID;
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS sequence TEXT;
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS contact_id TEXT;
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS aloware_user TEXT;
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS body TEXT;
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS event_ts TIMESTAMPTZ;
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS direction TEXT;
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS slack_channel_id TEXT;
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS slack_message_ts TEXT;
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
`;

async function runMigration() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    console.log("Connecting to production database...");
    await client.connect();
    console.log("Connected to production database");

    console.log("\nRunning analytics schema baseline migration...\n");
    console.log("=".repeat(60));

    const startTime = Date.now();
    await client.query(migrationSQL);
    const duration = Date.now() - startTime;

    console.log("=".repeat(60));
    console.log(`\n✓ Migration completed successfully in ${duration}ms\n`);
    console.log("Tables created/verified:");
    console.log("  - sequence_registry");
    console.log("  - fact_sms_daily");
    console.log("  - fact_booking_daily");
    console.log("  - fact_lead_quality_daily");
    console.log("  - fact_monday_health_daily");
    console.log("\nIndexes created:");
    console.log("  - idx_fact_sms_daily_* (3 indexes)");
    console.log("  - idx_fact_booking_daily_* (3 indexes)");
    console.log("  - idx_fact_lead_quality_daily_* (3 indexes)");
    console.log("  - idx_fact_monday_health_daily_* (3 indexes)");
    console.log("\nColumns added to sms_events:");
    console.log("  - sequence_id, sequence, contact_id, contact_phone");
    console.log("  - aloware_user, body, event_ts, direction");
    console.log("  - slack_channel_id, slack_message_ts, created_at");
    console.log("\nNext steps:");
    console.log("  1. Run the KPI facts refresh to populate analytics tables");
    console.log("  2. Dashboard will show actual data instead of 'degraded mode' warnings");
    console.log("  3. Verify data in the dashboard");

  } catch (error) {
    console.error("\n✗ Migration failed:");
    console.error(error.message);
    process.exit(1);
  } finally {
    await client.end();
    console.log("\nDatabase connection closed");
  }
}

runMigration();
