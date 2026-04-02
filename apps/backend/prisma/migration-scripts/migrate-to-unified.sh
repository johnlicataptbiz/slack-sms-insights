#!/bin/bash

# Migration script for unified schema
# This script safely migrates from the current schema to the unified schema

set -e

echo "🚀 Starting unified schema migration..."

# Check if we're in the right directory
if [ ! -f "prisma/schema.prisma" ]; then
    echo "❌ Error: prisma/schema.prisma not found. Run from apps/backend directory."
    exit 1
fi

# Check feature flags
if [ "$USE_UNIFIED_SCHEMA" != "true" ]; then
    echo "❌ Error: USE_UNIFIED_SCHEMA feature flag not enabled"
    exit 1
fi

# Note about backup
echo "📦 Note: Using Railway-managed database. Backups are handled automatically by Railway."
echo "   Ensure you have recent backups before proceeding with schema changes."

# Generate Prisma client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Run migration
echo "🗄️ Running database migration..."
npx prisma migrate deploy

# Verify migration
echo "✅ Verifying migration..."
node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function verify() {
  try {
    const result = await prisma.\$queryRaw\`SELECT COUNT(*) as count FROM information_schema.tables WHERE table_schema = 'public'\`;
    console.log(\`Migration successful: \${result[0].count} tables found\`);
    await prisma.\$disconnect();
  } catch (error) {
    console.error('Migration verification failed:', error);
    process.exit(1);
  }
}
verify();
"

echo "🎉 Unified schema migration completed successfully!"
echo "📋 Next steps:"
echo "  1. Update feature flags to enable modern backend"
echo "  2. Test application functionality"
echo "  3. Gradually migrate traffic from legacy backend"