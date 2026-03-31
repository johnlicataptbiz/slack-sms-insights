-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_stat_statements";

-- Create application role with minimal privileges
CREATE ROLE sms_app WITH LOGIN PASSWORD 'secure_app_password_change_me';
GRANT CONNECT ON DATABASE sms_insights TO sms_app;
GRANT USAGE ON SCHEMA public TO sms_app;

-- Grant table permissions (to be updated after migrations)
-- GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO sms_app;
-- GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO sms_app;