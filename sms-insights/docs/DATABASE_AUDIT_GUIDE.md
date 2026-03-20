# SMS Insights Database Health Audit Guide

## Overview

This guide explains how to perform comprehensive PostgreSQL database health audits for the SMS Insights platform. Two tools have been created:

1. **db-audit.py** - Python automation tool for quick diagnostics
2. **docs/database-health-audit.sql** - Comprehensive SQL audit script

## Quick Start

### 1. Run the Python Audit Tool

```bash
cd sms-insights
python3 db-audit.py
```

This will:
- ✓ Check for DATABASE_PUBLIC_URL configuration
- ✓ Verify Prisma migrations status
- ✓ Analyze schema structure
- ✓ List all migrations on disk
- ✓ Provide setup instructions

### 2. Run the Full SQL Audit

First, set your database connection:

```bash
# For Railway PostgreSQL
export DATABASE_PUBLIC_URL='postgresql://user:password@host/dbname'

# Or for local development
export DATABASE_URL='postgresql://localhost/sms_insights'
```

Then run the SQL audit:

```bash
psql "$DATABASE_PUBLIC_URL" < docs/database-health-audit.sql > audit-report.txt

# Or interactively:
psql "$DATABASE_PUBLIC_URL"
\i docs/database-health-audit.sql
```

## What Gets Audited

### 1. Migration Status
- Lists all applied migrations with timestamps
- Verifies migration integrity
- Shows execution time for each migration
- Identifies any pending migrations

### 2. Database Bloat Analysis
- Identifies tables with significant dead tuples
- Calculates bloat ratio percentage
- Shows last vacuum time for each table
- Severity classification (CRITICAL/WARNING/INFO/OK)

**Interpretation:**
- Dead rows > 50% bloat ratio: CRITICAL - Run vacuum
- Dead rows > 20% bloat ratio: WARNING - Schedule maintenance
- Dead rows > 10% bloat ratio: MINOR - Monitor

### 3. Table Structure & Sizes
- Row counts for all tables
- Disk space usage (table, indexes, total)
- Identifies largest tables for optimization
- Tracks growth trends over time

**Key Tables to Monitor:**
- `conversations` - Core business entity
- `sms_events` - High-volume event log
- `daily_runs` - Analytics aggregation
- `booked_call_attribution` - New attribution model

### 4. Index Analysis
- **Unused Indexes** - Candidates for removal
- **Index Efficiency** - Tuples fetched vs read ratio
- **Index Size** - Memory footprint
- **Index Bloat** - Wasted space

**Recommendations:**
- Efficiency < 5%: Consider removing index
- Efficiency 5-50%: Monitor for effectiveness
- Efficiency > 50%: Index is performing well

### 5. Foreign Key Validation
- Orphaned references (FK with no parent)
- Missing indexes on FK columns
- Referential integrity violations
- Constraint definitions

### 6. Query Performance Metrics
- Cache hit ratio (target: > 99%)
- Buffer pool efficiency
- Long-running queries
- Connection pool status

### 7. Connection Analysis
- Active connections by user
- Query state distribution (active/idle)
- Database-level connection limits
- Connection pool utilization

## Database Connection Setup

### For Railway PostgreSQL (Production/Staging)

1. Go to Railway dashboard: https://railway.app
2. Select your SMS Insights project
3. Click the PostgreSQL database service
4. Copy the connection string from "Connect" tab
5. Set environment variable:

```bash
export DATABASE_PUBLIC_URL='postgresql://user:password@host:port/dbname?sslmode=require'
```

### For Local Development

Create a local PostgreSQL database:

```bash
# Create database
createdb sms_insights

# Start PostgreSQL service
brew services start postgresql@15  # macOS
# or
sudo systemctl start postgresql    # Linux

# Connect
psql postgresql://localhost/sms_insights
```

Update .env:

```bash
# .env
DATABASE_PUBLIC_URL="postgresql://localhost/sms_insights"
# or
DATABASE_URL="postgresql://localhost/sms_insights"
```

## Interpretation Guide

### Health Metrics

| Metric | Green | Yellow | Red |
|--------|-------|--------|-----|
| Dead Tuple Ratio | < 5% | 5-20% | > 20% |
| Cache Hit Ratio | > 99% | 90-99% | < 90% |
| Unused Indexes | 0-2 | 3-5 | > 5 |
| Max Query Time | < 1s | 1-5s | > 5s |
| Table Bloat | < 10% | 10-30% | > 30% |

### Common Issues & Solutions

**Issue: Dead Tuple Ratio > 50%**
```sql
-- Clean up dead tuples
VACUUM ANALYZE table_name;

-- For major bloat:
VACUUM FULL ANALYZE table_name;
```

**Issue: Cache Hit Ratio < 90%**
```sql
-- Problem: Not enough memory allocated to shared_buffers
-- Solution: Increase shared_buffers in postgresql.conf
-- Restart PostgreSQL after change
```

**Issue: Unused Foreign Key Indexes**
```sql
-- Safe to remove unused indexes
DROP INDEX idx_name;

-- But verify first:
SELECT * FROM pg_stat_user_indexes WHERE idx_scan = 0;
```

