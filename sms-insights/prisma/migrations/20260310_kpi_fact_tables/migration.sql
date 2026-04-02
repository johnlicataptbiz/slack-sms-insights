-- Canonical metadata on sequence dimension
ALTER TABLE sequence_registry
  ADD COLUMN IF NOT EXISTS lead_magnet TEXT,
  ADD COLUMN IF NOT EXISTS version_tag TEXT,
  ADD COLUMN IF NOT EXISTS owner_rep TEXT,
  ADD COLUMN IF NOT EXISTS is_manual_bucket BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_sequence_registry_manual_bucket
  ON sequence_registry (is_manual_bucket);

-- Ensure a canonical manual bucket exists for aggregations
INSERT INTO sequence_registry (label, normalized_label, status, is_manual_bucket)
VALUES ('No sequence (manual/direct)', 'no sequence manual direct', 'active', true)
ON CONFLICT (normalized_label) DO UPDATE
  SET is_manual_bucket = true;

-- Daily facts: SMS KPIs
CREATE TABLE IF NOT EXISTS fact_sms_daily (
  day DATE NOT NULL,
  sequence_id UUID NOT NULL REFERENCES sequence_registry(id) ON DELETE CASCADE,
  rep_id TEXT NOT NULL,
  messages_sent INTEGER NOT NULL DEFAULT 0,
  unique_contacted INTEGER NOT NULL DEFAULT 0,
  replies_received INTEGER NOT NULL DEFAULT 0,
  opt_outs INTEGER NOT NULL DEFAULT 0,
  reply_rate_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  opt_out_rate_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  booking_signals_sms INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, sequence_id, rep_id)
);

CREATE INDEX IF NOT EXISTS idx_fact_sms_daily_day
  ON fact_sms_daily (day);
CREATE INDEX IF NOT EXISTS idx_fact_sms_daily_sequence_day
  ON fact_sms_daily (sequence_id, day);
CREATE INDEX IF NOT EXISTS idx_fact_sms_daily_rep_day
  ON fact_sms_daily (rep_id, day);

-- Daily facts: booking attribution
CREATE TABLE IF NOT EXISTS fact_booking_daily (
  day DATE NOT NULL,
  sequence_id UUID NOT NULL REFERENCES sequence_registry(id) ON DELETE CASCADE,
  rep_id TEXT NOT NULL,
  booked_total INTEGER NOT NULL DEFAULT 0,
  booked_jack INTEGER NOT NULL DEFAULT 0,
  booked_brandon INTEGER NOT NULL DEFAULT 0,
  booked_self INTEGER NOT NULL DEFAULT 0,
  booked_after_sms_reply INTEGER NOT NULL DEFAULT 0,
  booking_rate_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  diagnostic_booking_signals INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, sequence_id, rep_id)
);

CREATE INDEX IF NOT EXISTS idx_fact_booking_daily_day
  ON fact_booking_daily (day);
CREATE INDEX IF NOT EXISTS idx_fact_booking_daily_sequence_day
  ON fact_booking_daily (sequence_id, day);
CREATE INDEX IF NOT EXISTS idx_fact_booking_daily_rep_day
  ON fact_booking_daily (rep_id, day);

-- Daily facts: lead quality
CREATE TABLE IF NOT EXISTS fact_lead_quality_daily (
  day DATE NOT NULL,
  sequence_id UUID NOT NULL REFERENCES sequence_registry(id) ON DELETE CASCADE,
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
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, sequence_id, rep_id)
);

CREATE INDEX IF NOT EXISTS idx_fact_lead_quality_daily_day
  ON fact_lead_quality_daily (day);
CREATE INDEX IF NOT EXISTS idx_fact_lead_quality_daily_sequence_day
  ON fact_lead_quality_daily (sequence_id, day);
CREATE INDEX IF NOT EXISTS idx_fact_lead_quality_daily_rep_day
  ON fact_lead_quality_daily (rep_id, day);

-- Daily facts: Monday health snapshots
CREATE TABLE IF NOT EXISTS fact_monday_health_daily (
  day DATE NOT NULL,
  board_id TEXT NOT NULL,
  board_class TEXT NOT NULL,
  sync_status TEXT,
  is_stale BOOLEAN NOT NULL DEFAULT false,
  source_coverage_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  campaign_coverage_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  set_by_coverage_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  touchpoints_coverage_pct DOUBLE PRECISION NOT NULL DEFAULT 0,
  snapshot_count INTEGER NOT NULL DEFAULT 0,
  lead_attribution_count INTEGER NOT NULL DEFAULT 0,
  metric_fact_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, board_id)
);

CREATE INDEX IF NOT EXISTS idx_fact_monday_health_daily_day
  ON fact_monday_health_daily (day);
CREATE INDEX IF NOT EXISTS idx_fact_monday_health_daily_class_day
  ON fact_monday_health_daily (board_class, day);
CREATE INDEX IF NOT EXISTS idx_fact_monday_health_daily_status_day
  ON fact_monday_health_daily (sync_status, day);
