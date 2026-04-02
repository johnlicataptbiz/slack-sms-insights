-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "SmsDirection" AS ENUM ('inbound', 'outbound', 'unknown');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('open', 'closed', 'dnc');

-- CreateEnum
CREATE TYPE "CadenceStatus" AS ENUM ('idle', 'podcast_sent', 'call_offered', 'nurture_pool');

-- CreateEnum
CREATE TYPE "DailyRunStatus" AS ENUM ('success', 'error', 'pending');

-- CreateEnum
CREATE TYPE "MondaySyncStatus" AS ENUM ('idle', 'running', 'success', 'error');

-- CreateEnum
CREATE TYPE "MondayBookedCallPushStatus" AS ENUM ('pending', 'synced', 'error', 'skipped');

-- CreateEnum
CREATE TYPE "SendAttemptStatus" AS ENUM ('blocked', 'queued', 'sent', 'failed', 'duplicate');

-- CreateEnum
CREATE TYPE "SequenceVersionStatus" AS ENUM ('active', 'testing', 'rewrite', 'archived');

-- CreateEnum
CREATE TYPE "WorkItemSeverity" AS ENUM ('low', 'med', 'high');

-- CreateEnum
CREATE TYPE "WorkItemType" AS ENUM ('needs_reply', 'follow_up', 'hot_lead');

-- CreateEnum
CREATE TYPE "SequenceRegistryStatus" AS ENUM ('active', 'inactive');

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "contact_key" TEXT NOT NULL,
    "contact_id" TEXT,
    "contact_phone" TEXT,
    "current_rep_id" TEXT,
    "status" "ConversationStatus" NOT NULL DEFAULT 'open',
    "last_inbound_at" TIMESTAMPTZ(6),
    "last_outbound_at" TIMESTAMPTZ(6),
    "last_touch_at" TIMESTAMPTZ(6),
    "unreplied_inbound_count" INTEGER NOT NULL DEFAULT 0,
    "next_followup_due_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actor_directory" (
    "canonical_name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "actor_directory_pkey" PRIMARY KEY ("canonical_name")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "action" VARCHAR(100) NOT NULL,
    "resource_type" VARCHAR(100) NOT NULL,
    "resource_id" VARCHAR(255) NOT NULL,
    "user_id" VARCHAR(255),
    "details" JSONB DEFAULT '{}',
    "ip_address" INET,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booked_call_attribution" (
    "booked_call_id" UUID NOT NULL,
    "booked_event_ts" TIMESTAMPTZ(6) NOT NULL,
    "booked_text" TEXT,
    "canonical_booking" BOOLEAN NOT NULL DEFAULT false,
    "mapping_method" TEXT,
    "match_confidence" DECIMAL(5,3),
    "attribution_status" TEXT,
    "attribution_confidence_band" TEXT,
    "fallback_used" BOOLEAN NOT NULL DEFAULT false,
    "needs_review" BOOLEAN NOT NULL DEFAULT false,
    "review_reason" TEXT,
    "conversation_id" UUID,
    "conversation_match_seconds" INTEGER,
    "setter_hint" TEXT,
    "setter_final" TEXT,
    "closer_final" TEXT,
    "first_conversion" TEXT,
    "source_bucket" TEXT,
    "resolved_sequence_id" UUID,
    "resolved_sequence_label" TEXT,
    "attribution_path" TEXT,
    "matched_via_phone" BOOLEAN NOT NULL DEFAULT false,
    "matched_via_fuzzy" BOOLEAN NOT NULL DEFAULT false,
    "matched_via_reply_link" BOOLEAN NOT NULL DEFAULT false,
    "hubspot_contact_id" TEXT,
    "lead_score" DECIMAL,
    "lead_score_source" TEXT,
    "mapper_version" TEXT NOT NULL DEFAULT 'v1.0',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "booked_call_attribution_pkey" PRIMARY KEY ("booked_call_id")
);

-- CreateTable
CREATE TABLE "attribution_review_queue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "booked_call_id" UUID NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "issue_type" TEXT,
    "issue_summary" TEXT,
    "candidate_sequences" JSONB,
    "status" TEXT DEFAULT 'open',
    "resolved_by" TEXT,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "attribution_review_queue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booked_call_reactions" (
    "booked_call_id" UUID NOT NULL,
    "reaction_name" TEXT NOT NULL,
    "reaction_count" INTEGER NOT NULL DEFAULT 0,
    "users" JSONB,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "booked_call_reactions_pkey" PRIMARY KEY ("booked_call_id","reaction_name")
);

