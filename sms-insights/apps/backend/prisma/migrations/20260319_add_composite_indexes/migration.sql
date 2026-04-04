-- Add composite indexes for performance optimization

-- 1.1.A Conversation: rep_id + status + last_touch for efficient rep-filtered queries
CREATE INDEX "idx_conversations_rep_status_touch" ON "conversations"("current_rep_id", "status", "last_touch_at" DESC);

-- 1.1.B sms_events: contact_id + direction + timestamp for conversation direction analysis
CREATE INDEX "idx_sms_events_contact_direction_ts" ON "sms_events"("contact_id", "direction", "event_ts" DESC);

-- 1.1.B sms_events: normalized phone + direction + timestamp (fallback lookup)
CREATE INDEX "idx_sms_events_norm_phone_direction_ts" ON "sms_events"("normalized_phone", "direction", "event_ts" DESC);

-- 1.1.C send_attempts: conversation + status + created for retry/status queries
CREATE INDEX "idx_send_attempts_conversation_status_created" ON "send_attempts"("conversation_id", "status", "created_at" DESC);

-- 1.1.D inbox_contact_profiles: lead_source + engagement for pipeline views
CREATE INDEX "idx_inbox_profiles_source_engagement" ON "inbox_contact_profiles"("lead_source", "last_engagement_at" DESC);

-- 1.1.D inbox_contact_profiles: auth + blocked + engagement for consent/filter queries
CREATE INDEX "idx_inbox_profiles_auth_blocked_engagement" ON "inbox_contact_profiles"("text_authorized", "is_blocked", "last_engagement_at" DESC);

-- 1.1.E monday_metric_facts: metric_name + board + date for metric aggregations
CREATE INDEX "idx_monday_facts_metric_board_date" ON "monday_metric_facts"("metric_name", "board_id", "metric_date" DESC);
