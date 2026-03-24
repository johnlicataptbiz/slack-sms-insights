-- Migration: Add enhanced data coverage tables and fields
-- Date: 2026-03-23
-- Description: Extends schema with call events, contact activities, rep profiles, SMS lines, and enhanced fields

BEGIN;

-- ============================================
-- NEW TABLES
-- ============================================

-- Call Events table for tracking phone interactions
CREATE TABLE IF NOT EXISTS call_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id VARCHAR(255),
    contact_phone VARCHAR(50),
    direction VARCHAR(20) NOT NULL DEFAULT 'unknown',
    duration_secs INTEGER,
    recording_url TEXT,
    transcript TEXT,
    voicemail_url TEXT,
    disposition VARCHAR(100),
    rep_id VARCHAR(255),
    aloware_call_id VARCHAR(255),
    contact_key VARCHAR(255),
    event_ts TIMESTAMPTZ(6) NOT NULL,
    created_at TIMESTAMPTZ(6) DEFAULT NOW()
);

CREATE INDEX idx_call_events_contact_id_event_ts ON call_events(contact_id, event_ts DESC);
CREATE INDEX idx_call_events_contact_phone_event_ts ON call_events(contact_phone, event_ts DESC);
CREATE INDEX idx_call_events_direction_event_ts ON call_events(direction, event_ts DESC);
CREATE INDEX idx_call_events_rep_event_ts ON call_events(rep_id, event_ts DESC);

-- Unified Contact Activity Timeline
CREATE TABLE IF NOT EXISTS contact_activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_key VARCHAR(255) NOT NULL,
    activity_type VARCHAR(50) NOT NULL,
    reference_id UUID,
    reference_type VARCHAR(50),
    rep_id VARCHAR(255),
    summary TEXT,
    metadata JSONB DEFAULT '{}',
    occurred_at TIMESTAMPTZ(6) NOT NULL,
    created_at TIMESTAMPTZ(6) DEFAULT NOW()
);

CREATE INDEX idx_contact_activities_contact_occurred ON contact_activities(contact_key, occurred_at DESC);
CREATE INDEX idx_contact_activities_type_occurred ON contact_activities(activity_type, occurred_at DESC);
CREATE INDEX idx_contact_activities_rep_occurred ON contact_activities(rep_id, occurred_at DESC);

-- Rep/User Profiles table
CREATE TABLE IF NOT EXISTS reps (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    email VARCHAR(255),
    slack_user_id VARCHAR(255) UNIQUE,
    team VARCHAR(100),
    role VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    hired_at DATE,
    territories TEXT[],
    specialties TEXT[],
    avatar_url TEXT,
    created_at TIMESTAMPTZ(6) DEFAULT NOW(),
    updated_at TIMESTAMPTZ(6) DEFAULT NOW()
);

CREATE INDEX idx_reps_active ON reps(is_active);
CREATE INDEX idx_reps_slack ON reps(slack_user_id);

-- SMS Lines/Channels management
CREATE TABLE IF NOT EXISTS sms_lines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    phone_number VARCHAR(50) NOT NULL UNIQUE,
    friendly_name VARCHAR(255),
    carrier VARCHAR(100),
    line_type VARCHAR(20) DEFAULT 'long_code',
    is_active BOOLEAN DEFAULT true,
    assigned_rep_id VARCHAR(255),
    inbound_count INTEGER DEFAULT 0,
    outbound_count INTEGER DEFAULT 0,
    last_used_at TIMESTAMPTZ(6),
    created_at TIMESTAMPTZ(6) DEFAULT NOW(),
    updated_at TIMESTAMPTZ(6) DEFAULT NOW()
);

CREATE INDEX idx_sms_lines_active ON sms_lines(is_active);
CREATE INDEX idx_sms_lines_assigned_rep ON sms_lines(assigned_rep_id);

-- ============================================
-- ENHANCED FIELDS FOR EXISTING TABLES
-- ============================================

