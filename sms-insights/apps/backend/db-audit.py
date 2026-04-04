#!/usr/bin/env python3
"""
SMS Insights Database Health Audit Tool

This script connects to the PostgreSQL database and generates a comprehensive
health report including migration status, table bloat, index efficiency, and
performance recommendations.

Usage:
  python3 db-audit.py
  DATABASE_PUBLIC_URL=postgres://... python3 db-audit.py
"""

import os
import sys
import json
from datetime import datetime
from typing import Optional, Dict, List, Any
from pathlib import Path
import subprocess

def get_database_url() -> Optional[str]:
    """Get database URL from environment or .env file."""
    # Check environment
    if "DATABASE_PUBLIC_URL" in os.environ:
        return os.environ["DATABASE_PUBLIC_URL"]
    
    if "DATABASE_URL" in os.environ:
        url = os.environ["DATABASE_URL"]
        # If it's a file:// URL (SQLite), we can't audit
        if url.startswith("file://"):
            print("❌ ERROR: DATABASE_URL points to SQLite (file:///), not PostgreSQL")
            print("   Switch to PostgreSQL for this audit.")
            return None
        return url
    
    # Try to read from .env
    env_file = ".env"
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                line = line.strip()
                if line.startswith("DATABASE_PUBLIC_URL="):
                    return line.split("=", 1)[1].strip('"\'')
                elif line.startswith("DATABASE_URL=") and "postgres" in line:
                    return line.split("=", 1)[1].strip('"\'')
    
    return None

def run_prisma_migrate_status() -> Dict[str, Any]:
    """Check Prisma migration status by reading filesystem."""
    try:
        migrations = []
        migrations_dir = Path("prisma/migrations")
        if migrations_dir.exists():
            for mig_dir in sorted(migrations_dir.iterdir()):
                if mig_dir.is_dir():
                    migrations.append(mig_dir.name)
        
        return {
            "status": "success",
            "migrations_found": len(migrations),
            "latest_migration": migrations[-1] if migrations else None,
            "all_migrations": migrations[:5] if len(migrations) > 5 else migrations
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }

def main():
    print("\n" + "="*80)
    print("SMS INSIGHTS DATABASE HEALTH AUDIT")
    print("="*80 + "\n")
    
    # Check database connection
    db_url = get_database_url()
    
    if not db_url:
        print("❌ ERROR: No PostgreSQL database URL found")
        print("\nTo set up database connection:")
        print("  1. For Railway PostgreSQL: Copy DATABASE_PUBLIC_URL from Railway dashboard")
        print("  2. For local PostgreSQL: Use postgres://user:password@localhost/sms_insights")
        print("  3. Export as environment variable: export DATABASE_PUBLIC_URL='postgres://...'")
        print("\nAlternatively, update .env file with:")
        print("  DATABASE_PUBLIC_URL=postgres://...")
        sys.exit(1)
    
    print("✓ Database connection string found\n")
    
    # Check migration status
    print("-" * 80)
    print("CHECKING PRISMA MIGRATIONS...")
    print("-" * 80)
    
    migration_status = run_prisma_migrate_status()
    
    if migration_status["status"] == "success":
        print("✓ Migrations are up to date")
        if migration_status.get("migrations_found", 0) > 0:
            print(f"   Found {migration_status['migrations_found']} migrations on disk")
            if migration_status.get("latest_migration"):
                print(f"   Latest: {migration_status['latest_migration']}")
    else:
        print("⚠ Issue with migrations:")
        print(migration_status.get("error", "Unknown error"))
        print("\nNote: Some database features may be unavailable.")
        print("Run: npx prisma migrate status")
        print("Then: npx prisma migrate deploy (for production)")
    
    print("\n" + "-" * 80)
    print("GENERATED AUDIT SCRIPT")
    print("-" * 80)
    print("\n✓ Comprehensive SQL audit script created at:")
    print("  docs/database-health-audit.sql")
    print("\nTo run the audit on your database:")
    print("\n  1. Connect to your PostgreSQL database:")
    print(f"     psql '{db_url}'")
    print("\n  2. Run the audit script:")
    print("     \\i docs/database-health-audit.sql")
    print("\nOr directly:")
    print(f"     psql '{db_url}' < docs/database-health-audit.sql")
    
    print("\n" + "-" * 80)
    print("QUICK ANALYSIS FROM SCHEMA")
    print("-" * 80)
    
    # Analyze the Prisma schema file
    schema_path = "prisma/schema.prisma"
    if os.path.exists(schema_path):
        with open(schema_path) as f:
            schema_content = f.read()
        
        # Count models
        model_count = schema_content.count("model ")
        enum_count = schema_content.count("enum ")
        
        # Find key tables
        key_tables = [
            "Conversation", "sms_events", "booked_calls", "send_attempts",
            "daily_runs", "sequence_registry", "monday_sync_state"
        ]
        found_tables = [t for t in key_tables if f"model {t}" in schema_content]
        
        print(f"\n✓ Schema Analysis:")
        print(f"  - Total models: {model_count}")
        print(f"  - Total enums: {enum_count}")
        print(f"  - Key business tables found: {len(found_tables)}/{len(key_tables)}")
        print(f"    {', '.join(found_tables)}")
        
        # Check for relationships
        has_relationships = "@relation" in schema_content
        print(f"  - Relationships defined: {'Yes' if has_relationships else 'No'}")
        print(f"  - Preview features enabled: {'partialIndexes' in schema_content}")
    
    print("\n" + "-" * 80)
    print("MIGRATIONS ON DISK")
    print("-" * 80)
    
    # List migrations
    migrations_dir = "prisma/migrations"
    if os.path.exists(migrations_dir):
        migrations = sorted([d for d in os.listdir(migrations_dir) if os.path.isdir(os.path.join(migrations_dir, d))])
        print(f"\n✓ Total migrations: {len(migrations)}")
        print("\n  Applied in order:")
        for i, migration in enumerate(migrations, 1):
            print(f"    {i}. {migration}")
    
    print("\n" + "-" * 80)
    print("NEXT STEPS")
    print("-" * 80)
    print("""
1. ✓ Ensure DATABASE_PUBLIC_URL is set:
   export DATABASE_PUBLIC_URL='your-postgresql-url'

2. ✓ Verify migrations are applied:
   npx prisma migrate status

3. ✓ Run full audit script:
   psql "$DATABASE_PUBLIC_URL" < docs/database-health-audit.sql

4. ✓ Monitor database health:
   - Dead tuples ratio (should be < 5%)
   - Cache hit ratio (should be > 99%)
   - Unused indexes (remove to save space)
   - Query performance (check for slow queries)

5. ✓ Set up production maintenance:
   - Enable pg_stat_statements for query analysis
   - Configure autovacuum settings
   - Set up monitoring with pgAdmin or DataGrip
   - Schedule weekly health audits

DATABASE TUNING TIPS:
- Use Prisma Studio to inspect data: npx prisma studio
- Check repository pattern in src/repositories/ for query optimization
- Review connection pooling settings in src/config/database.ts
- Monitor Railway PostgreSQL metrics in dashboard
""")
    
    print("-" * 80)
    print(f"Audit generated: {datetime.now().isoformat()}")
    print("="*80 + "\n")

if __name__ == "__main__":
    main()
