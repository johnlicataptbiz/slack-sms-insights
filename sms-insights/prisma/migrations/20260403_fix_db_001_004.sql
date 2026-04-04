-- DB-001 through DB-004 Completion Migration
-- Fixes remaining gaps in database infrastructure
-- Date: 2026-04-03

BEGIN;

-- =====================================================
-- DB-001: Fix Foreign Keys
-- =====================================================

-- Fix sms_events foreign key to use CASCADE instead of SET NULL
-- First, drop the existing constraint
ALTER TABLE sms_events DROP CONSTRAINT IF EXISTS fk_sms_events_conversation;

-- Re-add with CASCADE
ALTER TABLE sms_events ADD CONSTRAINT fk_sms_events_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

-- =====================================================
-- DB-002: Add Missing Indexes
-- =====================================================

-- sms_events indexes (add only if not exists)
CREATE INDEX IF NOT EXISTS idx_sms_events_conversation_id ON sms_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_sms_events_event_ts ON sms_events(event_ts DESC);
CREATE INDEX IF NOT EXISTS idx_sms_events_direction_created ON sms_events(direction, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sms_events_contact_key ON sms_events(normalized_contact_key);
CREATE INDEX IF NOT EXISTS idx_sms_events_conv_ts ON sms_events(conversation_id, event_ts DESC);

-- send_attempts indexes
CREATE INDEX IF NOT EXISTS idx_send_attempts_conversation_id ON send_attempts(conversation_id);
CREATE INDEX IF NOT EXISTS idx_send_attempts_status_created ON send_attempts(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_send_attempts_idempotency ON send_attempts(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_send_attempts_conv_status ON send_attempts(conversation_id, status);

-- audit_logs indexes
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action, created_at DESC);

-- conversations indexes
CREATE INDEX IF NOT EXISTS idx_conversations_contact_key ON conversations(contact_key);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_rep_id ON conversations(current_rep_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_touch ON conversations(last_touch_at DESC);

-- conversation_state indexes
CREATE INDEX IF NOT EXISTS idx_conv_state_conversation_id ON conversation_state(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_state_cadence ON conversation_state(cadence_status);
CREATE INDEX IF NOT EXISTS idx_conv_state_escalation ON conversation_state(escalation_level);

-- work_items indexes
CREATE INDEX IF NOT EXISTS idx_work_items_conversation_id ON work_items(conversation_id);
CREATE INDEX IF NOT EXISTS idx_work_items_rep_id ON work_items(rep_id);
CREATE INDEX IF NOT EXISTS idx_work_items_unresolved ON work_items(resolved_at) WHERE resolved_at IS NULL;

-- booked_calls indexes
CREATE INDEX IF NOT EXISTS idx_booked_calls_conversation_id ON booked_calls(conversation_id);
CREATE INDEX IF NOT EXISTS idx_booked_calls_event_ts ON booked_calls(event_ts DESC);

-- conversation_notes indexes
CREATE INDEX IF NOT EXISTS idx_conv_notes_conversation_id ON conversation_notes(conversation_id);

-- inbox_contact_profiles indexes
CREATE INDEX IF NOT EXISTS idx_contact_profiles_contact_key ON inbox_contact_profiles(contact_key);
CREATE INDEX IF NOT EXISTS idx_contact_profiles_phone ON inbox_contact_profiles(phone);
CREATE INDEX IF NOT EXISTS idx_contact_profiles_dnc ON inbox_contact_profiles(dnc) WHERE dnc = true;

-- =====================================================
-- DB-003: Verify Compliance Fields Exist
-- =====================================================

-- Add missing compliance fields to inbox_contact_profiles if not exists
DO $$
BEGIN
  -- tcpa_consent_status
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_contact_profiles' AND column_name = 'tcpa_consent_status') THEN
    ALTER TABLE inbox_contact_profiles ADD COLUMN tcpa_consent_status TEXT NOT NULL DEFAULT 'UNKNOWN';
  END IF;
  
  -- tcpa_consent_date
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_contact_profiles' AND column_name = 'tcpa_consent_date') THEN
    ALTER TABLE inbox_contact_profiles ADD COLUMN tcpa_consent_date TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- tcpa_consent_method
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_contact_profiles' AND column_name = 'tcpa_consent_method') THEN
    ALTER TABLE inbox_contact_profiles ADD COLUMN tcpa_consent_method TEXT;
  END IF;
  
  -- dnc_list_checked_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_contact_profiles' AND column_name = 'dnc_list_checked_at') THEN
    ALTER TABLE inbox_contact_profiles ADD COLUMN dnc_list_checked_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- dnc_list_source
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_contact_profiles' AND column_name = 'dnc_list_source') THEN
    ALTER TABLE inbox_contact_profiles ADD COLUMN dnc_list_source TEXT;
  END IF;
  
  -- gdpr_consent_status
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_contact_profiles' AND column_name = 'gdpr_consent_status') THEN
    ALTER TABLE inbox_contact_profiles ADD COLUMN gdpr_consent_status TEXT;
  END IF;
  
  -- gdpr_consent_date
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_contact_profiles' AND column_name = 'gdpr_consent_date') THEN
    ALTER TABLE inbox_contact_profiles ADD COLUMN gdpr_consent_date TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- last_consent_update_by
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_contact_profiles' AND column_name = 'last_consent_update_by') THEN
    ALTER TABLE inbox_contact_profiles ADD COLUMN last_consent_update_by TEXT;
  END IF;
  
  -- consent_update_reason
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'inbox_contact_profiles' AND column_name = 'consent_update_reason') THEN
    ALTER TABLE inbox_contact_profiles ADD COLUMN consent_update_reason TEXT;
  END IF;
END $$;

-- Add missing compliance fields to send_attempts if not exists
DO $$
BEGIN
  -- compliance_check_passed
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'send_attempts' AND column_name = 'compliance_check_passed') THEN
    ALTER TABLE send_attempts ADD COLUMN compliance_check_passed BOOLEAN NOT NULL DEFAULT false;
  END IF;
  
  -- compliance_check_details
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'send_attempts' AND column_name = 'compliance_check_details') THEN
    ALTER TABLE send_attempts ADD COLUMN compliance_check_details JSONB;
  END IF;
  
  -- delivery_status
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'send_attempts' AND column_name = 'delivery_status') THEN
    ALTER TABLE send_attempts ADD COLUMN delivery_status TEXT;
  END IF;
  
  -- delivery_timestamp
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'send_attempts' AND column_name = 'delivery_timestamp') THEN
    ALTER TABLE send_attempts ADD COLUMN delivery_timestamp TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- carrier_error_code
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'send_attempts' AND column_name = 'carrier_error_code') THEN
    ALTER TABLE send_attempts ADD COLUMN carrier_error_code TEXT;
  END IF;
  
  -- carrier_error_description
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'send_attempts' AND column_name = 'carrier_error_description') THEN
    ALTER TABLE send_attempts ADD COLUMN carrier_error_description TEXT;
  END IF;
  
  -- opt_out_detected
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'send_attempts' AND column_name = 'opt_out_detected') THEN
    ALTER TABLE send_attempts ADD COLUMN opt_out_detected BOOLEAN DEFAULT false;
  END IF;
  
  -- opt_out_timestamp
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'send_attempts' AND column_name = 'opt_out_timestamp') THEN
    ALTER TABLE send_attempts ADD COLUMN opt_out_timestamp TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Add missing compliance fields to conversations if not exists
