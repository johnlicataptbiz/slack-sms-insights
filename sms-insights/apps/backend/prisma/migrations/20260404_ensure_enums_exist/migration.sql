-- EnsureEnumExistence
-- Safely create all PostgreSQL enum types if they don't already exist.
-- Required because 0_init migration uses plain TEXT columns and enums
-- may not exist if production was initialized before 20260330_baseline.

-- SmsDirection
DO $$ BEGIN
  CREATE TYPE "SmsDirection" AS ENUM ('inbound', 'outbound', 'unknown');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ConversationStatus
DO $$ BEGIN
  CREATE TYPE "ConversationStatus" AS ENUM ('open', 'closed', 'dnc');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- CadenceStatus
DO $$ BEGIN
  CREATE TYPE "CadenceStatus" AS ENUM ('idle', 'podcast_sent', 'call_offered', 'nurture_pool');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- DailyRunStatus
DO $$ BEGIN
  CREATE TYPE "DailyRunStatus" AS ENUM ('success', 'error', 'pending');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- MondaySyncStatus
DO $$ BEGIN
  CREATE TYPE "MondaySyncStatus" AS ENUM ('idle', 'running', 'success', 'error');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- MondayBookedCallPushStatus
DO $$ BEGIN
  CREATE TYPE "MondayBookedCallPushStatus" AS ENUM ('pending', 'synced', 'error', 'skipped');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- SendAttemptStatus
DO $$ BEGIN
  CREATE TYPE "SendAttemptStatus" AS ENUM ('blocked', 'queued', 'sent', 'failed', 'duplicate');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- SequenceVersionStatus
DO $$ BEGIN
  CREATE TYPE "SequenceVersionStatus" AS ENUM ('active', 'testing', 'rewrite', 'archived');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- WorkItemSeverity
DO $$ BEGIN
  CREATE TYPE "WorkItemSeverity" AS ENUM ('low', 'med', 'high');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- WorkItemType
DO $$ BEGIN
  CREATE TYPE "WorkItemType" AS ENUM ('needs_reply', 'follow_up', 'hot_lead');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- SequenceRegistryStatus
DO $$ BEGIN
  CREATE TYPE "SequenceRegistryStatus" AS ENUM ('active', 'inactive');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;