-- CreateTable
CREATE TABLE "booked_calls" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slack_team_id" TEXT NOT NULL,
    "slack_channel_id" TEXT NOT NULL,
    "slack_message_ts" TEXT NOT NULL,
    "event_ts" TIMESTAMPTZ(6) NOT NULL,
    "text" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "first_sms_touch_at" TIMESTAMPTZ(6),

    CONSTRAINT "booked_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "author" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_state" (
    "conversation_id" UUID NOT NULL,
    "qualification_full_or_part_time" TEXT NOT NULL DEFAULT 'unknown',
    "qualification_niche" TEXT,
    "qualification_revenue_mix" TEXT NOT NULL DEFAULT 'unknown',
    "qualification_coaching_interest" TEXT NOT NULL DEFAULT 'unknown',
    "qualification_progress_step" INTEGER NOT NULL DEFAULT 0,
    "escalation_level" INTEGER NOT NULL DEFAULT 1,
    "escalation_reason" TEXT,
    "escalation_overridden" BOOLEAN NOT NULL DEFAULT false,
    "last_podcast_sent_at" TIMESTAMPTZ(6),
    "next_followup_due_at" TIMESTAMPTZ(6),
    "cadence_status" "CadenceStatus" NOT NULL DEFAULT 'idle',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "objection_tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "guardrail_override_count" INTEGER NOT NULL DEFAULT 0,
    "call_outcome" TEXT,
    "qualification_delivery_model" TEXT NOT NULL DEFAULT 'unknown',
    "total_messages_sent" INTEGER NOT NULL DEFAULT 0,
    "total_messages_received" INTEGER NOT NULL DEFAULT 0,
    "response_rate" DECIMAL(5,2),
    "avg_response_time_minutes" INTEGER,
    "qualification_completed_at" TIMESTAMPTZ(6),
    "qualification_completed_by" TEXT,
    "escalation_created_at" TIMESTAMPTZ(6),
    "escalation_resolved_at" TIMESTAMPTZ(6),
    "escalation_resolved_by" TEXT,
    "booked_call_count" INTEGER NOT NULL DEFAULT 0,
    "completed_call_count" INTEGER NOT NULL DEFAULT 0,
    "last_call_booked_at" TIMESTAMPTZ(6),
    "last_consent_verified_at" TIMESTAMPTZ(6),
    "is_compliant" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "conversation_state_pkey" PRIMARY KEY ("conversation_id")
);

-- CreateTable
CREATE TABLE "conversion_examples" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "source_outbound_event_id" UUID NOT NULL,
    "booked_call_label" TEXT,
    "closed_won_label" TEXT,
    "escalation_level" INTEGER NOT NULL DEFAULT 1,
    "structure_signature" TEXT,
    "qualifier_snapshot" JSONB,
    "channel_marker" TEXT NOT NULL DEFAULT 'sms',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversion_examples_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "timestamp" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "report_date" DATE,
    "channel_id" TEXT NOT NULL,
    "channel_name" TEXT,
    "report_type" TEXT NOT NULL,
    "status" "DailyRunStatus" NOT NULL,
    "error_message" TEXT,
    "summary_text" TEXT,
    "full_report" TEXT,
    "duration_ms" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "is_legacy" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "daily_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "draft_suggestions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "prompt_snapshot_hash" TEXT NOT NULL,
    "retrieved_exemplar_ids" JSONB,
    "generated_text" TEXT NOT NULL,
    "lint_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "structural_score" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lint_issues" JSONB,
    "accepted" BOOLEAN NOT NULL DEFAULT false,
    "edited" BOOLEAN NOT NULL DEFAULT false,
    "send_linked_event_id" UUID,
    "raw" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "rejection_reason" TEXT,
    "rejection_feedback" TEXT,
    "rejected_at" TIMESTAMPTZ(6),

    CONSTRAINT "draft_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "goals" (
    "id" VARCHAR(100) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "target" DECIMAL NOT NULL,
    "unit" VARCHAR(50) NOT NULL,
    "period" VARCHAR(20) NOT NULL,
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "goals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inbox_contact_profiles" (
    "contact_key" TEXT NOT NULL,
    "contact_id" TEXT,
    "aloware_contact_id" TEXT,
    "name" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "timezone" TEXT,
    "niche" TEXT,
    "revenue_mix_category" TEXT NOT NULL DEFAULT 'unknown',
    "employment_status" TEXT NOT NULL DEFAULT 'unknown',
    "coaching_interest" TEXT NOT NULL DEFAULT 'unknown',
    "dnc" BOOLEAN NOT NULL DEFAULT false,
    "raw" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "lead_source" TEXT,
    "sequence_id" TEXT,
    "disposition_status_id" TEXT,
    "tags" JSONB,
    "text_authorized" BOOLEAN,
    "is_blocked" BOOLEAN,
    "cnam_city" TEXT,
    "cnam_state" TEXT,
    "cnam_country" TEXT,
    "last_engagement_at" TIMESTAMPTZ(6),
    "inbound_sms_count" INTEGER,
    "outbound_sms_count" INTEGER,
    "inbound_call_count" INTEGER,
    "outbound_call_count" INTEGER,
    "unread_count" INTEGER,
    "lrn_line_type" TEXT,
    "lrn_carrier" TEXT,
    "lrn_city" TEXT,
    "lrn_state" TEXT,
    "lrn_country" TEXT,
    "lrn_last_checked_at" TIMESTAMPTZ(6),

    CONSTRAINT "inbox_contact_profiles_pkey" PRIMARY KEY ("contact_key")
);

-- CreateTable
CREATE TABLE "lead_attribution" (
    "board_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "lead_name" TEXT,
    "contact_key" TEXT,
    "source" TEXT,
    "setter" TEXT,
    "set_by" TEXT,
    "campaign" TEXT,
    "sequence" TEXT,
    "lead_status" TEXT,
    "first_touch_date" DATE,
    "call_date" DATE,
    "closed_date" DATE,
    "item_updated_at" TIMESTAMPTZ(6) NOT NULL,
    "raw" JSONB,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_attribution_pkey" PRIMARY KEY ("board_id","item_id")
);