DO $$
BEGIN
  -- has_active_consent
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'has_active_consent') THEN
    ALTER TABLE conversations ADD COLUMN has_active_consent BOOLEAN NOT NULL DEFAULT false;
  END IF;
  
  -- consent_verified_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'consent_verified_at') THEN
    ALTER TABLE conversations ADD COLUMN consent_verified_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- is_opted_out
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'is_opted_out') THEN
    ALTER TABLE conversations ADD COLUMN is_opted_out BOOLEAN NOT NULL DEFAULT false;
  END IF;
  
  -- opted_out_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'opted_out_at') THEN
    ALTER TABLE conversations ADD COLUMN opted_out_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- opted_out_reason
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'opted_out_reason') THEN
    ALTER TABLE conversations ADD COLUMN opted_out_reason TEXT;
  END IF;
  
  -- is_dnc_flagged
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'is_dnc_flagged') THEN
    ALTER TABLE conversations ADD COLUMN is_dnc_flagged BOOLEAN NOT NULL DEFAULT false;
  END IF;
  
  -- dnc_checked_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'dnc_checked_at') THEN
    ALTER TABLE conversations ADD COLUMN dnc_checked_at TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- preferred_contact_time_start
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'preferred_contact_time_start') THEN
    ALTER TABLE conversations ADD COLUMN preferred_contact_time_start TIME;
  END IF;
  
  -- preferred_contact_time_end
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'preferred_contact_time_end') THEN
    ALTER TABLE conversations ADD COLUMN preferred_contact_time_end TIME;
  END IF;
  
  -- preferred_contact_timezone
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'preferred_contact_timezone') THEN
    ALTER TABLE conversations ADD COLUMN preferred_contact_timezone TEXT;
  END IF;
  
  -- messages_sent_today
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'messages_sent_today') THEN
    ALTER TABLE conversations ADD COLUMN messages_sent_today INTEGER DEFAULT 0;
  END IF;
  
  -- messages_sent_this_week
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'messages_sent_this_week') THEN
    ALTER TABLE conversations ADD COLUMN messages_sent_this_week INTEGER DEFAULT 0;
  END IF;
  
  -- last_message_sent_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'conversations' AND column_name = 'last_message_sent_at') THEN
    ALTER TABLE conversations ADD COLUMN last_message_sent_at TIMESTAMP WITH TIME ZONE;
  END IF;
