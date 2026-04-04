-- Attribution richness on booked_call_attribution
ALTER TABLE booked_call_attribution
  ADD COLUMN IF NOT EXISTS attribution_status TEXT,
  ADD COLUMN IF NOT EXISTS attribution_confidence_band TEXT,
  ADD COLUMN IF NOT EXISTS fallback_used BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS needs_review BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_reason TEXT,
  ADD COLUMN IF NOT EXISTS resolved_sequence_id UUID,
  ADD COLUMN IF NOT EXISTS resolved_sequence_label TEXT,
  ADD COLUMN IF NOT EXISTS attribution_path TEXT,
  ADD COLUMN IF NOT EXISTS matched_via_phone BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS matched_via_fuzzy BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS matched_via_reply_link BOOLEAN NOT NULL DEFAULT false;

-- Review queue for ambiguous attributions
CREATE TABLE IF NOT EXISTS attribution_review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booked_call_id UUID NOT NULL REFERENCES booked_calls(id) ON DELETE CASCADE,
  priority INTEGER NOT NULL DEFAULT 0,
  issue_type TEXT,
  issue_summary TEXT,
  candidate_sequences JSONB,
  status TEXT DEFAULT 'open',
  resolved_by TEXT,
  resolved_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_attr_review_status_priority_created
  ON attribution_review_queue (status, priority, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_attribution_review_queue_booked_call_id
  ON attribution_review_queue (booked_call_id);

-- Normalize sms_events join fields
ALTER TABLE sms_events
  ADD COLUMN IF NOT EXISTS normalized_contact_key TEXT,
  ADD COLUMN IF NOT EXISTS normalized_phone TEXT,
  ADD COLUMN IF NOT EXISTS sequence_version_id UUID,
  ADD COLUMN IF NOT EXISTS event_role TEXT;

CREATE INDEX IF NOT EXISTS idx_sms_events_norm_contact_key_event_ts
  ON sms_events (normalized_contact_key, event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_sms_events_norm_phone_event_ts
  ON sms_events (normalized_phone, event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_sms_events_sequence_version_event_ts
  ON sms_events (sequence_version_id, event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_sms_events_role_event_ts
  ON sms_events (event_role, event_ts DESC);

-- Funnel fact table
CREATE TABLE IF NOT EXISTS fact_sequence_funnel_daily (
  day DATE NOT NULL,
  sequence_id UUID NOT NULL REFERENCES sequence_registry(id) ON DELETE CASCADE,
  new_leads_contacted INTEGER NOT NULL DEFAULT 0,
  leads_replied INTEGER NOT NULL DEFAULT 0,
  qualified_leads INTEGER NOT NULL DEFAULT 0,
  booked_calls INTEGER NOT NULL DEFAULT 0,
  opt_outs INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT NOW(),
  PRIMARY KEY (day, sequence_id)
);

CREATE INDEX IF NOT EXISTS idx_fact_sequence_funnel_daily_sequence_day
  ON fact_sequence_funnel_daily (sequence_id, day);

-- Diagnostics view for unresolved attribution
CREATE OR REPLACE VIEW analytics_unresolved_attribution_v AS
SELECT
  b.booked_call_id,
  b.booked_event_ts,
  b.attribution_status,
  b.needs_review,
  b.review_reason,
  b.mapper_version,
  b.conversation_id,
  b.resolved_sequence_id,
  b.resolved_sequence_label,
  b.created_at
FROM booked_call_attribution b
WHERE COALESCE(b.needs_review, false) = true
   OR b.attribution_status IS NULL;
