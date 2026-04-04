-- DB-008: Create ALL missing enum types required by Prisma schema
-- Date: 2026-04-04
-- Fixes: PrismaClientKnownRequestError for missing enum types
-- Referenced in deploy-migrations.ts REQUIRED_ENUMS list

BEGIN;

-- 1. SmsDirection (used by sms_events.direction)
DO $$ BEGIN
  CREATE TYPE "SmsDirection" AS ENUM ('inbound', 'outbound', 'unknown');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 2. ConversationStatus (used by conversations.status)
DO $$ BEGIN
  CREATE TYPE "ConversationStatus" AS ENUM ('open', 'closed', 'dnc');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 3. CadenceStatus (used by conversation_state.cadence_status)
DO $$ BEGIN
  CREATE TYPE "CadenceStatus" AS ENUM ('idle', 'podcast_sent', 'call_offered', 'nurture_pool');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 4. DailyRunStatus (used by daily_runs.status)
DO $$ BEGIN
  CREATE TYPE "DailyRunStatus" AS ENUM ('success', 'error', 'pending');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 5. MondayBookedCallPushStatus (used by monday_booked_call_pushes.status)
DO $$ BEGIN
  CREATE TYPE "MondayBookedCallPushStatus" AS ENUM ('pending', 'synced', 'error', 'skipped');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 6. MondaySyncStatus (used by monday_sync_state.status)
DO $$ BEGIN
  CREATE TYPE "MondaySyncStatus" AS ENUM ('idle', 'running', 'success', 'error');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 7. SendAttemptStatus (used by send_attempts.status)
DO $$ BEGIN
  CREATE TYPE "SendAttemptStatus" AS ENUM ('blocked', 'queued', 'sent', 'failed', 'duplicate');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 8. SequenceRegistryStatus (used by sequence_registry.status)
DO $$ BEGIN
  CREATE TYPE "SequenceRegistryStatus" AS ENUM ('active', 'inactive');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 9. SequenceVersionStatus (used by sequence_versions.status)
DO $$ BEGIN
  CREATE TYPE "SequenceVersionStatus" AS ENUM ('active', 'testing', 'rewrite', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 10. WorkItemSeverity (used by work_items.severity)
DO $$ BEGIN
  CREATE TYPE "WorkItemSeverity" AS ENUM ('low', 'med', 'high');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- 11. WorkItemType (used by work_items.type)
DO $$ BEGIN
  CREATE TYPE "WorkItemType" AS ENUM ('needs_reply', 'follow_up', 'hot_lead');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Convert TEXT columns to enum types where applicable
-- conversations.status -> ConversationStatus
DO $$
DECLARE
  col_type TEXT;
BEGIN
  SELECT data_type INTO col_type
  FROM information_schema.columns
  WHERE table_name = 'conversations' AND column_name = 'status';

  IF col_type = 'text' OR col_type = 'character varying' THEN
    ALTER TABLE conversations
      ALTER COLUMN status TYPE "ConversationStatus"
      USING status::"ConversationStatus";
  END IF;
END $$;

-- Ensure defaults are set
ALTER TABLE conversations ALTER COLUMN status SET DEFAULT 'open';

COMMIT;