-- Add enhanced fields to sms_events
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS delivery_status VARCHAR(20) DEFAULT 'sent';
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS delivered_at TIMESTAMPTZ(6);
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ(6);
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS media_urls JSONB DEFAULT '[]';
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS link_clicks INTEGER DEFAULT 0;
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS ai_classification VARCHAR(100);
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS sentiment_score DECIMAL(4,3);
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS is_booking_signal BOOLEAN DEFAULT false;
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS thread_id VARCHAR(255);
ALTER TABLE sms_events ADD COLUMN IF NOT EXISTS parent_event_id UUID REFERENCES sms_events(id);

CREATE INDEX IF NOT EXISTS idx_sms_events_delivery_status ON sms_events(delivery_status);
CREATE INDEX IF NOT EXISTS idx_sms_events_booking_signal ON sms_events(is_booking_signal) WHERE is_booking_signal = true;
CREATE INDEX IF NOT EXISTS idx_sms_events_ai_classification ON sms_events(ai_classification);
CREATE INDEX IF NOT EXISTS idx_sms_events_conversation_id ON sms_events(conversation_id);
CREATE INDEX IF NOT EXISTS idx_sms_events_parent_event_id ON sms_events(parent_event_id) WHERE parent_event_id IS NOT NULL;

-- Add enhanced fields to inbox_contact_profiles
ALTER TABLE inbox_contact_profiles ADD COLUMN IF NOT EXISTS source_campaign VARCHAR(255);
ALTER TABLE inbox_contact_profiles ADD COLUMN IF NOT EXISTS original_landing_url TEXT;
ALTER TABLE inbox_contact_profiles ADD COLUMN IF NOT EXISTS referrer_url TEXT;
ALTER TABLE inbox_contact_profiles ADD COLUMN IF NOT EXISTS utm_source VARCHAR(255);
ALTER TABLE inbox_contact_profiles ADD COLUMN IF NOT EXISTS utm_medium VARCHAR(255);
ALTER TABLE inbox_contact_profiles ADD COLUMN IF NOT EXISTS utm_campaign VARCHAR(255);
ALTER TABLE inbox_contact_profiles ADD COLUMN IF NOT EXISTS utm_content VARCHAR(255);
ALTER TABLE inbox_contact_profiles ADD COLUMN IF NOT EXISTS utm_term VARCHAR(255);
ALTER TABLE inbox_contact_profiles ADD COLUMN IF NOT EXISTS opt_out_date TIMESTAMPTZ(6);
ALTER TABLE inbox_contact_profiles ADD COLUMN IF NOT EXISTS opt_out_source VARCHAR(50);
ALTER TABLE inbox_contact_profiles ADD COLUMN IF NOT EXISTS best_contact_window VARCHAR(50);
ALTER TABLE inbox_contact_profiles ADD COLUMN IF NOT EXISTS preferred_channel VARCHAR(50);
ALTER TABLE inbox_contact_profiles ADD COLUMN IF NOT EXISTS lifetime_messages INTEGER DEFAULT 0;
ALTER TABLE inbox_contact_profiles ADD COLUMN IF NOT EXISTS lifetime_value DECIMAL(10,2);
ALTER TABLE inbox_contact_profiles ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE inbox_contact_profiles ADD COLUMN IF NOT EXISTS tags_array TEXT[] DEFAULT '{}';
ALTER TABLE inbox_contact_profiles ADD COLUMN IF NOT EXISTS linkedin_url VARCHAR(500);
ALTER TABLE inbox_contact_profiles ADD COLUMN IF NOT EXISTS company_name VARCHAR(255);
ALTER TABLE inbox_contact_profiles ADD COLUMN IF NOT EXISTS job_title VARCHAR(255);
ALTER TABLE inbox_contact_profiles ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversations(id);

CREATE INDEX IF NOT EXISTS idx_contact_profiles_source_campaign ON inbox_contact_profiles(source_campaign);
CREATE INDEX IF NOT EXISTS idx_contact_profiles_opt_out_date ON inbox_contact_profiles(opt_out_date) WHERE opt_out_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contact_profiles_utm ON inbox_contact_profiles(utm_source, utm_campaign);

