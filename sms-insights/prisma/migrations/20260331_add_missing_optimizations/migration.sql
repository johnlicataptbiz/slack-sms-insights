-- Add missing composite indexes for performance optimization
-- Created concurrently to avoid blocking writes

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sms_events_contact_direction_ts ON sms_events(contact_id, direction, event_ts DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_sms_events_norm_phone_direction_ts ON sms_events(normalized_phone, direction, event_ts DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_send_attempts_conversation_status_created ON send_attempts(conversation_id, status, created_at DESC);

-- Add partial index for pending/error status filtering
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_send_attempts_pending ON send_attempts(conversation_id, status, created_at DESC) WHERE status IN ('blocked', 'queued', 'failed');

-- Enforce data integrity constraints
-- Make conversation_notes.text NOT NULL as it's core data
ALTER TABLE conversation_notes ALTER COLUMN text SET NOT NULL;

-- Add CHECK constraint for sms_events.body: enforce NOT NULL for inbound messages, allow NULL for outbound errors
ALTER TABLE sms_events ADD CONSTRAINT check_sms_events_body_not_null_for_inbound CHECK (direction = 'outbound' OR body IS NOT NULL);