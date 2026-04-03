#!/bin/bash

# Migration Diagnostic Script

echo "🔍 PTBiz SMS Insights Migration Diagnostic Tool"
echo "============================================="

# Check environment variables
echo -e "\n📋 Environment Variables Check:"
if [ -f .env ]; then
    echo "✅ .env file exists"
    grep -E "^DATABASE_URL=" .env
else
    echo "❌ .env file not found"
fi

# Check Prisma configuration
echo -e "\n🗂️ Prisma Configuration Check:"
if [ -f apps/backend/prisma.config.ts ]; then
    echo "✅ Prisma config file exists"
    cat apps/backend/prisma.config.ts
else
    echo "❌ Prisma config file not found"
fi

# Check database connectivity
echo -e "\n🔌 Database Connectivity Test:"
npx prisma db ping --schema prisma/schema.unified.prisma || echo "❌ Database connection failed"

# List pending migrations
echo -e "\n📦 Pending Migrations:"
npx prisma migrate status --schema prisma/schema.unified.prisma || echo "❌ Migration status check failed"

# Validate schema
echo -e "\n✅ Schema Validation:"
npx prisma validate --schema prisma/schema.unified.prisma || echo "❌ Schema validation failed"

# Generate Prisma client
echo -e "\n🛠️ Prisma Client Generation:"
npx prisma generate --schema prisma/schema.unified.prisma || echo "❌ Prisma client generation failed"

# Show database URL (masked for security)
echo -e "\n🔐 Database URL:"
if [ -n "$DATABASE_URL" ]; then
    echo "✅ DATABASE_URL is set (masked for security)"
    echo "${DATABASE_URL:0:10}...${DATABASE_URL: -10}"
else
    echo "❌ DATABASE_URL is not set"
fi

echo -e "\n🏁 Diagnostic Complete"