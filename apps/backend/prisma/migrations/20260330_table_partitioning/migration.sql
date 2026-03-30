-- Partition sms_events and conversations tables for performance
-- This migration converts large tables to monthly range partitions

-- Step 1: Partition sms_events by event_ts

-- Create partitioned table for sms_events
CREATE TABLE sms_events_partitioned (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slack_team_id TEXT NOT NULL,
    slack_channel_id TEXT NOT NULL,
    slack_message_ts TEXT NOT NULL,
    event_ts TIMESTAMPTZ NOT NULL,
    direction "SmsDirection" NOT NULL,
    contact_id TEXT,
    contact_phone TEXT,
    normalized_contact_key TEXT,
    normalized_phone TEXT,
    contact_name TEXT,
    aloware_user TEXT,
    body TEXT,
    line TEXT,
    sequence TEXT,
    sequence_id UUID,
    sequence_version_id UUID,
    event_role TEXT,
    raw JSONB,
    created_at TIMESTAMPTZ DEFAULT now(),
    conversation_id UUID,
    UNIQUE (slack_channel_id, slack_message_ts)
) PARTITION BY RANGE (event_ts);

-- Create partitions for 2024-2026 (adjust as needed for your data range)
CREATE TABLE sms_events_2024_01 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE sms_events_2024_02 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE sms_events_2024_03 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');
CREATE TABLE sms_events_2024_04 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2024-04-01') TO ('2024-05-01');
CREATE TABLE sms_events_2024_05 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2024-05-01') TO ('2024-06-01');
CREATE TABLE sms_events_2024_06 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2024-06-01') TO ('2024-07-01');
CREATE TABLE sms_events_2024_07 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');
CREATE TABLE sms_events_2024_08 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');
CREATE TABLE sms_events_2024_09 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');
CREATE TABLE sms_events_2024_10 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2024-10-01') TO ('2024-11-01');
CREATE TABLE sms_events_2024_11 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');
CREATE TABLE sms_events_2024_12 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');
CREATE TABLE sms_events_2025_01 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE sms_events_2025_02 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE sms_events_2025_03 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE sms_events_2025_04 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
CREATE TABLE sms_events_2025_05 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
CREATE TABLE sms_events_2025_06 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE sms_events_2025_07 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE sms_events_2025_08 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE TABLE sms_events_2025_09 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE sms_events_2025_10 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE sms_events_2025_11 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE sms_events_2025_12 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
CREATE TABLE sms_events_2026_01 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE sms_events_2026_02 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE sms_events_2026_03 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE sms_events_2026_04 PARTITION OF sms_events_partitioned FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- Migrate data
INSERT INTO sms_events_partitioned SELECT * FROM sms_events;

-- Drop old table and rename
DROP TABLE sms_events;
ALTER TABLE sms_events_partitioned RENAME TO sms_events;

-- Recreate indexes
CREATE INDEX "idx_sms_events_contact_id_event_ts" ON "sms_events"("contact_id", "event_ts" DESC);
CREATE INDEX "idx_sms_events_contact_phone_event_ts" ON "sms_events"("contact_phone", "event_ts" DESC);
CREATE INDEX "idx_sms_events_norm_contact_key_event_ts" ON "sms_events"("normalized_contact_key", "event_ts" DESC);
CREATE INDEX "idx_sms_events_norm_phone_event_ts" ON "sms_events"("normalized_phone", "event_ts" DESC);
CREATE INDEX "idx_sms_events_conversation_event_ts" ON "sms_events"("conversation_id", "event_ts" DESC);
CREATE INDEX "idx_sms_events_sequence_event_ts" ON "sms_events"("sequence", "event_ts" DESC);
CREATE INDEX "idx_sms_events_sequence_id_event_ts" ON "sms_events"("sequence_id", "event_ts" DESC);
CREATE INDEX "idx_sms_events_sequence_version_event_ts" ON "sms_events"("sequence_version_id", "event_ts" DESC);
CREATE INDEX "idx_sms_events_role_event_ts" ON "sms_events"("event_role", "event_ts" DESC);
CREATE INDEX "idx_sms_events_event_ts" ON "sms_events"("event_ts" DESC);

-- Step 2: Partition conversations by created_at

-- Create partitioned table for conversations
CREATE TABLE conversations_partitioned (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_key TEXT UNIQUE NOT NULL,
    contact_id TEXT,
    contact_phone TEXT,
    current_rep_id TEXT,
    status "ConversationStatus" DEFAULT 'open',
    last_inbound_at TIMESTAMPTZ,
    last_outbound_at TIMESTAMPTZ,
    last_touch_at TIMESTAMPTZ,
    unreplied_inbound_count INT DEFAULT 0,
    next_followup_due_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
) PARTITION BY RANGE (created_at);

