-- Unified Schema Migration Script
-- This script migrates from divergent legacy and modern schemas to unified schema
-- Run this after backing up the database

-- Step 1: Add missing enum values
ALTER TYPE "SmsDirection" ADD VALUE IF NOT EXISTS 'unknown';

-- Step 2: Create new tables for legacy models not in modern schema
-- (Tables will be created by Prisma migration)

-- Step 3: Data migration for inbox_contact_profiles
-- Migrate from legacy contact_id primary key to contact_key
INSERT INTO inbox_contact_profiles (
  contact_key,
  contact_id,
  name,
  phone,
  email,
  lead_source,
  text_authorized,
  is_blocked,
  last_engagement_at,
  created_at,
  updated_at,
  tcpa_consent_status,
  tcpa_consent_date,
  tcpa_consent_method,
  dnc_list_checked_at,
  dnc_list_source,
  gdpr_consent_status,
  gdpr_consent_date,
  last_consent_update_by,
  consent_update_reason
)
SELECT
  COALESCE(contact_key, contact_id::text) as contact_key,
  contact_id,
  name,
  phone,
  email,
  lead_source,
  text_authorized,
  is_blocked,
  last_engagement_at,
  created_at,
  updated_at,
  tcpa_consent_status,
  tcpa_consent_date,
  tcpa_consent_method,
  dnc_list_checked_at,
  dnc_list_source,
  gdpr_consent_status,
  gdpr_consent_date,
  last_consent_update_by,
  consent_update_reason
FROM inbox_contact_profiles_legacy
ON CONFLICT (contact_key) DO NOTHING;

-- Step 4: Data migration for conversations
INSERT INTO conversations (
  id,
  contact_key,
  contact_phone,
  contact_id,
  current_rep_id,
  status,
  last_inbound_at,
  last_outbound_at,
  last_touch_at,
  created_at,
  updated_at,
  has_active_consent,
  consent_verified_at,
  is_opted_out,
  opted_out_at,
  opted_out_reason,
  is_dnc_flagged,
  dnc_checked_at
)
SELECT
  id,
  contact_key,
  contact_phone,
  contact_id,
  current_rep_id,
  CASE
    WHEN status = 'ACTIVE' THEN 'open'::ConversationStatus
    ELSE 'open'::ConversationStatus
  END as status,
  last_inbound_at,
  last_outbound_at,
  last_touch_at,
  created_at,
  updated_at,
  has_active_consent,
  consent_verified_at,
  is_opted_out,
  opted_out_at,
  opted_out_reason,
  is_dnc_flagged,
  dnc_checked_at
FROM conversations_legacy
ON CONFLICT (id) DO NOTHING;

-- Step 5: Data migration for sms_events
INSERT INTO sms_events (
  id,
  slack_team_id,
  slack_channel_id,
  slack_message_ts,
  event_ts,
  direction,
  contact_id,
  contact_phone,
  contact_name,
  aloware_user,
  body,
  line,
  sequence,
  raw,
  created_at,
  conversation_id,
  sequence_id,
  normalized_contact_key,
  normalized_phone,
  sequence_version_id,
  event_role,
  recorded_at,
  last_modified_at,
  was_compliant,
  compliance_notes,
  delivery_status,
  delivery_timestamp,
  carrier_code,
  carrier_message,
  contains_opt_out_keyword,
  message_type,
  campaign_id
)
SELECT
  id,
  slack_team_id,
  slack_channel_id,
  slack_message_ts,
  event_ts,
  direction,
  contact_id,
  contact_phone,
  normalized_contact_key,
  contact_name,
  aloware_user,
  body,
  line,
  sequence,
  sequence_id,
  sequence_version_id,
  event_role,
  raw,
  created_at,
  conversation_id,
  was_compliant,
  compliance_notes,
  delivery_status,
  delivery_timestamp,
  carrier_code,
  carrier_message,
  contains_opt_out_keyword,
  message_type,
  campaign_id,
  normalized_contact_key,
  normalized_phone,
  sequence_version_id,
  event_role,
  recorded_at,
  last_modified_at
FROM sms_events_legacy
ON CONFLICT (id) DO NOTHING;

-- Step 6: Data migration for send_attempts
INSERT INTO send_attempts (
  id,
  conversation_id,
  message_body,
  sender_identity,
  line_id,
  from_number,
  allowlist_decision,
  dnc_decision,
  idempotency_key,
  retry_count,
  request_payload,
  response_payload,
  error_message,
  created_at,
  status,
  compliance_check_passed,
  compliance_check_details,
  delivery_status,
  delivery_timestamp,
  carrier_error_code,
  carrier_error_message,
  opt_out_detected,
  opt_out_timestamp
)
SELECT
  id,
  conversation_id,
  body,
  NULL as sender_identity,
  NULL as line_id,
  to_phone,
  compliance_check_passed,
  false as dnc_decision,
  idempotency_key,
  0 as retry_count,
  NULL as request_payload,
  NULL as response_payload,
  NULL as error_message,
  created_at,
  CASE
    WHEN status = 'pending' THEN 'pending'::SendAttemptStatus
    WHEN status = 'sent' THEN 'sent'::SendAttemptStatus
    ELSE 'failed'::SendAttemptStatus
  END as status,
  compliance_check_passed,
  compliance_check_details,
  delivery_status,
  delivery_timestamp,
  carrier_error_code,
  carrier_error_message,
  opt_out_detected,
  opt_out_timestamp
FROM send_attempts_legacy
ON CONFLICT (id) DO NOTHING;

-- Step 7: Migrate modern schema data (should already be compatible)
-- Modern tables like monday_*, fact_*, etc. should be directly compatible

-- Step 8: Update foreign keys and relations
-- This will be handled by Prisma migration

-- Step 9: Clean up legacy tables (after verification)
-- DROP TABLE IF EXISTS inbox_contact_profiles_legacy;
-- DROP TABLE IF EXISTS conversations_legacy;
-- DROP TABLE IF EXISTS sms_events_legacy;
-- DROP TABLE IF EXISTS send_attempts_legacy;

-- Verification queries
-- Run these after migration to verify data integrity

-- SELECT COUNT(*) FROM inbox_contact_profiles;
-- SELECT COUNT(*) FROM conversations;
-- SELECT COUNT(*) FROM sms_events;
-- SELECT COUNT(*) FROM send_attempts;

-- Check for orphaned records
-- SELECT * FROM sms_events WHERE conversation_id IS NOT NULL AND conversation_id NOT IN (SELECT id FROM conversations);
-- SELECT * FROM send_attempts WHERE conversation_id NOT IN (SELECT id FROM conversations);