-- CreateTable
CREATE TABLE "lead_outcomes" (
    "board_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "lead_name" TEXT,
    "contact_key" TEXT,
    "call_date" DATE,
    "setter" TEXT,
    "set_by" TEXT,
    "source" TEXT,
    "stage" TEXT,
    "outcome_label" TEXT,
    "outcome_reason" TEXT,
    "outcome_category" TEXT NOT NULL DEFAULT 'unknown',
    "is_booked" BOOLEAN NOT NULL DEFAULT false,
    "item_updated_at" TIMESTAMPTZ(6) NOT NULL,
    "raw" JSONB,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lead_outcomes_pkey" PRIMARY KEY ("board_id","item_id")
);

-- CreateTable
CREATE TABLE "message_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "created_by" TEXT NOT NULL DEFAULT 'agent',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monday_board_registry" (
    "board_id" TEXT NOT NULL,
    "board_label" TEXT NOT NULL,
    "board_class" TEXT NOT NULL,
    "metric_grain" TEXT NOT NULL,
    "include_in_funnel" BOOLEAN NOT NULL DEFAULT false,
    "include_in_exec" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "owner_team" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "monday_board_registry_pkey" PRIMARY KEY ("board_id")
);

-- CreateTable
CREATE TABLE "monday_booked_call_pushes" (
    "board_id" TEXT NOT NULL,
    "slack_channel_id" TEXT NOT NULL,
    "slack_message_ts" TEXT NOT NULL,
    "setter_bucket" TEXT NOT NULL,
    "monday_item_id" TEXT,
    "status" "MondayBookedCallPushStatus" NOT NULL,
    "error" TEXT,
    "payload_json" JSONB,
    "pushed_at" TIMESTAMPTZ(6),
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "monday_booked_call_pushes_pkey" PRIMARY KEY ("board_id","slack_channel_id","slack_message_ts")
);

-- CreateTable
CREATE TABLE "monday_call_column_history" (
    "board_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "column_id" TEXT NOT NULL,
    "column_title" TEXT,
    "column_type" TEXT,
    "text_value" TEXT,
    "value_json" JSONB,
    "item_updated_at" TIMESTAMPTZ(6) NOT NULL,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monday_call_column_history_pkey" PRIMARY KEY ("board_id","item_id","column_id","item_updated_at")
);

-- CreateTable
CREATE TABLE "monday_call_column_latest" (
    "board_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "column_id" TEXT NOT NULL,
    "column_title" TEXT,
    "column_type" TEXT,
    "text_value" TEXT,
    "value_json" JSONB,
    "item_updated_at" TIMESTAMPTZ(6) NOT NULL,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monday_call_column_latest_pkey" PRIMARY KEY ("board_id","item_id","column_id")
);

-- CreateTable
CREATE TABLE "monday_call_snapshots" (
    "board_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "item_name" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "call_date" DATE,
    "setter" TEXT,
    "stage" TEXT,
    "disposition" TEXT,
    "is_booked" BOOLEAN NOT NULL DEFAULT false,
    "contact_key" TEXT,
    "raw" JSONB,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monday_call_snapshots_pkey" PRIMARY KEY ("board_id","item_id")
);

-- CreateTable
CREATE TABLE "monday_column_mappings" (
    "board_id" TEXT NOT NULL,
    "mapping_json" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "monday_column_mappings_pkey" PRIMARY KEY ("board_id")
);

-- CreateTable
CREATE TABLE "monday_metric_facts" (
    "board_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "metric_date" DATE,
    "metric_owner" TEXT,
    "metric_name" TEXT NOT NULL,
    "metric_value_num" DOUBLE PRECISION,
    "metric_value_text" TEXT,
    "status_value" TEXT,
    "item_updated_at" TIMESTAMPTZ(6) NOT NULL,
    "raw" JSONB,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monday_metric_facts_pkey" PRIMARY KEY ("board_id","item_id","metric_name","item_updated_at")
);

-- CreateTable
CREATE TABLE "monday_sync_state" (
    "board_id" TEXT NOT NULL,
    "cursor" TEXT,
    "last_sync_at" TIMESTAMPTZ(6),
    "status" "MondaySyncStatus",
    "error" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "monday_sync_state_pkey" PRIMARY KEY ("board_id")
);

-- CreateTable
CREATE TABLE "monday_weekly_reports" (
    "week_start" DATE NOT NULL,
    "source_board_id" TEXT,
    "summary_json" JSONB NOT NULL,
    "monday_item_id" TEXT,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "monday_weekly_reports_pkey" PRIMARY KEY ("week_start")
);

-- CreateTable
CREATE TABLE "send_attempts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "conversation_id" UUID NOT NULL,
    "message_body" TEXT NOT NULL,
    "sender_identity" TEXT,
    "line_id" TEXT,
    "from_number" TEXT,
    "allowlist_decision" BOOLEAN NOT NULL DEFAULT false,
    "dnc_decision" BOOLEAN NOT NULL DEFAULT false,
    "idempotency_key" TEXT,
    "status" "SendAttemptStatus" NOT NULL,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "request_payload" JSONB,
    "response_payload" JSONB,
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "send_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_version_decisions" (
    "sequence_label" TEXT NOT NULL,
    "status" "SequenceVersionStatus" NOT NULL,
    "updated_by" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sequence_version_decisions_pkey" PRIMARY KEY ("sequence_label")
);