-- Create partitions for conversations (same range as sms_events)
CREATE TABLE conversations_2024_01 PARTITION OF conversations_partitioned FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE conversations_2024_02 PARTITION OF conversations_partitioned FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE conversations_2024_03 PARTITION OF conversations_partitioned FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');
CREATE TABLE conversations_2024_04 PARTITION OF conversations_partitioned FOR VALUES FROM ('2024-04-01') TO ('2024-05-01');
CREATE TABLE conversations_2024_05 PARTITION OF conversations_partitioned FOR VALUES FROM ('2024-05-01') TO ('2024-06-01');
CREATE TABLE conversations_2024_06 PARTITION OF conversations_partitioned FOR VALUES FROM ('2024-06-01') TO ('2024-07-01');
CREATE TABLE conversations_2024_07 PARTITION OF conversations_partitioned FOR VALUES FROM ('2024-07-01') TO ('2024-08-01');
CREATE TABLE conversations_2024_08 PARTITION OF conversations_partitioned FOR VALUES FROM ('2024-08-01') TO ('2024-09-01');
CREATE TABLE conversations_2024_09 PARTITION OF conversations_partitioned FOR VALUES FROM ('2024-09-01') TO ('2024-10-01');
CREATE TABLE conversations_2024_10 PARTITION OF conversations_partitioned FOR VALUES FROM ('2024-10-01') TO ('2024-11-01');
CREATE TABLE conversations_2024_11 PARTITION OF conversations_partitioned FOR VALUES FROM ('2024-11-01') TO ('2024-12-01');
CREATE TABLE conversations_2024_12 PARTITION OF conversations_partitioned FOR VALUES FROM ('2024-12-01') TO ('2025-01-01');
CREATE TABLE conversations_2025_01 PARTITION OF conversations_partitioned FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');
CREATE TABLE conversations_2025_02 PARTITION OF conversations_partitioned FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
CREATE TABLE conversations_2025_03 PARTITION OF conversations_partitioned FOR VALUES FROM ('2025-03-01') TO ('2025-04-01');
CREATE TABLE conversations_2025_04 PARTITION OF conversations_partitioned FOR VALUES FROM ('2025-04-01') TO ('2025-05-01');
CREATE TABLE conversations_2025_05 PARTITION OF conversations_partitioned FOR VALUES FROM ('2025-05-01') TO ('2025-06-01');
CREATE TABLE conversations_2025_06 PARTITION OF conversations_partitioned FOR VALUES FROM ('2025-06-01') TO ('2025-07-01');
CREATE TABLE conversations_2025_07 PARTITION OF conversations_partitioned FOR VALUES FROM ('2025-07-01') TO ('2025-08-01');
CREATE TABLE conversations_2025_08 PARTITION OF conversations_partitioned FOR VALUES FROM ('2025-08-01') TO ('2025-09-01');
CREATE TABLE conversations_2025_09 PARTITION OF conversations_partitioned FOR VALUES FROM ('2025-09-01') TO ('2025-10-01');
CREATE TABLE conversations_2025_10 PARTITION OF conversations_partitioned FOR VALUES FROM ('2025-10-01') TO ('2025-11-01');
CREATE TABLE conversations_2025_11 PARTITION OF conversations_partitioned FOR VALUES FROM ('2025-11-01') TO ('2025-12-01');
CREATE TABLE conversations_2025_12 PARTITION OF conversations_partitioned FOR VALUES FROM ('2025-12-01') TO ('2026-01-01');
CREATE TABLE conversations_2026_01 PARTITION OF conversations_partitioned FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE conversations_2026_02 PARTITION OF conversations_partitioned FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE conversations_2026_03 PARTITION OF conversations_partitioned FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE conversations_2026_04 PARTITION OF conversations_partitioned FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- Migrate data
INSERT INTO conversations_partitioned SELECT * FROM conversations;

-- Drop old table and rename
DROP TABLE conversations;
ALTER TABLE conversations_partitioned RENAME TO conversations;

-- Recreate indexes
CREATE INDEX "idx_conversations_contact_key" ON "conversations"("contact_key");
CREATE INDEX "idx_conversations_next_followup_due" ON "conversations"("next_followup_due_at");
CREATE INDEX "idx_conversations_rep_last_touch" ON "conversations"("current_rep_id", "last_touch_at" DESC);
CREATE INDEX "idx_conversations_rep_status_touch" ON "conversations"("current_rep_id", "status", "last_touch_at" DESC);
CREATE INDEX "idx_conversations_status" ON "conversations"("status");

-- Note: Foreign keys and relations should be preserved as the table structure remains the same