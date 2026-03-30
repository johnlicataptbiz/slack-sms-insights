-- Add foreign keys to conversation-related tables (DB-001)
ALTER TABLE sms_events ADD CONSTRAINT fk_sms_events_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE send_attempts ADD CONSTRAINT fk_send_attempts_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE draft_suggestions ADD CONSTRAINT fk_draft_suggestions_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id);

ALTER TABLE work_items ADD CONSTRAINT fk_work_items_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id);

ALTER TABLE conversation_state ADD CONSTRAINT fk_conv_state_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE conversation_notes ADD CONSTRAINT fk_conv_notes_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

ALTER TABLE booked_calls ADD CONSTRAINT fk_booked_calls_conversation
  FOREIGN KEY (conversation_id) REFERENCES conversations(id);

ALTER TABLE booked_call_reactions ADD CONSTRAINT fk_booked_call_reactions_call
  FOREIGN KEY (booked_call_id) REFERENCES booked_calls(id) ON DELETE CASCADE;

ALTER TABLE conversations ADD CONSTRAINT fk_conversations_contact
  FOREIGN KEY (contact_key) REFERENCES inbox_contact_profiles(contact_key);

-- Add performance indexes (DB-002)
CREATE INDEX idx_sms_events_conversation_id ON sms_events(conversation_id);
CREATE INDEX idx_sms_events_event_ts ON sms_events(event_ts DESC);
CREATE INDEX idx_sms_events_direction_created ON sms_events(direction, created_at DESC);
CREATE INDEX idx_sms_events_contact_key ON sms_events(contact_key);
CREATE INDEX idx_sms_events_conv_ts ON sms_events(conversation_id, event_ts DESC);

CREATE INDEX idx_send_attempts_conversation_id ON send_attempts(conversation_id);
CREATE INDEX idx_send_attempts_status_created ON send_attempts(status, created_at DESC);
CREATE INDEX idx_send_attempts_idempotency ON send_attempts(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX idx_send_attempts_conv_status ON send_attempts(conversation_id, status);

CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at DESC);
CREATE INDEX idx_audit_logs_action ON audit_logs(action, created_at DESC);

CREATE INDEX idx_conversations_contact_key ON conversations(contact_key);
CREATE INDEX idx_conversations_status ON conversations(status);
CREATE INDEX idx_conversations_rep_id ON conversations(current_rep_id);
CREATE INDEX idx_conversations_last_touch ON conversations(last_touch_at DESC);

CREATE INDEX idx_conv_state_conversation_id ON conversation_state(conversation_id);
CREATE INDEX idx_conv_state_cadence ON conversation_state(cadence_status);
CREATE INDEX idx_conv_state_escalation ON conversation_state(escalation_level);

CREATE INDEX idx_work_items_conversation_id ON work_items(conversation_id);
CREATE INDEX idx_work_items_rep_id ON work_items(rep_id);
CREATE INDEX idx_work_items_unresolved ON work_items(resolved_at) WHERE resolved_at IS NULL;

CREATE INDEX idx_booked_calls_conversation_id ON booked_calls(conversation_id);
CREATE INDEX idx_booked_calls_event_ts ON booked_calls(event_ts DESC);

CREATE INDEX idx_conv_notes_conversation_id ON conversation_notes(conversation_id);

CREATE INDEX idx_contact_profiles_contact_key ON inbox_contact_profiles(contact_key);
CREATE INDEX idx_contact_profiles_phone ON inbox_contact_profiles(phone);
CREATE INDEX idx_contact_profiles_dnc ON inbox_contact_profiles(dnc) WHERE dnc = true;

-- Compliance fields (DB-003) are added via Prisma schema changes
-- Compliance audit tables (DB-004) are created via Prisma schema