-- CreateTable
CREATE TABLE "sequence_registry" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "label" TEXT NOT NULL,
    "normalized_label" TEXT NOT NULL,
    "status" "SequenceRegistryStatus" NOT NULL DEFAULT 'active',
    "lead_magnet" TEXT,
    "version_tag" TEXT,
    "owner_rep" TEXT,
    "is_manual_bucket" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "sequence_registry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sequence_aliases" (
    "raw_label" TEXT NOT NULL,
    "normalized_label" TEXT NOT NULL,
    "sequence_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sequence_aliases_pkey" PRIMARY KEY ("raw_label")
);

-- CreateTable
CREATE TABLE "fact_sms_daily" (
    "day" DATE NOT NULL,
    "sequence_id" UUID NOT NULL,
    "rep_id" TEXT NOT NULL,
    "messages_sent" INTEGER NOT NULL DEFAULT 0,
    "unique_contacted" INTEGER NOT NULL DEFAULT 0,
    "replies_received" INTEGER NOT NULL DEFAULT 0,
    "opt_outs" INTEGER NOT NULL DEFAULT 0,
    "reply_rate_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "opt_out_rate_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "booking_signals_sms" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fact_sms_daily_pkey" PRIMARY KEY ("day","sequence_id","rep_id")
);

-- CreateTable
CREATE TABLE "fact_booking_daily" (
    "day" DATE NOT NULL,
    "sequence_id" UUID NOT NULL,
    "rep_id" TEXT NOT NULL,
    "booked_total" INTEGER NOT NULL DEFAULT 0,
    "booked_jack" INTEGER NOT NULL DEFAULT 0,
    "booked_brandon" INTEGER NOT NULL DEFAULT 0,
    "booked_self" INTEGER NOT NULL DEFAULT 0,
    "booked_after_sms_reply" INTEGER NOT NULL DEFAULT 0,
    "booking_rate_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "diagnostic_booking_signals" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fact_booking_daily_pkey" PRIMARY KEY ("day","sequence_id","rep_id")
);

-- CreateTable
CREATE TABLE "fact_lead_quality_daily" (
    "day" DATE NOT NULL,
    "sequence_id" UUID NOT NULL,
    "rep_id" TEXT NOT NULL,
    "leads_count" INTEGER NOT NULL DEFAULT 0,
    "progress_step_0_count" INTEGER NOT NULL DEFAULT 0,
    "progress_step_1_count" INTEGER NOT NULL DEFAULT 0,
    "progress_step_2_count" INTEGER NOT NULL DEFAULT 0,
    "progress_step_3_count" INTEGER NOT NULL DEFAULT 0,
    "progress_step_4_count" INTEGER NOT NULL DEFAULT 0,
    "revenue_mix_mostly_cash" INTEGER NOT NULL DEFAULT 0,
    "revenue_mix_mostly_ins" INTEGER NOT NULL DEFAULT 0,
    "revenue_mix_balanced" INTEGER NOT NULL DEFAULT 0,
    "revenue_mix_unknown" INTEGER NOT NULL DEFAULT 0,
    "employment_full_time" INTEGER NOT NULL DEFAULT 0,
    "employment_part_time" INTEGER NOT NULL DEFAULT 0,
    "employment_unknown" INTEGER NOT NULL DEFAULT 0,
    "coaching_interest_high" INTEGER NOT NULL DEFAULT 0,
    "coaching_interest_medium" INTEGER NOT NULL DEFAULT 0,
    "coaching_interest_low" INTEGER NOT NULL DEFAULT 0,
    "coaching_interest_unknown" INTEGER NOT NULL DEFAULT 0,
    "avg_lead_score" DOUBLE PRECISION,
    "source_bucket_unknown" INTEGER NOT NULL DEFAULT 0,
    "source_bucket_known" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fact_lead_quality_daily_pkey" PRIMARY KEY ("day","sequence_id","rep_id")
);

-- CreateTable
CREATE TABLE "fact_monday_health_daily" (
    "day" DATE NOT NULL,
    "board_id" TEXT NOT NULL,
    "board_class" TEXT NOT NULL,
    "sync_status" TEXT,
    "is_stale" BOOLEAN NOT NULL DEFAULT false,
    "source_coverage_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "campaign_coverage_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "set_by_coverage_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "touchpoints_coverage_pct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "snapshot_count" INTEGER NOT NULL DEFAULT 0,
    "lead_attribution_count" INTEGER NOT NULL DEFAULT 0,
    "metric_fact_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "fact_monday_health_daily_pkey" PRIMARY KEY ("day","board_id")
);

-- CreateTable
CREATE TABLE "setter_activity" (
    "board_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "activity_date" DATE,
    "setter" TEXT,
    "set_by" TEXT,
    "source" TEXT,
    "stage" TEXT,
    "outcome_category" TEXT NOT NULL DEFAULT 'unknown',
    "is_booked" BOOLEAN NOT NULL DEFAULT false,
    "is_closed_won" BOOLEAN NOT NULL DEFAULT false,
    "is_closed_lost" BOOLEAN NOT NULL DEFAULT false,
    "is_bad_timing" BOOLEAN NOT NULL DEFAULT false,
    "is_bad_fit" BOOLEAN NOT NULL DEFAULT false,
    "is_no_show" BOOLEAN NOT NULL DEFAULT false,
    "is_cancelled" BOOLEAN NOT NULL DEFAULT false,
    "item_updated_at" TIMESTAMPTZ(6) NOT NULL,
    "raw" JSONB,
    "synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setter_activity_pkey" PRIMARY KEY ("board_id","item_id")
);

