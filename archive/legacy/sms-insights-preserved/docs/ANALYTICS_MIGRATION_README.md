# Analytics Schema Migration

## Overview

This migration creates the analytics schema baseline tables required for the KPI dashboard to display actual data instead of "degraded mode" warnings.

## Tables Created

- `sequence_registry` - Tracks SMS sequences and campaigns
- `fact_sms_daily` - Daily SMS metrics (sent, replied, opt-outs)
- `fact_booking_daily` - Daily booking metrics by sequence and rep
- `fact_lead_quality_daily` - Daily lead quality metrics
- `fact_monday_health_daily` - Monday.com sync health metrics

## Prerequisites

1. **Production Database Access**: You need access to the production PostgreSQL database
2. **DATABASE_URL**: The production database connection string must be available

## How to Run

### Option 1: Using the Migration Script

```bash
cd sms-insights
DATABASE_URL=your_production_db_url node run-analytics-migration.mjs
```

### Option 2: Via Railway Deploy

If you have Railway CLI installed:

```bash
cd sms-insights
railway up
```

This will deploy the application with the migration script included. The `ensureAnalyticsSchemaBaseline` function will run automatically on startup.

### Option 3: Direct SQL Execution

You can also run the SQL directly using `psql`:

```bash
psql $DATABASE_URL -f prisma/migrations/20260402_add_analytics_schema_baseline/migration.sql
```

## Verification

After running the migration, verify the tables were created:

```sql
-- Check tables exist
\dt fact_*
\dt sequence_registry

-- Check indexes
\di idx_fact_*

-- Verify sms_events columns
\d sms_events
```

## Next Steps

1. **Run KPI Facts Refresh**: Execute the KPI facts refresh job to populate the analytics tables with historical data
2. **Dashboard Verification**: Check the dashboard to confirm it shows actual data instead of "degraded mode" warnings
3. **Monitor Sync Jobs**: Ensure the Monday.com sync and SMS event ingestion jobs are running

## Rollback

If you need to rollback (use with caution):

```sql
DROP TABLE IF EXISTS fact_monday_health_daily CASCADE;
DROP TABLE IF EXISTS fact_lead_quality_daily CASCADE;
DROP TABLE IF EXISTS fact_booking_daily CASCADE;
DROP TABLE IF EXISTS fact_sms_daily CASCADE;
DROP TABLE IF EXISTS sequence_registry CASCADE;
```

## Notes

- The migration uses `CREATE TABLE IF NOT EXISTS` so it's safe to run multiple times
- All tables have `created_at` and `updated_at` timestamps
- Composite primary keys are used for fact tables (day, sequence_id, rep_id)
- Indexes are created for common query patterns
