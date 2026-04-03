import type { Logger } from "@slack/bolt";
import { getPrisma } from "./prisma.js";

let bootstrapAttempted = false;

const statements: string[] = [
  "CREATE EXTENSION IF NOT EXISTS pgcrypto",
  `CREATE TABLE IF NOT EXISTS sequence_registry (
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
  )`,
  `CREATE TABLE IF NOT EXISTS fact_sms_daily (
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
  )`,
  "CREATE INDEX IF NOT EXISTS idx_fact_sms_daily_day ON fact_sms_daily(day)",
  "CREATE INDEX IF NOT EXISTS idx_fact_sms_daily_sequence_day ON fact_sms_daily(sequence_id, day)",
  "CREATE INDEX IF NOT EXISTS idx_fact_sms_daily_rep_day ON fact_sms_daily(rep_id, day)",
  `CREATE TABLE IF NOT EXISTS fact_booking_daily (
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
  )`,
  "CREATE INDEX IF NOT EXISTS idx_fact_booking_daily_day ON fact_booking_daily(day)",
  "CREATE INDEX IF NOT EXISTS idx_fact_booking_daily_sequence_day ON fact_booking_daily(sequence_id, day)",
  "CREATE INDEX IF NOT EXISTS idx_fact_booking_daily_rep_day ON fact_booking_daily(rep_id, day)",
  `CREATE TABLE IF NOT EXISTS fact_lead_quality_daily (
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
  )`,
  "CREATE INDEX IF NOT EXISTS idx_fact_lead_quality_daily_day ON fact_lead_quality_daily(day)",
  "CREATE INDEX IF NOT EXISTS idx_fact_lead_quality_daily_sequence_day ON fact_lead_quality_daily(sequence_id, day)",
  "CREATE INDEX IF NOT EXISTS idx_fact_lead_quality_daily_rep_day ON fact_lead_quality_daily(rep_id, day)",
  `CREATE TABLE IF NOT EXISTS fact_monday_health_daily (
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
  )`,
  "CREATE INDEX IF NOT EXISTS idx_fact_monday_health_daily_day ON fact_monday_health_daily(day)",
  "CREATE INDEX IF NOT EXISTS idx_fact_monday_health_daily_class_day ON fact_monday_health_daily(board_class, day)",
  "CREATE INDEX IF NOT EXISTS idx_fact_monday_health_daily_status_day ON fact_monday_health_daily(sync_status, day)",
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS sequence_id UUID",
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS sequence TEXT",
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS contact_id TEXT",
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS contact_phone TEXT",
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS aloware_user TEXT",
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS body TEXT",
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS event_ts TIMESTAMPTZ",
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS direction TEXT",
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS slack_channel_id TEXT",
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS slack_message_ts TEXT",
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()",
  // Enhanced analytics columns
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20) DEFAULT 'sent'",
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ(6)",
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ(6)",
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS media_urls JSONB DEFAULT '[]'::jsonb",
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS link_clicks INTEGER DEFAULT 0",
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS ai_classification VARCHAR(100)",
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS sentiment_score DECIMAL(4,3)",
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS is_booking_signal BOOLEAN DEFAULT false",
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS thread_id VARCHAR(255)",
  "ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS parent_event_id UUID",
  // Indexes for new analytics columns
  "CREATE INDEX IF NOT EXISTS idx_sms_events_delivery_status ON sms_events(delivery_status)",
  "CREATE INDEX IF NOT EXISTS idx_sms_events_booking_signal ON sms_events(is_booking_signal) WHERE is_booking_signal = true",
  "CREATE INDEX IF NOT EXISTS idx_sms_events_ai_classification ON sms_events(ai_classification)",
];

export const ensureAnalyticsSchemaBaseline = async (
  logger?: Pick<Logger, "info" | "warn" | "error">,
): Promise<void> => {
  if (bootstrapAttempted) return;
  bootstrapAttempted = true;

  const prisma = getPrisma();
  for (const statement of statements) {
    try {
      await prisma.$executeRawUnsafe(statement);
    } catch (error) {
      logger?.warn?.(
        `[schema-bootstrap] statement failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  logger?.info?.("[schema-bootstrap] analytics schema baseline ensured");
};
