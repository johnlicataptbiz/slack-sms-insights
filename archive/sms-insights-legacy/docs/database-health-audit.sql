-- ============================================================================
-- SMS INSIGHTS POSTGRESQL DATABASE HEALTH AUDIT
-- ============================================================================
-- This script performs comprehensive health checks on the SMS Insights database.
-- Run against your PostgreSQL database to diagnose health, performance, and integrity issues.
-- 
-- Connection: Use DATABASE_PUBLIC_URL from Railway or local postgres://user:pass@host/db
-- ============================================================================

-- ============================================================================
-- 1. MIGRATION STATUS CHECK
-- ============================================================================
SELECT 'MIGRATION STATUS' as check_category;

-- Check which migrations have been applied
SELECT 
  version,
  description,
  installed_on,
  execution_time_ms,
  success
FROM "_prisma_migrations"
ORDER BY installed_on DESC;

-- ============================================================================
-- 2. DATABASE BLOAT ANALYSIS
-- ============================================================================
SELECT 'DATABASE BLOAT ANALYSIS' as check_category;

-- Dead tuples and table bloat
WITH table_stats AS (
  SELECT
    schemaname,
    tablename,
    n_live_tup as live_rows,
    n_dead_tup as dead_rows,
    last_vacuum,
    last_autovacuum,
    ROUND(100 * n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0), 2) as dead_ratio_pct
  FROM pg_stat_user_tables
  WHERE n_dead_tup > 100  -- Only show tables with significant dead tuples
)
SELECT
  tablename,
  live_rows,
  dead_rows,
  dead_ratio_pct,
  last_vacuum,
  last_autovacuum,
  CASE 
    WHEN dead_ratio_pct > 50 THEN 'CRITICAL - High bloat, vacuum urgently'
    WHEN dead_ratio_pct > 20 THEN 'WARNING - Moderate bloat'
    WHEN dead_ratio_pct > 10 THEN 'INFO - Minor bloat'
    ELSE 'OK'
  END as bloat_severity
FROM table_stats
ORDER BY dead_ratio_pct DESC;

-- Overall database size and bloat summary
SELECT
  pg_database.datname,
  pg_size_pretty(pg_database_size(pg_database.datname)) as database_size,
  (SELECT SUM(pg_total_relation_size(schemaname||'.'||tablename))
   FROM pg_tables WHERE schemaname='public') as tables_size,
  (SELECT SUM(pg_total_relation_size(indexrelname))
   FROM pg_indexes WHERE schemaname='public') as indexes_size
FROM pg_database
WHERE datname = current_database();

-- ============================================================================
-- 3. TABLE STRUCTURE AND ROW COUNTS
-- ============================================================================
SELECT 'TABLE STRUCTURE AND ROW COUNTS' as check_category;

-- Row count and size for all tables
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - 
                 pg_relation_size(schemaname||'.'||tablename)) as indexes_size,
  n_live_tup as row_count,
  ROUND(n_live_tup::numeric / 1000000, 2) as millions_of_rows
FROM pg_stat_user_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ============================================================================
-- 4. INDEX ANALYSIS AND EFFICIENCY
-- ============================================================================
SELECT 'INDEX ANALYSIS' as check_category;

-- Unused indexes (potential candidates for removal)
WITH unused_indexes AS (
  SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
  FROM pg_stat_user_indexes
  WHERE idx_scan = 0
    AND indexrelname NOT LIKE '%_pkey'  -- Don't suggest removing PKs
    AND schemaname = 'public'
)
SELECT
  tablename,
  indexname,
  index_size,
  'UNUSED - Candidate for removal' as recommendation
FROM unused_indexes
ORDER BY pg_relation_size(indexrelid) DESC;

-- Index bloat and efficiency
WITH index_stats AS (
  SELECT
    schemaname,
    tablename,
    indexrelname,
    idx_scan,
    idx_tup_read,
    idx_tup_fetch,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size,
    pg_relation_size(indexrelid) as size_bytes,
    ROUND(100 * idx_tup_fetch::numeric / NULLIF(idx_tup_read, 0), 2) as efficiency_pct
  FROM pg_stat_user_indexes
  WHERE schemaname = 'public'
    AND idx_scan > 0  -- Only indexes that are being used
)
SELECT
  tablename,
  indexrelname,
  idx_scan as total_scans,
  index_size,
  efficiency_pct,
  CASE 
    WHEN efficiency_pct < 5 THEN 'LOW - Index may not be effective'
    WHEN efficiency_pct < 50 THEN 'MODERATE - Index has moderate selectivity'
    ELSE 'HIGH - Index is efficient'
  END as efficiency_rating
