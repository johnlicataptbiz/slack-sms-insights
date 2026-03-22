-- Enums
DO $$ BEGIN
  CREATE TYPE "SmsDirection" AS ENUM ('inbound', 'outbound', 'unknown');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ConversationStatus" AS ENUM ('open', 'closed', 'dnc');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "CadenceStatus" AS ENUM ('idle', 'podcast_sent', 'call_offered', 'nurture_pool');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "DailyRunStatus" AS ENUM ('success', 'error', 'pending');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MondaySyncStatus" AS ENUM ('idle', 'running', 'success', 'error');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "MondayBookedCallPushStatus" AS ENUM ('pending', 'synced', 'error', 'skipped');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SendAttemptStatus" AS ENUM ('blocked', 'queued', 'sent', 'failed', 'duplicate');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SequenceVersionStatus" AS ENUM ('active', 'testing', 'rewrite', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WorkItemSeverity" AS ENUM ('low', 'med', 'high');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "WorkItemType" AS ENUM ('needs_reply', 'follow_up', 'hot_lead');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "WorkItemType" ADD VALUE IF NOT EXISTS 'follow_up';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TYPE "WorkItemType" ADD VALUE IF NOT EXISTS 'hot_lead';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SequenceRegistryStatus" AS ENUM ('active', 'inactive');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Drop dependent views before altering columns referenced by them
DROP VIEW IF EXISTS analytics_data_quality_v;
DROP VIEW IF EXISTS analytics_board_registry_v;
DROP VIEW IF EXISTS analytics_booked_call_attribution_v;
DROP VIEW IF EXISTS analytics_lead_profession_distribution_v;
DROP VIEW IF EXISTS analytics_lead_stage_distribution_v;
DROP VIEW IF EXISTS analytics_lead_niche_distribution_v;
DROP VIEW IF EXISTS analytics_objection_distribution_v;

-- Alter columns to enums
ALTER TABLE conversations
  ADD COLUMN status_enum "ConversationStatus" NOT NULL DEFAULT 'open';

UPDATE conversations
  SET status_enum = status::text::"ConversationStatus";

ALTER TABLE conversations
  DROP COLUMN status;

ALTER TABLE conversations
  RENAME COLUMN status_enum TO status;

CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations (status);

ALTER TABLE conversation_state
  ADD COLUMN cadence_status_enum "CadenceStatus" NOT NULL DEFAULT 'idle';

UPDATE conversation_state
  SET cadence_status_enum = cadence_status::text::"CadenceStatus";

ALTER TABLE conversation_state
  DROP COLUMN cadence_status;

ALTER TABLE conversation_state
  RENAME COLUMN cadence_status_enum TO cadence_status;

CREATE INDEX IF NOT EXISTS idx_conversation_state_cadence_status ON conversation_state (cadence_status);

ALTER TABLE daily_runs
  ADD COLUMN status_enum "DailyRunStatus" NOT NULL DEFAULT 'success';

UPDATE daily_runs
  SET status_enum = status::text::"DailyRunStatus";

ALTER TABLE daily_runs
  DROP COLUMN status;

ALTER TABLE daily_runs
  RENAME COLUMN status_enum TO status;

ALTER TABLE monday_booked_call_pushes
  ADD COLUMN status_enum "MondayBookedCallPushStatus" NOT NULL DEFAULT 'pending';

UPDATE monday_booked_call_pushes
  SET status_enum = status::text::"MondayBookedCallPushStatus";

ALTER TABLE monday_booked_call_pushes
  DROP COLUMN status;

ALTER TABLE monday_booked_call_pushes
  RENAME COLUMN status_enum TO status;

CREATE INDEX IF NOT EXISTS idx_monday_booked_call_pushes_status_updated
  ON monday_booked_call_pushes (status, updated_at DESC);

ALTER TABLE monday_sync_state
  DROP CONSTRAINT IF EXISTS monday_sync_state_status_check;

ALTER TABLE monday_sync_state
  ALTER COLUMN status TYPE "MondaySyncStatus" USING status::text::"MondaySyncStatus";

ALTER TABLE monday_sync_state
  ADD CONSTRAINT monday_sync_state_status_check
    CHECK (status = ANY (ARRAY['idle'::"MondaySyncStatus", 'running'::"MondaySyncStatus", 'success'::"MondaySyncStatus", 'error'::"MondaySyncStatus"]));

ALTER TABLE send_attempts
  ADD COLUMN status_enum "SendAttemptStatus" NOT NULL DEFAULT 'sent';

UPDATE send_attempts
  SET status_enum = status::text::"SendAttemptStatus";

ALTER TABLE send_attempts
  DROP COLUMN status;

ALTER TABLE send_attempts
  RENAME COLUMN status_enum TO status;

ALTER TABLE sequence_version_decisions
  ADD COLUMN status_enum "SequenceVersionStatus" NOT NULL DEFAULT 'active';

UPDATE sequence_version_decisions
  SET status_enum = status::text::"SequenceVersionStatus";

ALTER TABLE sequence_version_decisions
  DROP COLUMN status;

ALTER TABLE sequence_version_decisions
  RENAME COLUMN status_enum TO status;

CREATE INDEX IF NOT EXISTS idx_sequence_version_decisions_status_updated
  ON sequence_version_decisions (status, updated_at DESC);

ALTER TABLE work_items
  ADD COLUMN type_enum "WorkItemType" NOT NULL DEFAULT 'needs_reply',
  ADD COLUMN severity_enum "WorkItemSeverity" NOT NULL DEFAULT 'med';

UPDATE work_items
  SET type_enum = type::text::"WorkItemType",
      severity_enum = severity::text::"WorkItemSeverity";

ALTER TABLE work_items
  DROP COLUMN type,
  DROP COLUMN severity;

ALTER TABLE work_items
  RENAME COLUMN type_enum TO type;

ALTER TABLE work_items
  RENAME COLUMN severity_enum TO severity;

ALTER TABLE sms_events
  DROP CONSTRAINT IF EXISTS sms_events_direction_check;

ALTER TABLE sms_events
  ALTER COLUMN direction TYPE "SmsDirection" USING direction::text::"SmsDirection";

ALTER TABLE sms_events
  ADD CONSTRAINT sms_events_direction_check
    CHECK (direction = ANY (ARRAY['inbound'::"SmsDirection", 'outbound'::"SmsDirection", 'unknown'::"SmsDirection"]));

-- Fix goals.updated_at nulls, then enforce not null
UPDATE goals
  SET updated_at = NOW()
  WHERE updated_at IS NULL;

ALTER TABLE goals
  ALTER COLUMN updated_at SET NOT NULL;

-- Rebuild partial unique index for work_items with enum type
DROP INDEX IF EXISTS "uniq_open_needs_reply_per_conversation";
CREATE UNIQUE INDEX "uniq_open_needs_reply_per_conversation"
  ON work_items (conversation_id)
  WHERE (type = 'needs_reply'::"WorkItemType" AND resolved_at IS NULL);

-- Recreate work_items indexes dropped with column replacements
CREATE INDEX IF NOT EXISTS idx_work_items_rep_resolved_due
  ON work_items (rep_id, resolved_at, due_at);

CREATE INDEX IF NOT EXISTS idx_work_items_type_resolved_due
  ON work_items (type, resolved_at, due_at);

-- Sequence registry + aliases
CREATE TABLE sequence_registry (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  label TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  status "SequenceRegistryStatus" NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sequence_registry_pkey PRIMARY KEY (id),
  CONSTRAINT sequence_registry_normalized_label_key UNIQUE (normalized_label)
);

CREATE INDEX idx_sequence_registry_status ON sequence_registry (status);

CREATE TABLE sequence_aliases (
  raw_label TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  sequence_id UUID NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT sequence_aliases_pkey PRIMARY KEY (raw_label),
  CONSTRAINT sequence_aliases_sequence_id_fkey FOREIGN KEY (sequence_id)
    REFERENCES sequence_registry (id) ON DELETE CASCADE ON UPDATE NO ACTION
);

CREATE INDEX idx_sequence_aliases_sequence_id ON sequence_aliases (sequence_id);
CREATE INDEX idx_sequence_aliases_normalized_label ON sequence_aliases (normalized_label);

-- Add sequence_id to sms_events
ALTER TABLE sms_events
  ADD COLUMN sequence_id UUID;

-- Backfill sequences and aliases
WITH raw AS (
  SELECT DISTINCT btrim(sequence) AS raw_label
  FROM sms_events
  WHERE sequence IS NOT NULL AND btrim(sequence) <> ''
),
normalized AS (
  SELECT
    raw_label,
    lower(regexp_replace(regexp_replace(raw_label, '[^a-z0-9]+', ' ', 'g'), '\\s+', ' ', 'g')) AS normalized_label
  FROM raw
)
INSERT INTO sequence_registry (label, normalized_label)
SELECT MIN(raw_label) AS label, normalized_label
FROM normalized
GROUP BY normalized_label
ON CONFLICT (normalized_label) DO NOTHING;

WITH raw AS (
  SELECT DISTINCT btrim(sequence) AS raw_label
  FROM sms_events
  WHERE sequence IS NOT NULL AND btrim(sequence) <> ''
),
normalized AS (
  SELECT
    raw_label,
    lower(regexp_replace(regexp_replace(raw_label, '[^a-z0-9]+', ' ', 'g'), '\\s+', ' ', 'g')) AS normalized_label
  FROM raw
)
INSERT INTO sequence_aliases (raw_label, normalized_label, sequence_id)
SELECT n.raw_label, n.normalized_label, r.id
FROM normalized n
JOIN sequence_registry r ON r.normalized_label = n.normalized_label
ON CONFLICT (raw_label) DO UPDATE
  SET normalized_label = EXCLUDED.normalized_label,
      sequence_id = EXCLUDED.sequence_id;

UPDATE sms_events e
SET sequence_id = a.sequence_id
FROM sequence_aliases a
WHERE e.sequence IS NOT NULL
  AND btrim(e.sequence) <> ''
  AND a.raw_label = btrim(e.sequence);

-- Indexes for sequence lookups
CREATE INDEX idx_sms_events_sequence_event_ts ON sms_events (sequence, event_ts DESC);
CREATE INDEX idx_sms_events_sequence_id_event_ts ON sms_events (sequence_id, event_ts DESC);

-- Recreate views dropped earlier (depend on monday_sync_state.status)
CREATE VIEW analytics_board_registry_v AS
 WITH snapshots AS (
         SELECT monday_call_snapshots.board_id,
            (count(*))::integer AS snapshot_count,
            max(monday_call_snapshots.updated_at) AS latest_item_updated_at
           FROM monday_call_snapshots
          GROUP BY monday_call_snapshots.board_id
        ), outcomes AS (
         SELECT lead_outcomes.board_id,
            (count(*))::integer AS lead_outcome_count
           FROM lead_outcomes
          GROUP BY lead_outcomes.board_id
        ), attribution AS (
         SELECT lead_attribution.board_id,
            (count(*))::integer AS lead_attribution_count
           FROM lead_attribution
          GROUP BY lead_attribution.board_id
        ), activities AS (
         SELECT setter_activity.board_id,
            (count(*))::integer AS setter_activity_count
           FROM setter_activity
          GROUP BY setter_activity.board_id
        ), metrics AS (
         SELECT monday_metric_facts.board_id,
            (count(*))::integer AS metric_fact_count
           FROM monday_metric_facts
          GROUP BY monday_metric_facts.board_id
        ), coverage AS (
         SELECT monday_call_column_latest.board_id,
            (count(*) FILTER (WHERE ((monday_call_column_latest.column_title = 'Set By:'::text) AND (monday_call_column_latest.text_value IS NOT NULL) AND (btrim(monday_call_column_latest.text_value) <> ''::text))))::integer AS set_by_populated,
            (count(*) FILTER (WHERE ((monday_call_column_latest.column_title = 'Original Source'::text) AND (monday_call_column_latest.text_value IS NOT NULL) AND (btrim(monday_call_column_latest.text_value) <> ''::text) AND (lower(btrim(monday_call_column_latest.text_value)) <> 'unknown'::text))))::integer AS source_populated,
            (count(*) FILTER (WHERE ((monday_call_column_latest.column_title = 'Campaign'::text) AND (monday_call_column_latest.text_value IS NOT NULL) AND (btrim(monday_call_column_latest.text_value) <> ''::text) AND (lower(btrim(monday_call_column_latest.text_value)) <> 'unknown'::text))))::integer AS campaign_populated,
            (count(*) FILTER (WHERE ((monday_call_column_latest.column_title = 'Touchpoints'::text) AND (monday_call_column_latest.text_value IS NOT NULL) AND (btrim(monday_call_column_latest.text_value) <> ''::text))))::integer AS touchpoints_populated
           FROM monday_call_column_latest
          GROUP BY monday_call_column_latest.board_id
        )
 SELECT br.board_id,
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
   FROM (((((((monday_board_registry br
     LEFT JOIN monday_sync_state ms ON ((ms.board_id = br.board_id)))
     LEFT JOIN snapshots s ON ((s.board_id = br.board_id)))
     LEFT JOIN outcomes o ON ((o.board_id = br.board_id)))
     LEFT JOIN attribution a ON ((a.board_id = br.board_id)))
     LEFT JOIN activities sa ON ((sa.board_id = br.board_id)))
     LEFT JOIN metrics m ON ((m.board_id = br.board_id)))
     LEFT JOIN coverage c ON ((c.board_id = br.board_id)));

CREATE VIEW analytics_data_quality_v AS
 SELECT board_id,
    board_label,
    board_class,
    metric_grain,
    include_in_funnel,
    active,
    sync_status,
    last_sync_at,
    snapshot_count,
    lead_outcome_count,
    lead_attribution_count,
    metric_fact_count,
        CASE
            WHEN (lead_attribution_count > 0) THEN round((((source_populated)::numeric / (lead_attribution_count)::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS source_coverage_pct,
        CASE
            WHEN (lead_attribution_count > 0) THEN round((((campaign_populated)::numeric / (lead_attribution_count)::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS campaign_coverage_pct,
        CASE
            WHEN (lead_attribution_count > 0) THEN round((((set_by_populated)::numeric / (lead_attribution_count)::numeric) * (100)::numeric), 2)
            ELSE (0)::numeric
        END AS set_by_coverage_pct,
        CASE
            WHEN (lead_attribution_count > 0) THEN round((((touchpoints_populated)::numeric / (lead_attribution_count)::numeric) * (100)::numeric), 2)
   ELSE (0)::numeric
        END AS touchpoints_coverage_pct
   FROM analytics_board_registry_v br;

-- Recreate analytics views that depend on sms_events.direction
CREATE VIEW analytics_booked_call_attribution_v AS
 WITH base AS (
         SELECT a.booked_call_id,
            a.booked_event_ts,
            a.booked_text,
            a.canonical_booking,
            a.mapping_method,
            a.match_confidence,
            a.conversation_id,
            a.conversation_match_seconds,
            a.setter_hint,
            a.setter_final,
            a.closer_final,
            a.first_conversion,
            a.source_bucket,
            a.hubspot_contact_id,
            a.lead_score,
            a.lead_score_source,
            a.mapper_version,
            (bc.raw #>> '{attachments,0,text}'::text[]) AS attachment_text,
            NULLIF(btrim((regexp_match(COALESCE((bc.raw #>> '{attachments,0,text}'::text[]), ''::text), '\*Contact owner\*:\s*([^\n\r*]+)'::text))[1]), ''::text) AS contact_owner_raw,
            NULLIF(btrim((regexp_match(COALESCE((bc.raw #>> '{attachments,0,text}'::text[]), ''::text), '\*First Conversion\*:\s*([^\n\r*]+)'::text))[1]), ''::text) AS first_conversion_raw,
            c.contact_key,
            c.contact_phone,
            c.current_rep_id,
            icp.revenue_mix_category,
            icp.employment_status,
            icp.coaching_interest,
            cs.qualification_revenue_mix,
            cs.qualification_full_or_part_time,
            cs.qualification_coaching_interest,
            cs.qualification_progress_step
           FROM ((((booked_call_attribution a
             LEFT JOIN booked_calls bc ON ((bc.id = a.booked_call_id)))
             LEFT JOIN conversations c ON ((c.id = a.conversation_id)))
             LEFT JOIN inbox_contact_profiles icp ON ((icp.contact_key = c.contact_key)))
             LEFT JOIN conversation_state cs ON ((cs.conversation_id = a.conversation_id)))
          WHERE (a.canonical_booking = true)
        ), normalized AS (
         SELECT b.booked_call_id,
            b.booked_event_ts,
            b.booked_text,
            b.canonical_booking,
            b.mapping_method,
            b.match_confidence,
            b.conversation_id,
            b.conversation_match_seconds,
            b.setter_hint,
            b.setter_final,
            b.closer_final,
            b.first_conversion,
            b.source_bucket,
            b.hubspot_contact_id,
            b.lead_score,
            b.lead_score_source,
            b.mapper_version,
            b.attachment_text,
            b.contact_owner_raw,
            b.first_conversion_raw,
            b.contact_key,
            b.contact_phone,
            b.current_rep_id,
            b.revenue_mix_category,
            b.employment_status,
            b.coaching_interest,
            b.qualification_revenue_mix,
            b.qualification_full_or_part_time,
            b.qualification_coaching_interest,
            b.qualification_progress_step,
                CASE
                    WHEN (lower(COALESCE(b.contact_owner_raw, ''::text)) ~ 'john\s+licata|\bjohn\b'::text) THEN 'John Licata'::text
                    WHEN (lower(COALESCE(b.contact_owner_raw, ''::text)) ~ 'toni\s+counts|tony\s+counts|\btoni\b|\btony\b|antonia'::text) THEN 'Toni Counts'::text
                    WHEN (lower(COALESCE(b.contact_owner_raw, ''::text)) ~ 'jack\s+licata|\bjack\b'::text) THEN 'Jack Licata'::text
                    WHEN (lower(COALESCE(b.contact_owner_raw, ''::text)) ~ 'brandon\s+erwin|\bbrandon\b'::text) THEN 'Brandon Erwin'::text
                    WHEN (lower(COALESCE(b.contact_owner_raw, ''::text)) ~ 'renee\s+duran|\brenee\b'::text) THEN 'Renee Duran'::text
                    ELSE NULL::text
                END AS contact_owner_name,
                CASE
                    WHEN (lower(COALESCE(b.current_rep_id, ''::text)) = 'jack'::text) THEN 'Jack Licata'::text
                    WHEN (lower(COALESCE(b.current_rep_id, ''::text)) = 'brandon'::text) THEN 'Brandon Erwin'::text
                    WHEN (lower(COALESCE(b.current_rep_id, ''::text)) = 'john'::text) THEN 'John Licata'::text
                    WHEN (lower(COALESCE(b.current_rep_id, ''::text)) = ANY (ARRAY['toni'::text, 'tony'::text])) THEN 'Toni Counts'::text
                    ELSE NULL::text
                END AS current_rep_name,
                CASE
                    WHEN (lower(COALESCE(b.setter_hint, ''::text)) = 'jack'::text) THEN 'Jack Licata'::text
                    WHEN (lower(COALESCE(b.setter_hint, ''::text)) = 'brandon'::text) THEN 'Brandon Erwin'::text
                    ELSE NULL::text
                END AS setter_hint_name,
                CASE
                    WHEN (lower(COALESCE(b.first_conversion_raw, ''::text)) ~ 'tonicounts|with[- ]?toni|discovery-call-with-toni'::text) THEN 'Toni Counts'::text
                    WHEN (lower(COALESCE(b.first_conversion_raw, ''::text)) ~ 'johnlicata|with[- ]?john'::text) THEN 'John Licata'::text
                    WHEN (lower(COALESCE(b.booked_text, ''::text)) ~ 'with\s+john|john\s+licata|john[^a-z0-9]?s schedule'::text) THEN 'John Licata'::text
                    WHEN (lower(COALESCE(b.booked_text, ''::text)) ~ 'with\s+toni|with\s+tony|toni\s+counts|tony\s+counts|toni[^a-z0-9]?s schedule|tony[^a-z0-9]?s schedule'::text) THEN 'Toni Counts'::text
                    ELSE NULL::text
                END AS closer_text_hint,
                CASE
                    WHEN (lower(COALESCE(b.first_conversion_raw, ''::text)) ~ 'field manual|cash practice field manual'::text) THEN 'Field Manual'::text
                    WHEN (lower(COALESCE(b.first_conversion_raw, ''::text)) ~ 'standalone space'::text) THEN 'Standalone Space Guide'::text
                    WHEN (lower(COALESCE(b.first_conversion_raw, ''::text)) ~ 'raise your rates|cheat sheet|cheatsheet'::text) THEN 'Raise Your Rates Cheatsheet'::text
                    WHEN (lower(COALESCE(b.first_conversion_raw, ''::text)) ~ 'hiring guide'::text) THEN 'Hiring Guide'::text
                    WHEN (lower(COALESCE(b.first_conversion_raw, ''::text)) ~ 'workshop|webinar|10k months|4 levers'::text) THEN 'Webinar / Workshop'::text
                    WHEN (lower(COALESCE(b.first_conversion_raw, ''::text)) ~ '5-day challenge'::text) THEN '5-Day Challenge'::text
                    WHEN (lower(COALESCE(b.first_conversion_raw, ''::text)) ~ 'clinic startup checklist'::text) THEN 'Clinic Startup Checklist'::text
                    WHEN (lower(COALESCE(b.first_conversion_raw, ''::text)) ~ 'case study'::text) THEN 'Case Study'::text
                    WHEN (lower(COALESCE(b.first_conversion_raw, ''::text)) ~ 'meetings link|discovery-call'::text) THEN 'Direct / Meetings Link'::text
                    ELSE NULL::text
                END AS source_hint
           FROM base b
        ), resolved AS (
         SELECT n.booked_call_id,
            n.booked_event_ts,
            n.booked_text,
            n.canonical_booking,
            n.mapping_method,
            n.match_confidence,
            n.conversation_id,
            n.conversation_match_seconds,
            n.setter_hint,
            n.setter_final,
            n.closer_final,
            n.first_conversion,
            n.source_bucket,
            n.hubspot_contact_id,
            n.lead_score,
            n.lead_score_source,
            n.mapper_version,
            n.attachment_text,
            n.contact_owner_raw,
            n.first_conversion_raw,
            n.contact_key,
            n.contact_phone,
            n.current_rep_id,
            n.revenue_mix_category,
            n.employment_status,
            n.coaching_interest,
            n.qualification_revenue_mix,
            n.qualification_full_or_part_time,
            n.qualification_coaching_interest,
            n.qualification_progress_step,
            n.contact_owner_name,
            n.current_rep_name,
            n.setter_hint_name,
            n.closer_text_hint,
            n.source_hint,
            COALESCE(NULLIF(btrim(
                CASE
                    WHEN (lower(COALESCE(n.setter_final, ''::text)) = ANY (ARRAY['unknown'::text, 'unassigned setter'::text])) THEN ''::text
                    ELSE n.setter_final
                END), ''::text),
                CASE
                    WHEN (n.contact_owner_name = ANY (ARRAY['Jack Licata'::text, 'Brandon Erwin'::text])) THEN n.contact_owner_name
                    ELSE NULL::text
                END, n.setter_hint_name, n.current_rep_name) AS setter_resolved,
            COALESCE(NULLIF(btrim(
                CASE
                    WHEN (lower(COALESCE(n.closer_final, ''::text)) = ANY (ARRAY['unknown'::text, 'unassigned closer'::text])) THEN ''::text
                    ELSE n.closer_final
                END), ''::text),
                CASE
                    WHEN (n.contact_owner_name = ANY (ARRAY['John Licata'::text, 'Toni Counts'::text])) THEN n.contact_owner_name
                    ELSE NULL::text
                END, n.closer_text_hint) AS closer_resolved,
            COALESCE(NULLIF(btrim(n.first_conversion), ''::text), n.first_conversion_raw) AS first_conversion_resolved,
            COALESCE(NULLIF(btrim(n.source_bucket), ''::text), n.source_hint) AS source_bucket_resolved
           FROM normalized n
        )
 SELECT r.booked_call_id,
    r.booked_event_ts,
    r.booked_text,
    r.canonical_booking,
    r.mapping_method,
    r.match_confidence,
    r.conversation_id,
    r.conversation_match_seconds,
    COALESCE(NULLIF(btrim(r.setter_resolved), ''::text), 'unknown'::text) AS setter,
    COALESCE(NULLIF(btrim(r.closer_resolved), ''::text), 'unknown'::text) AS closer,
    COALESCE(NULLIF(btrim(r.first_conversion_resolved), ''::text), 'unknown'::text) AS first_conversion,
    COALESCE(NULLIF(btrim(r.source_bucket_resolved), ''::text), 'unknown'::text) AS source_bucket,
    r.hubspot_contact_id,
    r.lead_score,
    r.lead_score_source,
    r.contact_key,
    r.contact_phone,
    COALESCE(NULLIF(btrim(r.revenue_mix_category), ''::text), 'unknown'::text) AS revenue_mix_category,
    COALESCE(NULLIF(btrim(r.employment_status), ''::text), 'unknown'::text) AS employment_status,
    COALESCE(NULLIF(btrim(r.coaching_interest), ''::text), 'unknown'::text) AS coaching_interest,
    COALESCE(NULLIF(btrim(r.qualification_revenue_mix), ''::text), 'unknown'::text) AS qualification_revenue_mix,
    COALESCE(NULLIF(btrim(r.qualification_full_or_part_time), ''::text), 'unknown'::text) AS qualification_full_or_part_time,
    COALESCE(NULLIF(btrim(r.qualification_coaching_interest), ''::text), 'unknown'::text) AS qualification_coaching_interest,
    r.qualification_progress_step,
    metrics.outbound_before_booked,
    metrics.questions_before_booked,
    metrics.qual_prompts_before_booked,
    metrics.weak_frame_before_booked,
    COALESCE(NULLIF(btrim(seq.sequence_key), ''::text), 'none'::text) AS sms_sequence_key,
        CASE
            WHEN (COALESCE(NULLIF(btrim(seq.sequence_key), ''::text), 'none'::text) <> 'none'::text) THEN COALESCE(NULLIF(btrim(seq.sequence_key), ''::text), 'none'::text)
            WHEN (COALESCE(NULLIF(btrim(r.first_conversion_resolved), ''::text), ''::text) <> ''::text) THEN COALESCE(NULLIF(btrim(r.first_conversion_resolved), ''::text), 'unknown'::text)
            ELSE 'unknown'::text
        END AS sequence_key,
        CASE
            WHEN (COALESCE(NULLIF(btrim(r.setter_resolved), ''::text), ''::text) <> ''::text) THEN true
            ELSE false
        END AS setter_is_mapped,
        CASE
            WHEN (COALESCE(NULLIF(btrim(r.closer_resolved), ''::text), ''::text) <> ''::text) THEN true
            ELSE false
        END AS closer_is_mapped,
        CASE
            WHEN (COALESCE(NULLIF(btrim(r.source_bucket_resolved), ''::text), ''::text) <> ''::text) THEN true
            ELSE false
        END AS source_is_mapped,
    COALESCE(NULLIF(btrim(r.contact_owner_raw), ''::text), 'Not captured'::text) AS contact_owner_raw,
    COALESCE(NULLIF(btrim(r.first_conversion_raw), ''::text), 'Not captured'::text) AS first_conversion_raw,
    r.mapper_version
   FROM resolved r
     LEFT JOIN LATERAL (
        SELECT (count(*) FILTER (WHERE ((se.direction = 'outbound'::"SmsDirection") AND (se.event_ts <= r.booked_event_ts))))::integer AS outbound_before_booked,
               (count(*) FILTER (WHERE ((se.direction = 'outbound'::"SmsDirection") AND (se.event_ts <= r.booked_event_ts) AND (se.body ~* '\?'::text))))::integer AS questions_before_booked,
               (count(*) FILTER (WHERE ((se.direction = 'outbound'::"SmsDirection") AND (se.event_ts <= r.booked_event_ts) AND (se.body ~* '(cash|insurance|revenue|full\s*time|part\s*time|population|niche|patient type|pd|stroke|sci)'::text))))::integer AS qual_prompts_before_booked,
               bool_or(((se.direction = 'outbound'::"SmsDirection") AND (se.event_ts <= r.booked_event_ts) AND (se.body ~* '(free information|info gathering|just a chat|pick my brain|100% free|no pressure|brainstorm|even if you decide not to move forward)'::text))) AS weak_frame_before_booked
          FROM sms_events se
         WHERE (se.conversation_id = r.conversation_id)
     ) metrics ON (true)
     LEFT JOIN LATERAL (
        SELECT COALESCE(NULLIF(btrim(se.sequence), ''::text), 'none'::text) AS sequence_key,
               count(*) AS n
          FROM sms_events se
         WHERE ((se.conversation_id = r.conversation_id) AND (se.direction = 'outbound'::"SmsDirection") AND (se.event_ts <= r.booked_event_ts))
         GROUP BY COALESCE(NULLIF(btrim(se.sequence), ''::text), 'none'::text)
         ORDER BY (count(*)) DESC, COALESCE(NULLIF(btrim(se.sequence), ''::text), 'none'::text)
         LIMIT 1
     ) seq ON (true);
CREATE VIEW analytics_lead_profession_distribution_v AS
 WITH inbound AS (
         SELECT lower(COALESCE(sms_events.body, ''::text)) AS body
           FROM sms_events
          WHERE (sms_events.direction = 'inbound'::"SmsDirection")
        ), classified AS (
         SELECT
                CASE
                    WHEN (inbound.body ~* '(\\bstudent\\b|in school|pt school|new grad|just graduated|pre[- ]grad)'::text) THEN 'Student (any field)'::text
                    WHEN (inbound.body ~* '(physical therapist|physical therapy|physiotherapist|doctor of physical therapy|\\bdpt\\b|\\bpta?\\b|\\bphysio\\b)'::text) THEN 'Physical Therapist / PT'::text
                    WHEN (inbound.body ~* '(chiropractor|\\bchiro\\b)'::text) THEN 'Chiropractor'::text
                    WHEN (inbound.body ~* '(massage therapist|massage therapy|\\blmt\\b)'::text) THEN 'Massage Therapist'::text
                    WHEN (inbound.body ~* '(personal trainer|strength coach|fitness coach)'::text) THEN 'Personal Trainer / Strength Coach'::text
                    WHEN (inbound.body ~* '(speech therapist|\\bslp\\b)'::text) THEN 'SLP / Speech Therapist'::text
                    WHEN (inbound.body ~* '(occupational therapist|\\bot\\b)'::text) THEN 'OT / Occupational Therapist'::text
                    WHEN (inbound.body ~* '(\\bnurse\\b|\\bn\\.?p\\.?\\b|nurse practitioner)'::text) THEN 'Nurse / NP'::text
                    WHEN (inbound.body ~* '(mental health|psychotherapist|counselor|counselling|counseling|\\blmft\\b|\\blcsw\\b|\\bmft\\b)'::text) THEN 'Mental Health / Therapist'::text
                    WHEN (inbound.body ~* '(dental|dentist|audio|audiology|podiatry|dietitian)'::text) THEN 'Other Healthcare (dental, audio, etc.)'::text
                    ELSE 'Not identified'::text
                END AS profession
           FROM inbound
        )
 SELECT profession,
    (count(*))::integer AS mentions,
    round((((count(*))::numeric / (NULLIF(( SELECT count(*) AS count
           FROM inbound), 0))::numeric) * (100)::numeric), 1) AS pct_of_inbound,
        CASE profession
            WHEN 'Student (any field)'::text THEN 'Largest identified group'::text
            WHEN 'Physical Therapist / PT'::text THEN 'Core target audience'::text
            WHEN 'Chiropractor'::text THEN 'Adjacent, often a fit'::text
            WHEN 'Mental Health / Therapist'::text THEN 'Frequently not a fit'::text
            WHEN 'Massage Therapist'::text THEN 'Frequently not a fit'::text
            WHEN 'Personal Trainer / Strength Coach'::text THEN 'Sometimes a fit'::text
            WHEN 'Other Healthcare (dental, audio, etc.)'::text THEN 'Rarely a fit'::text
            WHEN 'SLP / Speech Therapist'::text THEN 'Occasionally a fit'::text
            WHEN 'Nurse / NP'::text THEN 'Rarely a fit'::text
            WHEN 'OT / Occupational Therapist'::text THEN 'Occasionally a fit'::text
            ELSE ''::text
        END AS notes
   FROM classified
  GROUP BY profession;

CREATE VIEW analytics_lead_stage_distribution_v AS
 WITH inbound AS (
         SELECT lower(COALESCE(sms_events.body, ''::text)) AS body
           FROM sms_events
          WHERE (sms_events.direction = 'inbound'::"SmsDirection")
        ), classified AS (
         SELECT
                CASE
                    WHEN (inbound.body ~* '(\\bstudent\\b|pre[- ]grad|in school|new grad|just graduated)'::text) THEN 'Student / pre-grad'::text
                    WHEN (inbound.body ~* '(idea phase|planning ahead|planning|pre[- ]launch|exploring|research|keep this in mind|when i''m ready|when im ready|6 to 12 months|6-12 months|next 6|next six months)'::text) THEN 'Planning / pre-launch'::text
                    WHEN (inbound.body ~* '(side hustle|part[- ]time|after work|nights and weekends|\\bprn\\b|weekends?)'::text) THEN 'Side hustle / part-time'::text
                    WHEN (inbound.body ~* '(full[- ]time now|went full[- ]time|left my job|quit my job|transitioned full[- ]time)'::text) THEN 'Transitioned full-time'::text
                    WHEN (inbound.body ~* '(just launched|newly launched|opened .* months|started .* months)'::text) THEN 'Newly launched (< 6 months)'::text
                    WHEN (inbound.body ~* '(already open|already running|have a clinic|my practice is open|practice is running)'::text) THEN 'Already open / running'::text
                    ELSE 'Not identified'::text
                END AS stage
           FROM inbound
        )
 SELECT stage,
    (count(*))::integer AS mentions,
    round((((count(*))::numeric / (NULLIF(( SELECT count(*) AS count
           FROM inbound), 0))::numeric) * (100)::numeric), 1) AS pct_of_inbound,
        CASE stage
            WHEN 'Planning / pre-launch'::text THEN 'Core ICP for Rainmaker'::text
            WHEN 'Side hustle / part-time'::text THEN 'High intent'::text
            WHEN 'Transitioned full-time'::text THEN 'Likely scaling needs'::text
            ELSE ''::text
        END AS notes
   FROM classified
  GROUP BY stage;

CREATE VIEW analytics_lead_niche_distribution_v AS
 WITH inbound AS (
         SELECT lower(COALESCE(sms_events.body, ''::text)) AS body
           FROM sms_events
          WHERE (sms_events.direction = 'inbound'::"SmsDirection")
        ), dict(keyword, pattern, sort_order) AS (
         VALUES ('gym'::text,'\bgym\b'::text,1), ('athlete'::text,'\bathlet(?:e|es|ic)\b'::text,2), ('ortho'::text,'\bortho(?:pedic)?\b'::text,3), ('mobile'::text,'\bmobile\b'::text,4), ('running'::text,'\brunn(?:ing|er|ers)\b'::text,5), ('wellness'::text,'\bwellness\b'::text,6), ('home health'::text,'home\s*health'::text,7), ('sports'::text,'\bsports?\b'::text,8), ('kids / pediatric'::text,'\bkids?\b|pediatric'::text,9), ('golf'::text,'\bgolf\b'::text,10), ('neuro'::text,'\bneuro\b|\bpd\b|\bstroke\b|\bsci\b'::text,11), ('concierge'::text,'concierge'::text,12), ('fitness'::text,'\bfitness\b'::text,13), ('crossfit'::text,'cross\s*fit'::text,14), ('dry needling'::text,'dry\s*needling'::text,15), ('pelvic health'::text,'pelvic\s*health'::text,16), ('aging / active aging'::text,'active\s*aging|\baging\b'::text,17), ('functional medicine'::text,'functional\s*medicine'::text,18), ('vestibular'::text,'vestibular'::text,19), ('acl'::text,'\bacl\b'::text,20), ('lymphedema'::text,'lymphedema'::text,21)
        )
 SELECT d.keyword,
    (count(i.body))::integer AS mentions,
    round((((count(i.body))::numeric / (NULLIF(( SELECT count(*) AS count
           FROM inbound), 0))::numeric) * (100)::numeric), 2) AS pct_of_inbound,
    d.sort_order
   FROM (dict d
     LEFT JOIN inbound i ON ((i.body ~* d.pattern)))
  GROUP BY d.keyword, d.sort_order;
CREATE VIEW analytics_objection_distribution_v AS
 WITH inbound AS (
         SELECT lower(COALESCE(sms_events.body, ''::text)) AS body
           FROM sms_events
          WHERE (sms_events.direction = 'inbound'::"SmsDirection")
        ), dict(objection, pattern, sort_order, notes) AS (
         VALUES ('Cost / price concern'::text,'(how much|\\bprice\\b|\\bcost\\b|expensive|afford|investment|too much)'::text,1,'#1 objection to handle explicitly'::text), ('Needs to think about it'::text,'(think about it|let me think|keep this in mind|circle back|sit on it)'::text,2,'Decision-risk signal'::text), ('Bad timing / not ready'::text,'(not ready|bad time|timing|later|next month|next year|busy right now|not now)'::text,3,'Often recoverable with urgency framing'::text), ('Family / personal constraints'::text,'(wife|husband|spouse|family|kids|childcare|personal stuff|personal issue)'::text,4,''::text), ('Wrong profession / not a fit'::text,'(wrong person|wrong number|not a fit|not interested|remove me|already working somewhere else)'::text,5,''::text), ('Compliance / legal concern'::text,'(medicare|non[- ]?compete|legal|compliance|employer policy|credential)'::text,6,''::text), ('Financial constraint'::text,'(student loans?|\\bdebt\\b|cash flow|no money|financially|can''t afford right now)'::text,7,''::text), ('Already has a coach/program'::text,'(already have (a )?coach|already in (a )?program|working with someone|already hired)'::text,8,''::text), ('Market / location concern'::text,'(\\brural\\b|small town|my market|market here|not enough patients|population)'::text,9,''::text)
        )
 SELECT d.objection,
    (count(i.body))::integer AS mentions,
    round((((count(i.body))::numeric / (NULLIF(( SELECT count(*) AS count
           FROM inbound), 0))::numeric) * (100)::numeric), 2) AS pct_of_inbound,
    d.notes,
    d.sort_order
   FROM (dict d
     LEFT JOIN inbound i ON ((i.body ~* d.pattern)))
  GROUP BY d.objection, d.notes, d.sort_order;
