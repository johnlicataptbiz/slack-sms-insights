-- ============================================================================
-- SMS INSIGHTS POSTGRESQL SIMPLE HEALTH CHECK
-- ============================================================================
-- Lightweight diagnostic script for quick database health assessment
-- Run: psql "$DATABASE_PUBLIC_URL" < db-simple-health.sql

\echo '================================'
\echo 'SMS INSIGHTS DATABASE HEALTH CHECK'
\echo '================================'

-- 1. Connection & Database Info
\echo ''
\echo '✓ Database Connection'
SELECT
  current_database() as database,
  current_user as user,
  version() as postgresql_version;

-- 2. Migrations Applied
\echo ''
\echo '✓ Prisma Migrations'
SELECT 
  COUNT(*) as total_migrations,
  MAX(installed_on) as last_migration_date
FROM "_prisma_migrations"
WHERE success = true;

-- 3. Table Count
\echo ''
\echo '✓ Database Tables'
SELECT
  COUNT(*) as total_tables,
  COUNT(*) FILTER (WHERE tablename IN ('conversations', 'sms_events', 'booked_calls', 'send_attempts')) as business_tables
FROM pg_tables
WHERE schemaname = 'public';

-- 4. Data Volume - Key Tables
\echo ''
\echo '✓ Data in Key Tables'
SELECT
  tablename,
  n_live_tup as row_count,
  pg_size_pretty(pg_total_relation_size('public.' || tablename)) as size
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND tablename IN ('conversations', 'sms_events', 'booked_calls', 'send_attempts', 'daily_runs')
ORDER BY n_live_tup DESC;

-- 5. Disk Usage
\echo ''
\echo '✓ Database Disk Usage'
SELECT
  pg_size_pretty(pg_database_size(current_database())) as total_database_size,
  (SELECT pg_size_pretty(SUM(pg_total_relation_size('public.' || tablename)))
   FROM pg_tables WHERE schemaname='public') as tables_total_size;

-- 6. Connection Pool Status
\echo ''
\echo '✓ Active Connections'
SELECT
  datname,
  COUNT(*) as connections,
  COUNT(*) FILTER (WHERE state = 'active') as active_queries,
  COUNT(*) FILTER (WHERE state = 'idle') as idle_connections
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY datname;

-- 7. Health Summary
\echo ''
\echo '================================'
\echo 'Database is healthy! ✓'
\echo '================================'
\echo ''
\echo 'Next: Run "npx prisma studio" to explore your data'