FROM index_stats
ORDER BY size_bytes DESC;

-- ============================================================================
-- 5. MISSING INDEXES (Query Performance)
-- ============================================================================
SELECT 'MISSING/SUGGESTED INDEXES' as check_category;

-- Foreign key columns without indexes (potential bottleneck)
WITH fk_columns AS (
  SELECT
    tc.table_schema,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS referenced_table,
    ccu.column_name AS referenced_column
  FROM information_schema.table_constraints AS tc
  JOIN information_schema.key_column_usage AS kcu 
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  JOIN information_schema.constraint_column_usage AS ccu 
    ON ccu.constraint_name = tc.constraint_name
    AND ccu.table_schema = tc.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
)
SELECT
  fk.table_name,
  fk.column_name,
  fk.referenced_table,
  'FK without index - could slow joins' as recommendation
FROM fk_columns fk
WHERE NOT EXISTS (
  SELECT 1
  FROM pg_indexes
  WHERE schemaname = fk.table_schema
    AND tablename = fk.table_name
    AND indexdef LIKE '%' || fk.column_name || '%'
  LIMIT 1
);

-- ============================================================================
-- 6. REFERENTIAL INTEGRITY CHECKS
-- ============================================================================
SELECT 'REFERENTIAL INTEGRITY VALIDATION' as check_category;

-- Check for orphaned foreign key references
-- Example: Check for sms_events with non-existent conversation_id
SELECT
  'sms_events' as table_name,
  COUNT(*) as orphaned_records
FROM sms_events se
WHERE se.conversation_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM conversations c WHERE c.id = se.conversation_id
  )
UNION ALL
SELECT
  'send_attempts' as table_name,
  COUNT(*) as orphaned_records
FROM send_attempts sa
WHERE NOT EXISTS (
  SELECT 1 FROM sms_events se WHERE se.id = sa.sms_event_id
);

-- Constraint violations
SELECT
  table_name,
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_schema = 'public'
  AND constraint_type IN ('FOREIGN KEY', 'UNIQUE', 'PRIMARY KEY')
ORDER BY table_name, constraint_type;

-- ============================================================================
-- 7. CONNECTION AND QUERY PERFORMANCE
-- ============================================================================
SELECT 'CONNECTION AND QUERY PERFORMANCE' as check_category;

-- Active connections
SELECT
  datname as database,
  usename as user,
  COUNT(*) as connection_count,
  state,
  MAX(query_start) as longest_query_start
FROM pg_stat_activity
WHERE datname = current_database()
GROUP BY datname, usename, state;

-- Database connection limits
SELECT
  'Connection stats' as metric,
  (SELECT setting FROM pg_settings WHERE name = 'max_connections') as max_connections,
  (SELECT COUNT(*) FROM pg_stat_activity) as active_connections,
  (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'active') as queries_running,
  (SELECT COUNT(*) FROM pg_stat_activity WHERE state = 'idle') as idle_connections;

-- ============================================================================
-- 8. SLOW QUERIES AND QUERY STATISTICS (if pg_stat_statements enabled)
-- ============================================================================
SELECT 'SLOW QUERIES' as check_category;

-- Check if pg_stat_statements is available
-- Note: This may not be available in all PostgreSQL instances
-- If available, shows most time-consuming queries
SELECT
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_name = 'pg_stat_statements'
    )
    THEN 'pg_stat_statements extension is available'
    ELSE 'pg_stat_statements extension not available - install for query analytics'
  END as extension_status;

-- ============================================================================
-- 9. PARTITIONING ANALYSIS (if applicable)
-- ============================================================================
SELECT 'PARTITIONING AND TABLE STRUCTURE' as check_category;

-- Check for partitioned tables using pg_class
SELECT
  n.nspname as schemaname,
  c.relname as tablename,
  'PARTITIONED TABLE' as structure_type
FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
  AND c.relkind = 'p'
ORDER BY c.relname;

-- ============================================================================
-- 10. CACHE HIT RATIO (Database Buffer Pool Efficiency)
-- ============================================================================
SELECT 'CACHE HIT RATIO' as check_category;

-- Overall cache hit ratio
SELECT
  'Heap Blks Hit' as metric,
  SUM(heap_blks_hit) as hit_count,
  SUM(heap_blks_read) as read_count,
  ROUND(100 * SUM(heap_blks_hit)::numeric / 
        NULLIF(SUM(heap_blks_hit) + SUM(heap_blks_read), 0), 2) as hit_ratio_pct
FROM pg_statio_user_tables;

-- Index cache hit ratio
SELECT
  'Index Blks Hit' as metric,
  SUM(idx_blks_hit) as hit_count,
  SUM(idx_blks_read) as read_count,
  ROUND(100 * SUM(idx_blks_hit)::numeric / 
        NULLIF(SUM(idx_blks_hit) + SUM(idx_blks_read), 0), 2) as hit_ratio_pct
FROM pg_statio_user_indexes;

-- ============================================================================
-- 11. COMMON TABLE SIZE SNAPSHOT
-- ============================================================================
SELECT 'CRITICAL TABLES SIZE SNAPSHOT' as check_category;

-- Focus on the main business tables
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as table_size,
  n_live_tup as live_rows
FROM pg_stat_user_tables
WHERE schemaname = 'public'
  AND tablename IN 
  ('conversations', 'sms_events', 'booked_calls', 'send_attempts', 
   'daily_runs', 'sequence_registry', 'monday_sync_state', 
   'conversation_notes', 'booked_call_attribution')
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ============================================================================
-- 12. SUMMARY HEALTH REPORT
-- ============================================================================
SELECT 'HEALTH AUDIT COMPLETE' as status;

-- Final recommendations based on checks
WITH bloat_check AS (
  SELECT COUNT(*) as bloated_tables
  FROM pg_stat_user_tables
  WHERE n_dead_tup > 100
),
index_check AS (
  SELECT COUNT(*) as unused_indexes
  FROM pg_stat_user_indexes
  WHERE idx_scan = 0
),
fk_index_check AS (
  SELECT COUNT(*) as fk_without_indexes
  FROM information_schema.table_constraints tc
  JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
  WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND NOT EXISTS (
      SELECT 1 FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = tc.table_name
        AND indexdef LIKE '%' || kcu.column_name || '%'
    )
)
SELECT
  'Health Summary' as category,
  (SELECT bloated_tables FROM bloat_check) as tables_with_significant_bloat,
  (SELECT unused_indexes FROM index_check) as unused_indexes_found,
  (SELECT fk_without_indexes FROM fk_index_check) as fk_columns_without_indexes;

-- ============================================================================
-- RECOMMENDATIONS
-- ============================================================================

/*
RECOMMENDATIONS FOR OPTIMIZATION:

1. **HIGH PRIORITY:**
   - If dead_ratio_pct > 50%: Run VACUUM FULL on affected tables
   - If cache hit ratio < 90%: Consider increasing shared_buffers
   - If FK without indexes found: Create indexes on foreign key columns

2. **MEDIUM PRIORITY:**
   - Remove identified unused indexes to free disk space
   - Archive old data in daily_runs or fact tables
   - Monitor query performance with pg_stat_statements

3. **MAINTENANCE:**
   - Run regular VACUUM (already happening via autovacuum)
   - Run ANALYZE to update statistics for query planner
   - Monitor table growth weekly

4. **CONFIGURATION (in postgresql.conf):**
   - shared_buffers = 25% of system RAM (min 4GB for production)
   - effective_cache_size = 50-75% of system RAM
   - work_mem = (RAM - shared_buffers) / (max_connections * 2)
   - maintenance_work_mem = min(shared_buffers / 4, 2GB)

5. **NEXT STEPS:**
   - Run this audit weekly
   - Track metrics over time
   - Set up monitoring with pgAdmin or DataGrip
   - Consider Prisma Studio for visual inspection
*/

-- ============================================================================
-- END OF AUDIT SCRIPT
-- ============================================================================
