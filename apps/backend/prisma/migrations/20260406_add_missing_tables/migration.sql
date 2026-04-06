-- Add missing tables that exist in schema but not in production database

-- sequenceAliases table (referenced by sequence-registry.ts)
CREATE TABLE IF NOT EXISTS "sequenceAliases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "rawLabel" TEXT NOT NULL,
    "normalizedLabel" TEXT NOT NULL,
    "sequenceId" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "sequenceAliases_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "sequenceAliases_rawLabel_key" ON "sequenceAliases"("rawLabel");
CREATE INDEX IF NOT EXISTS "idx_sequenceAliases_sequenceId" ON "sequenceAliases"("sequenceId");
CREATE INDEX IF NOT EXISTS "idx_sequenceAliases_normalizedLabel" ON "sequenceAliases"("normalizedLabel");

-- booked_call_attribution table (referenced by attribution-health.ts)
CREATE TABLE IF NOT EXISTS "booked_call_attribution" (
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
    "hubspot_contact_id" TEXT,
    "lead_score" DECIMAL,
    "lead_score_source" TEXT,
    "mapper_version" TEXT NOT NULL DEFAULT 'v1.0',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_sequence_id" UUID,
    "resolved_sequence_label" TEXT,
    "attribution_path" TEXT,
    "matched_via_phone" BOOLEAN NOT NULL DEFAULT false,
    "matched_via_fuzzy" BOOLEAN NOT NULL DEFAULT false,
    "matched_via_reply_link" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "booked_call_attribution_pkey" PRIMARY KEY ("booked_call_id")
);

CREATE INDEX IF NOT EXISTS "idx_booked_call_attribution_conversation_id" ON "booked_call_attribution"("conversation_id");
CREATE INDEX IF NOT EXISTS "idx_booked_call_attribution_event_ts" ON "booked_call_attribution"("booked_event_ts" DESC);
CREATE INDEX IF NOT EXISTS "idx_booked_call_attribution_setter_final" ON "booked_call_attribution"("setter_final");

-- attribution_review_queue table (referenced by attribution-review-queue.ts)
CREATE TABLE IF NOT EXISTS "attribution_review_queue" (
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
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "attribution_review_queue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_attribution_review_queue_booked_call_id" ON "attribution_review_queue"("booked_call_id");
CREATE INDEX IF NOT EXISTS "idx_attr_review_status_priority_created" ON "attribution_review_queue"("status", "priority", "created_at" DESC);
