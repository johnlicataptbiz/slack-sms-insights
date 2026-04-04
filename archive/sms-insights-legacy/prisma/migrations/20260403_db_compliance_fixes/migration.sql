-- DB-001: Add missing foreign keys and clean orphaned data
-- First, add missing conversation_id column to booked_calls if it doesn't exist
ALTER TABLE booked_calls 
ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id);

-- Add FK constraint for conversations.contact_key -> inbox_contact_profiles.contact_key
-- First clean any orphaned conversations that don't have matching contact profiles
DELETE FROM conversations 
WHERE contact_key IS NOT NULL 
AND contact_key NOT IN (SELECT contact_key FROM inbox_contact_profiles);

ALTER TABLE conversations 
ADD CONSTRAINT fk_conversations_contact 
FOREIGN KEY (contact_key) REFERENCES inbox_contact_profiles(contact_key) ON DELETE SET NULL;

-- DB-002: Add missing indexes for high-growth tables
-- sms_events indexes (many already exist, adding missing ones)
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

-- DB-003: Add TCPA/GDPR compliance fields
-- inbox_contact_profiles compliance fields
ALTER TABLE inbox_contact_profiles 
ADD COLUMN IF NOT EXISTS tcpa_consent_status TEXT NOT NULL DEFAULT 'UNKNOWN',
ADD COLUMN IF NOT EXISTS tcpa_consent_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS tcpa_consent_method TEXT,
ADD COLUMN IF NOT EXISTS dnc_list_checked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS dnc_list_source TEXT,
ADD COLUMN IF NOT EXISTS gdpr_consent_status TEXT,
ADD COLUMN IF NOT EXISTS gdpr_consent_date TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS last_consent_update_by TEXT,
ADD COLUMN IF NOT EXISTS consent_update_reason TEXT;

-- send_attempts compliance fields
ALTER TABLE send_attempts 
ADD COLUMN IF NOT EXISTS compliance_check_passed BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS compliance_check_details JSONB,
ADD COLUMN IF NOT EXISTS delivery_status TEXT,
ADD COLUMN IF NOT EXISTS delivery_timestamp TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS carrier_error_code TEXT,
ADD COLUMN IF NOT EXISTS carrier_error_description TEXT,
ADD COLUMN IF NOT EXISTS opt_out_detected BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS opt_out_timestamp TIMESTAMPTZ;

-- conversations compliance fields
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS has_active_consent BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS consent_verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS is_opted_out BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS opted_out_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS opted_out_reason TEXT,
ADD COLUMN IF NOT EXISTS is_dnc_flagged BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS dnc_checked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS preferred_contact_time_start TIME,
ADD COLUMN IF NOT EXISTS preferred_contact_time_end TIME,
ADD COLUMN IF NOT EXISTS preferred_contact_timezone TEXT,
ADD COLUMN IF NOT EXISTS messages_sent_today INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS messages_sent_this_week INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_message_sent_at TIMESTAMPTZ;

-- sms_events compliance fields
ALTER TABLE sms_events 
ADD COLUMN IF NOT EXISTS was_compliant BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS compliance_notes TEXT,
ADD COLUMN IF NOT EXISTS delivery_status TEXT,
ADD COLUMN IF NOT EXISTS delivery_timestamp TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS carrier_code TEXT,
ADD COLUMN IF NOT EXISTS carrier_message TEXT,
ADD COLUMN IF NOT EXISTS contains_opt_out_keyword BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS message_type TEXT,
ADD COLUMN IF NOT EXISTS campaign_id TEXT;

-- DB-004: Create compliance audit tables
CREATE TABLE IF NOT EXISTS consent_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id TEXT NOT NULL,
  contact_key TEXT NOT NULL,
  previous_consent_status TEXT,
  new_consent_status TEXT NOT NULL,
  changed_by TEXT,
  change_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (contact_key) REFERENCES inbox_contact_profiles(contact_key) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS dnc_check_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id TEXT NOT NULL,
  phone TEXT NOT NULL,
  dnc_status BOOLEAN NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  check_source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS opt_out_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  contact_id TEXT NOT NULL,
  contact_phone TEXT NOT NULL,
  opt_out_method TEXT NOT NULL,
  opt_out_timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS message_delivery_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  send_attempt_id UUID NOT NULL,
  conversation_id UUID NOT NULL,
  status TEXT NOT NULL,
  status_timestamp TIMESTAMPTZ NOT NULL,
  carrier_code TEXT,
  carrier_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (send_attempt_id) REFERENCES send_attempts(id) ON DELETE CASCADE,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Add indexes for the new audit tables
CREATE INDEX IF NOT EXISTS idx_consent_audit_contact_key ON consent_audit_log(contact_key);
CREATE INDEX IF NOT EXISTS idx_consent_audit_created_at ON consent_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dnc_check_phone ON dnc_check_log(phone);
CREATE INDEX IF NOT EXISTS idx_dnc_check_created_at ON dnc_check_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_opt_out_events_conversation ON opt_out_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_opt_out_events_created_at ON opt_out_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_message_delivery_send_attempt ON message_delivery_log(send_attempt_id);
CREATE INDEX IF NOT EXISTS idx_message_delivery_created_at ON message_delivery_log(created_at DESC);

-- Add comments for documentation
COMMENT ON TABLE consent_audit_log IS 'Audit trail for all consent status changes (TCPA/GDPR compliance)';
COMMENT ON TABLE dnc_check_log IS 'Log of all DNC checks performed';
COMMENT ON TABLE opt_out_events IS 'Records of opt-out events from users';
COMMENT ON TABLE message_delivery_log IS 'Detailed delivery status tracking for compliance';