-- CreateTable
CREATE TABLE "setter_feedback_dedupe" (
    "channel_id" TEXT NOT NULL,
    "thread_ts" TEXT NOT NULL,
    "message_ts" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "setter_feedback_dedupe_pkey" PRIMARY KEY ("channel_id","thread_ts")
);

-- CreateTable
CREATE TABLE "sms_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slack_team_id" TEXT NOT NULL,
    "slack_channel_id" TEXT NOT NULL,
    "slack_message_ts" TEXT NOT NULL,
    "event_ts" TIMESTAMPTZ(6) NOT NULL,
    "direction" "SmsDirection" NOT NULL,
    "contact_id" TEXT,
    "contact_phone" TEXT,
    "normalized_contact_key" TEXT,
    "normalized_phone" TEXT,
    "contact_name" TEXT,
    "aloware_user" TEXT,
    "body" TEXT,
    "line" TEXT,
    "sequence" TEXT,
    "sequence_id" UUID,
    "sequence_version_id" UUID,
    "event_role" TEXT,
    "raw" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "conversation_id" UUID,

    CONSTRAINT "sms_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fact_sequence_funnel_daily" (
    "day" DATE NOT NULL,
    "sequence_id" UUID NOT NULL,
    "rep_id" TEXT NOT NULL DEFAULT 'unknown',
    "new_leads_contacted" INTEGER NOT NULL DEFAULT 0,
    "leads_replied" INTEGER NOT NULL DEFAULT 0,
    "qualified_leads" INTEGER NOT NULL DEFAULT 0,
    "booked_calls" INTEGER NOT NULL DEFAULT 0,
    "opt_outs" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fact_sequence_funnel_daily_pkey" PRIMARY KEY ("day","sequence_id","rep_id")
);

-- CreateTable
CREATE TABLE "conversation_journey" (
    "conversation_id" UUID NOT NULL,
    "window_start" TIMESTAMPTZ(6) NOT NULL,
    "window_end" TIMESTAMPTZ(6) NOT NULL,
    "first_outbound_at" TIMESTAMPTZ(6) NOT NULL,
    "first_reply_at" TIMESTAMPTZ(6),
    "first_qualified_at" TIMESTAMPTZ(6),
    "first_booked_at" TIMESTAMPTZ(6),
    "sequence_id" UUID NOT NULL,
    "rep_id" TEXT NOT NULL,
    "reply_latency_minutes" INTEGER,
    "book_latency_days" DECIMAL(8,2),
    "messages_before_reply" INTEGER NOT NULL DEFAULT 0,
    "messages_before_book" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "conversation_journey_pkey" PRIMARY KEY ("conversation_id","window_start")
);

-- CreateTable
CREATE TABLE "fact_attribution_method_daily" (
    "day" DATE NOT NULL,
    "matched_calls" INTEGER NOT NULL DEFAULT 0,
    "manual_direct_calls" INTEGER NOT NULL DEFAULT 0,
    "unattributed_calls" INTEGER NOT NULL DEFAULT 0,
    "sms_phone_match_calls" INTEGER NOT NULL DEFAULT 0,
    "fuzzy_match_calls" INTEGER NOT NULL DEFAULT 0,
    "reply_linked_calls" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fact_attribution_method_daily_pkey" PRIMARY KEY ("day")
);

-- CreateTable
CREATE TABLE "fact_rep_response_daily" (
    "day" DATE NOT NULL,
    "rep_id" TEXT NOT NULL,
    "new_leads_contacted" INTEGER NOT NULL DEFAULT 0,
    "leads_replied" INTEGER NOT NULL DEFAULT 0,
    "booked_calls" INTEGER NOT NULL DEFAULT 0,
    "median_reply_time_minutes" DECIMAL(8,2),
    "median_book_time_days" DECIMAL(8,2),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fact_rep_response_daily_pkey" PRIMARY KEY ("day","rep_id")
);

-- CreateTable
CREATE TABLE "analytics_unresolved_attribution_v" (
    "booked_call_id" UUID NOT NULL,
    "booked_event_ts" TIMESTAMPTZ(6) NOT NULL,
    "attribution_status" TEXT,
    "needs_review" BOOLEAN,
    "review_reason" TEXT,
    "mapper_version" TEXT,
    "conversation_id" UUID,
    "resolved_sequence_id" UUID,
    "resolved_sequence_label" TEXT,
    "created_at" TIMESTAMPTZ(6),

    CONSTRAINT "analytics_unresolved_attribution_v_pkey" PRIMARY KEY ("booked_call_id")
);

-- CreateTable
CREATE TABLE "trend_alerts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "alert_type" VARCHAR(100) NOT NULL,
    "severity" VARCHAR(20) NOT NULL,
    "metric" VARCHAR(100) NOT NULL,
    "message" TEXT NOT NULL,
    "value" DECIMAL,
    "threshold" DECIMAL,
    "acknowledged_at" TIMESTAMPTZ(6),
    "acknowledged_by" VARCHAR(255),
    "created_at" TIMESTAMPTZ(6) DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trend_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_send_preferences" (
    "user_id" TEXT NOT NULL,
    "default_line_id" INTEGER,
    "default_from_number" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "user_send_preferences_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "work_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "WorkItemType" NOT NULL,
    "conversation_id" UUID NOT NULL,
    "rep_id" TEXT,
    "severity" "WorkItemSeverity" NOT NULL DEFAULT 'med',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "due_at" TIMESTAMPTZ(6) NOT NULL,
    "resolved_at" TIMESTAMPTZ(6),
    "resolution" TEXT,
    "source_event_id" UUID,

    CONSTRAINT "work_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_contact_key_key" ON "conversations"("contact_key");

