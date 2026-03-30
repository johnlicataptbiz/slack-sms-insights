-- DB-005: Standardize timestamp column naming
-- Current naming is already consistent with the convention:
-- event_ts: external event time, created_at: DB insert, updated_at: modification, *_at: domain-specific
-- No changes needed for timestamp naming

-- DB-006: Standardize user_id type to TEXT
ALTER TABLE audit_logs ALTER COLUMN user_id TYPE TEXT;

-- DB-007: Add enum types for status fields
CREATE TYPE sms_send_status AS ENUM ('PENDING', 'SENT', 'FAILED', 'BOUNCED', 'DELIVERED', 'UNSUBSCRIBED');
CREATE TYPE conversation_status AS ENUM ('ACTIVE', 'CLOSED', 'ARCHIVED');
CREATE TYPE tcpa_consent_status AS ENUM ('OPTED_IN', 'OPTED_OUT', 'PENDING', 'UNKNOWN');
CREATE TYPE opt_out_method AS ENUM ('SMS_REPLY', 'LINK_CLICK', 'MANUAL', 'SYSTEM');

-- Migrate existing columns to use enums (assuming current values are compatible)
ALTER TABLE send_attempts ALTER COLUMN status TYPE sms_send_status USING status::sms_send_status;
ALTER TABLE conversations ALTER COLUMN status TYPE conversation_status USING status::conversation_status;
-- inbox_contact_profiles.tcpa_consent_status already uses the enum in schema
-- opt_out_events.opt_out_method already uses the enum in schema
