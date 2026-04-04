-- Phase 2: Integrity improvements - foreign keys, constraints, temporal columns

-- Add temporal columns for audit trails
ALTER TABLE monday_column_mappings ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE message_templates ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add CHECK constraint for sms_events body (nullable for errors, required for inbound)
ALTER TABLE sms_events ADD CONSTRAINT check_sms_body CHECK (direction = 'inbound' OR body IS NOT NULL);

-- Add foreign key relationship for monday_metric_facts to monday_board_registry
ALTER TABLE monday_metric_facts ADD CONSTRAINT fk_monday_metric_facts_board_id FOREIGN KEY (board_id) REFERENCES monday_board_registry(board_id) ON DELETE CASCADE;

-- Add index for the foreign key
CREATE INDEX idx_monday_metric_facts_board_id ON monday_metric_facts(board_id);