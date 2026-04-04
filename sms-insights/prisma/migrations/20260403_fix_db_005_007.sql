-- DB-005: Standardize Timestamp Column Naming
-- DB-006: Standardize user_id Type  
-- DB-007: Add Enum Types for Status Fields

BEGIN;

-- DB-006: Standardize user_id Type (TEXT preferred)
ALTER TABLE audit_logs ALTER COLUMN user_id TYPE TEXT;

-- DB-007: Add Enum Types for Status Fields
DO $$ BEGIN
  CREATE TYPE tcpa_consent_status AS ENUM ('OPTED_IN', 'OPTED_OUT', 'PENDING', 'UNKNOWN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE gdpr_consent_status AS ENUM ('OPTED_IN', 'OPTED_OUT', 'PENDING', 'UNKNOWN');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE delivery_status AS ENUM ('PENDING', 'SENT', 'DELIVERED', 'FAILED', 'UNDELIVERABLE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Update inbox_contact_profiles.tcpa_consent_status to use enum
ALTER TABLE inbox_contact_profiles 
  ALTER COLUMN tcpa_consent_status DROP DEFAULT,
  ALTER COLUMN tcpa_consent_status TYPE tcpa_consent_status 
  USING tcpa_consent_status::tcpa_consent_status,
  ALTER COLUMN tcpa_consent_status SET DEFAULT 'UNKNOWN';

-- Update inbox_contact_profiles.gdpr_consent_status to use enum
ALTER TABLE inbox_contact_profiles 
  ALTER COLUMN gdpr_consent_status TYPE gdpr_consent_status 
  USING gdpr_consent_status::gdpr_consent_status;

-- Update send_attempts.delivery_status to use enum
ALTER TABLE send_attempts 
  ALTER COLUMN delivery_status TYPE delivery_status 
  USING delivery_status::delivery_status;

-- Update sms_events.delivery_status to use enum
ALTER TABLE sms_events 
  ALTER COLUMN delivery_status TYPE delivery_status 
  USING delivery_status::delivery_status;

-- Update message_delivery_log.status to use delivery_status enum
ALTER TABLE message_delivery_log 
  ALTER COLUMN status TYPE delivery_status 
  USING status::delivery_status;

-- Update consent_audit_log.consent status columns to use enum
ALTER TABLE consent_audit_log 
  ALTER COLUMN previous_consent_status TYPE tcpa_consent_status 
  USING previous_consent_status::tcpa_consent_status;

ALTER TABLE consent_audit_log 
  ALTER COLUMN new_consent_status TYPE tcpa_consent_status 
  USING new_consent_status::tcpa_consent_status;

-- DB-005: Timestamp naming convention is already correct
-- No column renames needed - current naming follows convention

COMMIT;