END $$;

-- Add missing compliance fields to sms_events if not exists
DO $$
BEGIN
  -- was_compliant
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sms_events' AND column_name = 'was_compliant') THEN
    ALTER TABLE sms_events ADD COLUMN was_compliant BOOLEAN NOT NULL DEFAULT true;
  END IF;
  
  -- compliance_notes
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sms_events' AND column_name = 'compliance_notes') THEN
    ALTER TABLE sms_events ADD COLUMN compliance_notes TEXT;
  END IF;
  
  -- delivery_status
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sms_events' AND column_name = 'delivery_status') THEN
    ALTER TABLE sms_events ADD COLUMN delivery_status TEXT;
  END IF;
  
  -- delivery_timestamp
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sms_events' AND column_name = 'delivery_timestamp') THEN
    ALTER TABLE sms_events ADD COLUMN delivery_timestamp TIMESTAMP WITH TIME ZONE;
  END IF;
  
  -- carrier_code
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sms_events' AND column_name = 'carrier_code') THEN
    ALTER TABLE sms_events ADD COLUMN carrier_code TEXT;
  END IF;
  
  -- carrier_message
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sms_events' AND column_name = 'carrier_message') THEN
    ALTER TABLE sms_events ADD COLUMN carrier_message TEXT;
  END IF;
  
  -- contains_opt_out_keyword
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sms_events' AND column_name = 'contains_opt_out_keyword') THEN
    ALTER TABLE sms_events ADD COLUMN contains_opt_out_keyword BOOLEAN DEFAULT false;
  END IF;
  
  -- message_type
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sms_events' AND column_name = 'message_type') THEN
    ALTER TABLE sms_events ADD COLUMN message_type TEXT;
  END IF;
  
  -- campaign_id
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sms_events' AND column_name = 'campaign_id') THEN
    ALTER TABLE sms_events ADD COLUMN campaign_id TEXT;
  END IF;
END $$;

-- =====================================================
-- DB-004: Verify Compliance Audit Tables Exist
-- =====================================================

-- Create consent_audit_log table if not exists
CREATE TABLE IF NOT EXISTS consent_audit_log (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id              TEXT NOT NULL,
  contact_key             TEXT NOT NULL,
  previous_consent_status TEXT,
  new_consent_status      TEXT NOT NULL,
  changed_by              TEXT,
  change_reason           TEXT,
  created_at              TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (contact_key) REFERENCES inbox_contact_profiles(contact_key) ON DELETE CASCADE
);

-- Create dnc_check_log table if not exists
CREATE TABLE IF NOT EXISTS dnc_check_log (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   TEXT NOT NULL,
  phone        TEXT NOT NULL,
  dnc_status   BOOLEAN NOT NULL,
  checked_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  check_source TEXT,
  created_at   TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Create opt_out_events table if not exists
CREATE TABLE IF NOT EXISTS opt_out_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id     UUID NOT NULL,
  contact_id          TEXT NOT NULL,
  contact_phone       TEXT NOT NULL,
  opt_out_method      TEXT NOT NULL,
  opt_out_timestamp   TIMESTAMP WITH TIME ZONE NOT NULL,
  created_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Create message_delivery_log table if not exists
CREATE TABLE IF NOT EXISTS message_delivery_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  send_attempt_id  UUID NOT NULL,
  conversation_id  UUID NOT NULL,
  status           TEXT NOT NULL,
  status_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
  carrier_code     TEXT,
  carrier_message  TEXT,
  created_at       TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  FOREIGN KEY (send_attempt_id) REFERENCES send_attempts(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Add indexes for audit tables
CREATE INDEX IF NOT EXISTS idx_consent_audit_log_contact_key ON consent_audit_log(contact_key);
CREATE INDEX IF NOT EXISTS idx_consent_audit_log_created_at ON consent_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dnc_check_log_phone ON dnc_check_log(phone);
CREATE INDEX IF NOT EXISTS idx_dnc_check_log_checked_at ON dnc_check_log(checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_opt_out_events_conversation_id ON opt_out_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_opt_out_events_contact_id ON opt_out_events(contact_id);
CREATE INDEX IF NOT EXISTS idx_opt_out_events_timestamp ON opt_out_events(opt_out_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_message_delivery_log_send_attempt_id ON message_delivery_log(send_attempt_id);
CREATE INDEX IF NOT EXISTS idx_message_delivery_log_conversation_id ON message_delivery_log(conversation_id);
CREATE INDEX IF NOT EXISTS idx_message_delivery_log_status ON message_delivery_log(status);
CREATE INDEX IF NOT EXISTS idx_message_delivery_log_timestamp ON message_delivery_log(status_timestamp DESC);

COMMIT;