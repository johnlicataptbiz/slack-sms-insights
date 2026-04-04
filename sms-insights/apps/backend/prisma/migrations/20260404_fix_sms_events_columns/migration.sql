-- FixSmsEventsColumns
-- Align production sms_events table with current schema.prisma (post c5170454).
-- Drops indexes on removed columns, drops old columns, adds new columns.

-- Drop indexes referencing removed columns (normalized_contact_key, normalized_phone, sequence_version_id, event_role)
DROP INDEX IF EXISTS "idx_sms_events_norm_contact_key_event_ts";
DROP INDEX IF EXISTS "idx_sms_events_norm_phone_event_ts";
DROP INDEX IF EXISTS "idx_sms_events_sequence_version_event_ts";
DROP INDEX IF EXISTS "idx_sms_events_role_event_ts";
DROP INDEX IF EXISTS "idx_sms_events_norm_phone_direction_ts";

-- Drop old columns that were removed in c5170454
ALTER TABLE "sms_events" DROP COLUMN IF EXISTS "normalized_contact_key";
ALTER TABLE "sms_events" DROP COLUMN IF EXISTS "normalized_phone";
ALTER TABLE "sms_events" DROP COLUMN IF EXISTS "sequence_version_id";
ALTER TABLE "sms_events" DROP COLUMN IF EXISTS "event_role";
ALTER TABLE "sms_events" DROP COLUMN IF EXISTS "recorded_at";
ALTER TABLE "sms_events" DROP COLUMN IF EXISTS "last_modified_at";

-- Change direction column from SmsDirection enum to plain TEXT (nullable-safe)
-- First drop default if any, then change type
ALTER TABLE "sms_events" ALTER COLUMN "direction" DROP DEFAULT;
ALTER TABLE "sms_events" ALTER COLUMN "direction" TYPE TEXT USING "direction"::TEXT;

-- Add new columns added in c5170454
ALTER TABLE "sms_events" ADD COLUMN IF NOT EXISTS "delivery_status" TEXT;
ALTER TABLE "sms_events" ADD COLUMN IF NOT EXISTS "delivered_at" TIMESTAMPTZ(6);
ALTER TABLE "sms_events" ADD COLUMN IF NOT EXISTS "read_at" TIMESTAMPTZ(6);
ALTER TABLE "sms_events" ADD COLUMN IF NOT EXISTS "media_urls" JSONB;
ALTER TABLE "sms_events" ADD COLUMN IF NOT EXISTS "link_clicks" INTEGER;
ALTER TABLE "sms_events" ADD COLUMN IF NOT EXISTS "ai_classification" TEXT;
ALTER TABLE "sms_events" ADD COLUMN IF NOT EXISTS "sentiment_score" DECIMAL;
ALTER TABLE "sms_events" ADD COLUMN IF NOT EXISTS "is_booking_signal" BOOLEAN;
ALTER TABLE "sms_events" ADD COLUMN IF NOT EXISTS "thread_id" TEXT;
ALTER TABLE "sms_events" ADD COLUMN IF NOT EXISTS "parent_event_id" UUID;

-- Ensure body column is NOT NULL (matches current schema)
-- Note: Only safe if all existing rows have non-null body values
UPDATE "sms_events" SET "body" = '' WHERE "body" IS NULL;
ALTER TABLE "sms_events" ALTER COLUMN "body" SET NOT NULL;

-- Ensure direction column is NOT NULL (matches current schema)
UPDATE "sms_events" SET "direction" = 'unknown' WHERE "direction" IS NULL;
ALTER TABLE "sms_events" ALTER COLUMN "direction" SET NOT NULL;