-- Add enhanced fields to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS first_response_time_mins INTEGER;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS avg_response_time_mins INTEGER;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS total_messages INTEGER DEFAULT 0;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS peak_response_hour INTEGER CHECK (peak_response_hour >= 0 AND peak_response_hour <= 23);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS engagement_score DECIMAL(5,2);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS health_status VARCHAR(20) DEFAULT 'healthy';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_qualification_at TIMESTAMPTZ(6);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS last_disposition_at TIMESTAMPTZ(6);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(10) DEFAULT 'en';
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS timezone VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_conversations_health_status ON conversations(health_status);
CREATE INDEX IF NOT EXISTS idx_conversations_engagement_score ON conversations(engagement_score DESC) WHERE engagement_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_avg_response ON conversations(avg_response_time_mins ASC) WHERE avg_response_time_mins IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_conversations_contact_key ON conversations(contact_key);

-- call_events conversation_id is already added above in the NEW TABLES section

-- Add new indexes for conversations
CREATE INDEX IF NOT EXISTS idx_conversations_health_status ON conversations(health_status);

-- ============================================
-- SEQUENCE/TABLE FOR ENUM VALUES (if using app-level enums)
-- ============================================

-- Health status enum values could be stored as a lookup table
CREATE TABLE IF NOT EXISTS health_status_ref (
    status VARCHAR(20) PRIMARY KEY,
    label VARCHAR(100) NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true
);

INSERT INTO health_status_ref (status, label, sort_order) VALUES
    ('healthy', 'Healthy', 1),
    ('at_risk', 'At Risk', 2),
    ('stalled', 'Stalled', 3),
    ('disengaged', 'Disengaged', 4)
ON CONFLICT (status) DO NOTHING;

-- Seed call_events table reference (empty table ready for data)
-- Note: This table is for tracking phone interactions

-- Seed reps table reference (empty table ready for data)
-- Note: This table is for managing rep profiles and performance data

-- ============================================
-- SUMMARY VIEW FOR CONTACT ANALYTICS
-- ============================================

-- View disabled - needs manual review after migration
-- CREATE OR REPLACE VIEW v_contact_engagement_summary AS
-- SELECT 
--     icp.contact_key,
--     icp.name,
--     icp.phone,
--     icp.email,
--     icp.lead_source,
--     c.engagement_score,
--     c.health_status,
--     icp.last_engagement_at,
--     icp.inbound_sms_count,
--     icp.outbound_sms_count,
--     icp.inbound_call_count,
--     icp.outbound_call_count,
--     COALESCE(icp.inbound_sms_count, 0) + COALESCE(icp.outbound_sms_count, 0) + 
--     COALESCE(icp.inbound_call_count, 0) + COALESCE(icp.outbound_call_count, 0) AS total_interactions,
--     c.unreplied_inbound_count,
--     c."nextFollowupAt",
--     cs.qualification_progress_step,
--     cs.cadence_status,
--     cs.objection_tags,
--     CASE 
--         WHEN icp.opt_out_date IS NOT NULL THEN 'opted_out'
--         WHEN icp.dnc = true THEN 'dnc'
--         WHEN c.status = 'open' THEN 'active'
--         ELSE 'inactive'
--     END AS contact_state
-- FROM inbox_contact_profiles icp
-- LEFT JOIN conversations c ON c.id = icp.conversation_id
-- LEFT JOIN conversation_state cs ON cs.conversation_id = c.id;

COMMIT;

-- ============================================
-- VERIFICATION QUERIES (commented out for migration)
-- ============================================

-- SELECT table_name FROM information_schema.tables 
-- WHERE table_schema = 'public' 
-- AND table_name IN ('call_events', 'contact_activities', 'reps', 'sms_lines', 'health_status_ref')
-- ORDER BY table_name;
