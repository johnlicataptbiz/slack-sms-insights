-- Phase 3: Audit & Temporal Tracking
-- Target: Add created_at/updated_at columns to core tables for audit trail and reconciliation

-- =======================
-- 1. SMS EVENT AUDIT TRAIL
-- =======================

-- Track when each SMS event was recorded in system (separate from message timestamp)
-- Enables reconciliation between received_at event and system ingestion time
ALTER TABLE "sms_events"
ADD COLUMN "recorded_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Track last modification for audit purposes
ALTER TABLE "sms_events"
ADD COLUMN "last_modified_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- =======================
-- 2. CONTACT PROFILE AUDIT TRAIL
-- =======================

-- Track when profile was last enriched/updated from external source
ALTER TABLE "inbox_contact_profiles"
ADD COLUMN "profile_updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- Track profile enrichment/sync timestamp (separate from last engagement)
ALTER TABLE "inbox_contact_profiles"
ADD COLUMN "profile_synced_at" TIMESTAMP WITH TIME ZONE;

-- =======================
-- 3. MONDAY.COM SYNC TRACKING
-- =======================

-- Better tracking of Monday board sync cycles
-- Indicates when this board was last successfully synced from Monday.com
ALTER TABLE "monday_board_registry"
ADD COLUMN "last_sync_completed_at" TIMESTAMP WITH TIME ZONE;

-- Indicates when sync cycle started (to measure sync duration)
ALTER TABLE "monday_board_registry"
ADD COLUMN "last_sync_started_at" TIMESTAMP WITH TIME ZONE;

-- Track sync error context with timestamp
ALTER TABLE "monday_board_registry"
ADD COLUMN "last_sync_error_at" TIMESTAMP WITH TIME ZONE;

-- =======================
-- 4. CONTACT ENRICHMENT TIMESTAMP
-- =======================

-- Track when each contact was added/discovered
-- Helps identify stale contacts and enrichment needs
ALTER TABLE "inbox_contact_profiles"
ADD COLUMN "discovered_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;

-- =======================
-- 5. CONVERSATION ENGAGEMENT TRACKING
-- =======================

-- More precise first contact timestamp (separate from created_at if different)
-- Helps identify true first touch vs system creation
ALTER TABLE "conversations"
ADD COLUMN "first_engagement_at" TIMESTAMP WITH TIME ZONE;

-- Tracks when conversation was last modified (distinct from last touch)
ALTER TABLE "conversations"
ADD COLUMN "metadata_updated_at" TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP;
