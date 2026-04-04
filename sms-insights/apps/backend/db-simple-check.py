#!/usr/bin/env python3
"""
Simple Database Health Check
Works with both SQLite and PostgreSQL

Usage:
  python3 db-simple-check.py
"""

import os
import sys
from pathlib import Path
from datetime import datetime

def check_database_setup():
    """Check database configuration and basic health."""
    
    print("\n" + "="*80)
    print("SMS INSIGHTS DATABASE HEALTH CHECK (SIMPLIFIED)")
    print("="*80 + "\n")
    
    # Check environment variables
    db_url = os.environ.get("DATABASE_URL", "").strip('"\'')
    
    if not db_url:
        # Try to read .env
        env_file = ".env"
        if os.path.exists(env_file):
            with open(env_file) as f:
                for line in f:
                    if line.startswith("DATABASE_URL="):
                        db_url = line.split("=", 1)[1].strip('"\'')
                        break
    
    if not db_url:
        print("❌ No DATABASE_URL found in environment or .env file")
        sys.exit(1)
    
    print(f"✓ Database URL found")
    print(f"  Type: {'SQLite' if db_url.startswith('file://') else 'PostgreSQL'}")
    
    # Check SQLite
    if db_url.startswith("file://"):
        db_file = db_url.replace("file://", "")
        if os.path.exists(db_file):
            size_bytes = os.path.getsize(db_file)
            size_mb = size_bytes / (1024 * 1024)
            print(f"  Location: {db_file}")
            print(f"  Size: {size_mb:.2f} MB")
        else:
            print(f"  ⚠ Database file not found: {db_file}")
    
    # Check for Prisma config
    print("\n" + "-" * 80)
    print("PRISMA SCHEMA & MIGRATIONS")
    print("-" * 80)
    
    schema_path = "prisma/schema.prisma"
    if os.path.exists(schema_path):
        print("✓ Prisma schema found")
        with open(schema_path) as f:
            content = f.read()
            models = content.count("model ")
            enums = content.count("enum ")
            print(f"  Models: {models}")
            print(f"  Enums: {enums}")
    
    # Check migrations
    migrations_dir = "prisma/migrations"
    if os.path.exists(migrations_dir):
        migrations = sorted([d for d in os.listdir(migrations_dir) 
                            if os.path.isdir(os.path.join(migrations_dir, d))])
        print(f"✓ Migrations found: {len(migrations)}")
        if migrations:
            print(f"  Latest: {migrations[-1]}")
    
    # Check .env configuration
    print("\n" + "-" * 80)
    print("ENVIRONMENT CONFIGURATION")
    print("-" * 80)
    
    required_vars = [
        "SLACK_CLIENT_ID",
        "SLACK_CLIENT_SECRET", 
        "SLACK_SIGNING_SECRET",
        "OPENAI_API_KEY"
    ]
    
    env_file = ".env"
    loaded_vars = {}
    if os.path.exists(env_file):
        with open(env_file) as f:
            for line in f:
                if "=" in line and not line.startswith("#"):
                    key = line.split("=", 1)[0]
                    loaded_vars[key] = True
    
    missing = []
    for var in required_vars:
        if var in loaded_vars:
            print(f"  ✓ {var}")
        else:
            print(f"  ✗ {var}")
            missing.append(var)
    
    if missing:
        print(f"\n⚠ Missing {len(missing)} required environment variables")
        print("  Copy .env.sample to .env and fill in the missing values")
    
    # Next steps
    print("\n" + "-" * 80)
    print("NEXT STEPS")
    print("-" * 80)
    
    if db_url.startswith("file://"):
        print("""
✓ For LOCAL DEVELOPMENT (SQLite):
  1. npm run dev              # Start development server
  2. npm run build            # Build for production
  3. npm run test             # Run tests

✓ To migrate to PostgreSQL:
  1. Install: brew install postgresql@15
  2. Create: createdb sms_insights
  3. Update .env: DATABASE_URL="postgresql://localhost/sms_insights"
  4. Migrate: npx prisma migrate deploy
        """)
    else:
        print(f"""
✓ POSTGRESQL CONNECTION CONFIGURED
  Database type: {db_url.split(':')[0].upper() if '://' in db_url else 'PostgreSQL'}
  
  1. Verify connection:
     npx prisma db execute --stdin < /dev/null
  
  2. Check Prisma status:
     npx prisma migrate status
  
  3. Apply migrations:
     npx prisma migrate deploy
  
  4. Inspect data:
     npx prisma studio
  
  5. Start development:
     npm run dev
        """)
    
    print("-" * 80)
    print(f"Check completed: {datetime.now().isoformat()}")
    print("="*80 + "\n")

if __name__ == "__main__":
    check_database_setup()
