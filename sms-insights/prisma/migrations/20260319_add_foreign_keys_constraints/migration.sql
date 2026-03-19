-- Phase 2: Critical Data Integrity Fix
-- Backfill and enforce NOT NULL on sms_events.body (critical for message content)

-- First, backfill NULL sms_events.body values with placeholder
-- (20 records found; likely system-generated or legacy imports)
UPDATE "sms_events" 
SET "body" = '[No message body]' 
WHERE "body" IS NULL;

-- sms_events.body is the actual message content; require it moving forward
ALTER TABLE "sms_events"
ALTER COLUMN "body" SET NOT NULL;