**Issue: Orphaned Records**
```sql
-- Find orphaned sms_events
SELECT se.id, se.conversation_id
FROM sms_events se
WHERE NOT EXISTS (
  SELECT 1 FROM conversations c WHERE c.id = se.conversation_id
)
LIMIT 10;

-- Clean up (careful!)
DELETE FROM sms_events
WHERE conversation_id NOT IN (SELECT id FROM conversations);
```

## Recommended Maintenance Schedule

### Daily
- Monitor connection count
- Check for long-running queries
- Alert on unusual table growth

### Weekly
- Run full health audit
- Check dead tuple ratios
- Review query log for slow queries

### Monthly
- Run VACUUM ANALYZE on all tables
- Review index effectiveness
- Archive old data (daily_runs > 90 days)
- Update statistics

### Quarterly
- Major index reorganization
- Capacity planning analysis
- Performance baseline update

## Performance Tuning

### Configuration in postgresql.conf

```ini
# Memory settings (tune based on server RAM)
shared_buffers = 4GB                    # 25% of RAM
effective_cache_size = 12GB             # 75% of RAM
work_mem = 50MB                         # RAM / (max_connections * 2)
maintenance_work_mem = 1GB              # min(shared_buffers/4, 2GB)

# Query performance
max_parallel_workers_per_gather = 4
max_worker_processes = 8
random_page_cost = 1.1                  # Lower for SSD storage

# Vacuum settings
autovacuum = on
autovacuum_naptime = 10s
autovacuum_vacuum_threshold = 50
autovacuum_vacuum_scale_factor = 0.1
```

### Connection Pooling (pgBouncer)

Railway PostgreSQL includes connection pooling. For local development:

```bash
# Install pgBouncer (macOS)
brew install pgbouncer

# Configure pgbouncer.ini
listen_addr = 127.0.0.1
listen_port = 6432
databases = sms_insights = host=localhost port=5432 dbname=sms_insights
```

## Monitoring with Tools

### Prisma Studio (Visual Inspector)

```bash
cd sms-insights
npx prisma studio
# Opens http://localhost:5555
```

### pgAdmin (Web Interface)

```bash
# Docker
docker run -p 5050:80 -e PGADMIN_DEFAULT_EMAIL=admin@local \
  -e PGADMIN_DEFAULT_PASSWORD=admin dpage/pgadmin4

# Visit http://localhost:5050
```

### DataGrip (JetBrains IDE)

- Professional PostgreSQL IDE
- Real-time query profiling
- Index use analysis
- Connection pooling visualization

## Troubleshooting

### "Database URL invalid" Error

```bash
# Fix: Database URL must use postgresql:// or postgres://
# Wrong: postgresql+psycopg2://...
# Wrong: file:///dev.db
# Right: postgresql://user:pass@host/db
```

### Connection Timeout

```bash
# Check database is running
psql -U user -h host -d dbname

# Check network connectivity
ping host

# Check firewall rules (for Railway, check IP whitelist)
```

### Migration Status Shows "Unknown"

```bash
# Reset migration history (DANGEROUS - production only with backup)
rm prisma/migrations/*/.gitkeep

# Re-initialize migrations
npx prisma migrate resolve --rolled-back 20260319_add_temporal_columns
npx prisma migrate status
```

## File Locations

| File | Purpose | Location |
|------|---------|----------|
| SQL Audit Script | Comprehensive diagnostics | `sms-insights/docs/database-health-audit.sql` |
| Python Tool | Quick automation | `sms-insights/db-audit.py` |
| Schema Definition | Data model | `sms-insights/prisma/schema.prisma` |
| Migrations | Applied changes | `sms-insights/prisma/migrations/` |
| Config | Database settings | `sms-insights/src/config/database.ts` |
| Repository | Query patterns | `sms-insights/src/repositories/` |

## Next Steps

1. **Set up database connection**
   ```bash
   export DATABASE_PUBLIC_URL='postgresql://...'
   ```

2. **Run the Python audit tool**
   ```bash
   cd sms-insights && python3 db-audit.py
   ```

3. **Execute the SQL audit**
   ```bash
   psql "$DATABASE_PUBLIC_URL" < docs/database-health-audit.sql
   ```

4. **Schedule weekly audits**
   ```bash
   # Add to crontab for automated health checks
   0 9 * * 1 cd ~/Developer/slack-sms-insights/sms-insights && \
     psql "$DATABASE_PUBLIC_URL" < docs/database-health-audit.sql > audit-$(date +%Y%m%d).txt
   ```

5. **Archive audit reports**
   ```bash
   mkdir audit-logs
   mv audit-*.txt audit-logs/
   ```

## Resources

- [Prisma Database Documentation](https://www.prisma.io/dataguide/)
- [PostgreSQL Performance Tuning](https://www.postgresql.org/docs/current/planner-stats.html)
- [Railway PostgreSQL Guide](https://docs.railway.app/databases/postgresql)
- [pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html)

---

**Last Updated:** March 20, 2026
**SMS Insights Version:** 1.0+
**PostgreSQL:** 15+