-- CreateIndex
CREATE INDEX "idx_conversations_contact_key" ON "conversations"("contact_key");

-- CreateIndex
CREATE INDEX "idx_conversations_next_followup_due" ON "conversations"("next_followup_due_at");

-- CreateIndex
CREATE INDEX "idx_conversations_rep_last_touch" ON "conversations"("current_rep_id", "last_touch_at" DESC);

-- CreateIndex
CREATE INDEX "idx_conversations_rep_status_touch" ON "conversations"("current_rep_id", "status", "last_touch_at" DESC);

-- CreateIndex
CREATE INDEX "idx_conversations_status" ON "conversations"("status");

-- CreateIndex
CREATE INDEX "idx_actor_directory_role_active" ON "actor_directory"("role", "active");

-- CreateIndex
CREATE INDEX "idx_audit_logs_action" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_booked_call_attribution_conversation_id" ON "booked_call_attribution"("conversation_id");

-- CreateIndex
CREATE INDEX "idx_booked_call_attribution_event_ts" ON "booked_call_attribution"("booked_event_ts" DESC);

-- CreateIndex
CREATE INDEX "idx_booked_call_attribution_setter_final" ON "booked_call_attribution"("setter_final");

-- CreateIndex
CREATE INDEX "idx_attr_review_status_priority_created" ON "attribution_review_queue"("status", "priority", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uniq_attribution_review_queue_booked_call_id" ON "attribution_review_queue"("booked_call_id");

-- CreateIndex
CREATE INDEX "idx_booked_calls_channel_ts" ON "booked_calls"("slack_channel_id", "slack_message_ts");

-- CreateIndex
CREATE INDEX "idx_booked_calls_event_ts" ON "booked_calls"("event_ts" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "booked_calls_slack_channel_id_slack_message_ts_key" ON "booked_calls"("slack_channel_id", "slack_message_ts");

-- CreateIndex
CREATE INDEX "idx_conv_notes_cid" ON "conversation_notes"("conversation_id");

-- CreateIndex
CREATE INDEX "idx_conversation_state_cadence_status" ON "conversation_state"("cadence_status");

-- CreateIndex
CREATE INDEX "idx_conversation_state_coaching_interest" ON "conversation_state"("qualification_coaching_interest");

-- CreateIndex
CREATE INDEX "idx_conversation_state_conversation_id" ON "conversation_state"("conversation_id");

-- CreateIndex
CREATE INDEX "idx_conversation_state_escalation_level" ON "conversation_state"("escalation_level");

-- CreateIndex
CREATE INDEX "idx_conversation_state_objection_tags_gin" ON "conversation_state" USING GIN ("objection_tags");

-- CreateIndex
CREATE UNIQUE INDEX "conversion_examples_source_outbound_event_id_key" ON "conversion_examples"("source_outbound_event_id");

-- CreateIndex
CREATE INDEX "idx_conversion_examples_booked_escalation" ON "conversion_examples"("booked_call_label", "escalation_level");

-- CreateIndex
CREATE INDEX "idx_daily_runs_channel_timestamp" ON "daily_runs"("channel_id", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "idx_daily_runs_legacy_timestamp" ON "daily_runs"("is_legacy", "timestamp" DESC);

-- CreateIndex
CREATE INDEX "idx_daily_runs_timestamp" ON "daily_runs"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "idx_draft_suggestions_conversation_created" ON "draft_suggestions"("conversation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_inbox_contact_profiles_contact_key" ON "inbox_contact_profiles"("contact_key");

-- CreateIndex
CREATE INDEX "idx_inbox_contact_profiles_last_engagement_at" ON "inbox_contact_profiles"("last_engagement_at" DESC);

-- CreateIndex
CREATE INDEX "idx_inbox_contact_profiles_lead_source" ON "inbox_contact_profiles"("lead_source");

-- CreateIndex
CREATE INDEX "idx_inbox_profiles_source_engagement" ON "inbox_contact_profiles"("lead_source", "last_engagement_at" DESC);

-- CreateIndex
CREATE INDEX "idx_inbox_profiles_auth_blocked_engagement" ON "inbox_contact_profiles"("text_authorized", "is_blocked", "last_engagement_at" DESC);

-- CreateIndex
CREATE INDEX "idx_inbox_contact_profiles_sequence_id" ON "inbox_contact_profiles"("sequence_id");

-- CreateIndex
CREATE INDEX "idx_lead_attribution_board_call_date" ON "lead_attribution"("board_id", "call_date" DESC);

-- CreateIndex
CREATE INDEX "idx_lead_attribution_source" ON "lead_attribution"("source");

-- CreateIndex
CREATE INDEX "idx_lead_outcomes_board_call_date" ON "lead_outcomes"("board_id", "call_date" DESC);

-- CreateIndex
CREATE INDEX "idx_lead_outcomes_category_call_date" ON "lead_outcomes"("outcome_category", "call_date" DESC);

-- CreateIndex
CREATE INDEX "idx_lead_outcomes_setter_call_date" ON "lead_outcomes"("setter", "call_date" DESC);

-- CreateIndex
CREATE INDEX "idx_monday_board_registry_active_class" ON "monday_board_registry"("active", "board_class");

-- CreateIndex
CREATE INDEX "idx_monday_booked_call_pushes_status_updated" ON "monday_booked_call_pushes"("status", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_monday_pushes_pending" ON "monday_booked_call_pushes"("board_id", "status", "updated_at" DESC) WHERE (status != 'synced');

-- CreateIndex
CREATE INDEX "idx_monday_call_column_history_board_column_updated" ON "monday_call_column_history"("board_id", "column_id", "item_updated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_monday_call_column_history_board_item_updated" ON "monday_call_column_history"("board_id", "item_id", "item_updated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_monday_call_column_latest_board_column" ON "monday_call_column_latest"("board_id", "column_id");

-- CreateIndex
CREATE INDEX "idx_monday_call_column_latest_board_item" ON "monday_call_column_latest"("board_id", "item_id");

-- CreateIndex
CREATE INDEX "idx_monday_call_snapshots_board_updated" ON "monday_call_snapshots"("board_id", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_monday_call_snapshots_call_date" ON "monday_call_snapshots"("call_date");

-- CreateIndex
CREATE INDEX "idx_monday_metric_facts_board_date" ON "monday_metric_facts"("board_id", "metric_date" DESC);

-- CreateIndex
CREATE INDEX "idx_monday_facts_metric_board_date" ON "monday_metric_facts"("metric_name", "board_id", "metric_date" DESC);

-- CreateIndex
CREATE INDEX "idx_monday_metric_facts_metric_name_date" ON "monday_metric_facts"("metric_name", "metric_date" DESC);

-- CreateIndex
CREATE INDEX "idx_monday_metric_facts_owner_date" ON "monday_metric_facts"("metric_owner", "metric_date" DESC);

-- CreateIndex
CREATE INDEX "idx_monday_sync_state_updated_at" ON "monday_sync_state"("updated_at" DESC);

-- CreateIndex
CREATE INDEX "idx_monday_weekly_reports_week_start" ON "monday_weekly_reports"("week_start" DESC);

-- CreateIndex
CREATE INDEX "idx_send_attempts_conversation_created" ON "send_attempts"("conversation_id", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_send_attempts_conversation_status_created" ON "send_attempts"("conversation_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_send_attempts_pending" ON "send_attempts"("conversation_id", "status", "created_at" DESC) WHERE (status IN ('blocked', 'queued', 'failed'));

-- CreateIndex
CREATE UNIQUE INDEX "uniq_send_attempts_conversation_idempotency" ON "send_attempts"("conversation_id", "idempotency_key") WHERE (idempotency_key IS NOT NULL);

-- CreateIndex
CREATE INDEX "idx_sequence_version_decisions_status_updated" ON "sequence_version_decisions"("status", "updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "sequence_registry_normalized_label_key" ON "sequence_registry"("normalized_label");

-- CreateIndex
CREATE INDEX "idx_sequence_registry_status" ON "sequence_registry"("status");

-- CreateIndex
CREATE INDEX "idx_sequence_registry_manual_bucket" ON "sequence_registry"("is_manual_bucket");

-- CreateIndex
CREATE INDEX "idx_sequence_aliases_sequence_id" ON "sequence_aliases"("sequence_id");

-- CreateIndex
CREATE INDEX "idx_sequence_aliases_normalized_label" ON "sequence_aliases"("normalized_label");

-- CreateIndex
CREATE INDEX "idx_fact_sms_daily_day" ON "fact_sms_daily"("day");

-- CreateIndex
CREATE INDEX "idx_fact_sms_daily_sequence_day" ON "fact_sms_daily"("sequence_id", "day");

-- CreateIndex
CREATE INDEX "idx_fact_sms_daily_rep_day" ON "fact_sms_daily"("rep_id", "day");

-- CreateIndex
CREATE INDEX "idx_fact_booking_daily_day" ON "fact_booking_daily"("day");

-- CreateIndex
CREATE INDEX "idx_fact_booking_daily_sequence_day" ON "fact_booking_daily"("sequence_id", "day");

-- CreateIndex
CREATE INDEX "idx_fact_booking_daily_rep_day" ON "fact_booking_daily"("rep_id", "day");

-- CreateIndex
CREATE INDEX "idx_fact_lead_quality_daily_day" ON "fact_lead_quality_daily"("day");

-- CreateIndex
CREATE INDEX "idx_fact_lead_quality_daily_sequence_day" ON "fact_lead_quality_daily"("sequence_id", "day");

-- CreateIndex
CREATE INDEX "idx_fact_lead_quality_daily_rep_day" ON "fact_lead_quality_daily"("rep_id", "day");

-- CreateIndex
CREATE INDEX "idx_fact_monday_health_daily_day" ON "fact_monday_health_daily"("day");

-- CreateIndex
CREATE INDEX "idx_fact_monday_health_daily_class_day" ON "fact_monday_health_daily"("board_class", "day");

-- CreateIndex
CREATE INDEX "idx_fact_monday_health_daily_status_day" ON "fact_monday_health_daily"("sync_status", "day");

-- CreateIndex
CREATE INDEX "idx_setter_activity_category_activity_date" ON "setter_activity"("outcome_category", "activity_date" DESC);

-- CreateIndex
CREATE INDEX "idx_setter_activity_setter_activity_date" ON "setter_activity"("setter", "activity_date" DESC);

-- CreateIndex
CREATE INDEX "idx_setter_feedback_dedupe_created_at" ON "setter_feedback_dedupe"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_sms_events_contact_id_event_ts" ON "sms_events"("contact_id", "event_ts" DESC);

-- CreateIndex
CREATE INDEX "idx_sms_events_contact_phone_event_ts" ON "sms_events"("contact_phone", "event_ts" DESC);

-- CreateIndex
CREATE INDEX "idx_sms_events_norm_contact_key_event_ts" ON "sms_events"("normalized_contact_key", "event_ts" DESC);

-- CreateIndex
CREATE INDEX "idx_sms_events_norm_phone_event_ts" ON "sms_events"("normalized_phone", "event_ts" DESC);

-- CreateIndex
CREATE INDEX "idx_sms_events_conversation_event_ts" ON "sms_events"("conversation_id", "event_ts" DESC);

-- CreateIndex
CREATE INDEX "idx_sms_events_sequence_event_ts" ON "sms_events"("sequence", "event_ts" DESC);

-- CreateIndex
CREATE INDEX "idx_sms_events_sequence_id_event_ts" ON "sms_events"("sequence_id", "event_ts" DESC);

-- CreateIndex
CREATE INDEX "idx_sms_events_sequence_version_event_ts" ON "sms_events"("sequence_version_id", "event_ts" DESC);

-- CreateIndex
CREATE INDEX "idx_sms_events_role_event_ts" ON "sms_events"("event_role", "event_ts" DESC);

-- CreateIndex
CREATE INDEX "idx_sms_events_event_ts" ON "sms_events"("event_ts" DESC);

-- CreateIndex
CREATE INDEX "idx_sms_events_contact_direction_ts" ON "sms_events"("contact_id", "direction", "event_ts" DESC);

-- CreateIndex
CREATE INDEX "idx_sms_events_norm_phone_direction_ts" ON "sms_events"("normalized_phone", "direction", "event_ts" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "sms_events_slack_channel_id_slack_message_ts_key" ON "sms_events"("slack_channel_id", "slack_message_ts");

-- CreateIndex
CREATE INDEX "idx_fact_sequence_funnel_daily_sequence_day" ON "fact_sequence_funnel_daily"("sequence_id", "day");

-- CreateIndex
CREATE INDEX "idx_fact_sequence_funnel_daily_rep_day" ON "fact_sequence_funnel_daily"("rep_id", "day");

-- CreateIndex
CREATE INDEX "idx_conversation_journey_window_start" ON "conversation_journey"("window_start");

-- CreateIndex
CREATE INDEX "idx_conversation_journey_sequence_window" ON "conversation_journey"("sequence_id", "window_start");

-- CreateIndex
CREATE INDEX "idx_conversation_journey_rep_window" ON "conversation_journey"("rep_id", "window_start");

-- CreateIndex
CREATE INDEX "idx_fact_attribution_method_daily_day" ON "fact_attribution_method_daily"("day");

-- CreateIndex
CREATE INDEX "idx_fact_rep_response_daily_rep_day" ON "fact_rep_response_daily"("rep_id", "day");

-- CreateIndex
CREATE INDEX "idx_trend_alerts_created_at" ON "trend_alerts"("created_at" DESC);

-- CreateIndex
CREATE INDEX "idx_user_send_preferences_updated" ON "user_send_preferences"("updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "uniq_open_needs_reply_per_conversation" ON "work_items"("conversation_id") WHERE ((type = 'needs_reply'::"WorkItemType") AND (resolved_at IS NULL));

-- CreateIndex
CREATE INDEX "idx_work_items_rep_resolved_due" ON "work_items"("rep_id", "resolved_at", "due_at");

-- CreateIndex
CREATE INDEX "idx_work_items_type_resolved_due" ON "work_items"("type", "resolved_at", "due_at");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_contact_key_fkey" FOREIGN KEY ("contact_key") REFERENCES "inbox_contact_profiles"("contact_key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booked_call_reactions" ADD CONSTRAINT "booked_call_reactions_booked_call_id_fkey" FOREIGN KEY ("booked_call_id") REFERENCES "booked_calls"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "conversation_notes" ADD CONSTRAINT "conversation_notes_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "conversation_state" ADD CONSTRAINT "conversation_state_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "conversion_examples" ADD CONSTRAINT "conversion_examples_source_outbound_event_id_fkey" FOREIGN KEY ("source_outbound_event_id") REFERENCES "sms_events"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "draft_suggestions" ADD CONSTRAINT "draft_suggestions_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "draft_suggestions" ADD CONSTRAINT "draft_suggestions_send_linked_event_id_fkey" FOREIGN KEY ("send_linked_event_id") REFERENCES "sms_events"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "send_attempts" ADD CONSTRAINT "send_attempts_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sequence_aliases" ADD CONSTRAINT "sequence_aliases_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "sequence_registry"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fact_sms_daily" ADD CONSTRAINT "fact_sms_daily_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "sequence_registry"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fact_booking_daily" ADD CONSTRAINT "fact_booking_daily_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "sequence_registry"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "fact_lead_quality_daily" ADD CONSTRAINT "fact_lead_quality_daily_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "sequence_registry"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sms_events" ADD CONSTRAINT "fk_sms_events_conversation" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "sms_events" ADD CONSTRAINT "sms_events_sequence_id_fkey" FOREIGN KEY ("sequence_id") REFERENCES "sequence_registry"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "work_items" ADD CONSTRAINT "work_items_source_event_id_fkey" FOREIGN KEY ("source_event_id") REFERENCES "sms_events"("id") ON DELETE SET NULL ON UPDATE NO ACTION;

