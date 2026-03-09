#!/usr/bin/env node
/**
 * Database Connection Migration Script
 * 
 * This script updates the database connection to the new ptbizsms DB
 * and validates the connection works correctly.
 * 
 * Usage:
 *   npx tsx scripts/migrate-database-connection.ts
 *   DRY_RUN=true npx tsx scripts/migrate-database-connection.ts
 */

import { execSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve } from 'path';

// Target database connection string (new ptbizsms DB)
const NEW_DB_URL = 'postgres://07b4c267f59513292ecea7f09217f913053ddd9972c3f21eec56bf65e9bde0a3:sk_TeOuHW6axVcjkvKBJr03a@db.prisma.io:5432/postgres?sslmode=require';

// Backup file path
const BACKUP_DIR = resolve(__dirname, '../.env.backups');
const BACKUP_FILE = resolve(BACKUP_DIR, `.env.backup.migration-${Date.now()}`);

// Environment file path
const ENV_FILE = resolve(__dirname, '../.env');

// Check if running in dry-run mode
const DRY_RUN = process.env.DRY_RUN === 'true';

type MigrationResult = {
  success: boolean;
  timestamp: string;
  dryRun: boolean;
  steps: {
    backupCreated: boolean;
    envUpdated: boolean;
    connectionTested: boolean;
    migrationsRun: boolean;
  };
  errors: string[];
  oldConnection?: string;
  newConnection: string;
};

/**
 * Create backup of current .env file
 */
function createBackup(): boolean {
  try {
    if (!existsSync(ENV_FILE)) {
      console.log('⚠️  No .env file found to backup');
      return false;
    }

    // Ensure backup directory exists
    if (!existsSync(BACKUP_DIR)) {
      const { mkdirSync } = require('fs');
      mkdirSync(BACKUP_DIR, { recursive: true });
    }

    const envContent = readFileSync(ENV_FILE, 'utf8');
    writeFileSync(BACKUP_FILE, envContent);
    console.log(`✅ Backup created: ${BACKUP_FILE}`);
    return true;
  } catch (error) {
    console.error('❌ Failed to create backup:', error);
    return false;
  }
}

/**
 * Extract current DATABASE_URL from .env file
 */
function getCurrentDatabaseUrl(): string | null {
  try {
    if (!existsSync(ENV_FILE)) {
      return process.env.DATABASE_URL || null;
    }

    const envContent = readFileSync(ENV_FILE, 'utf8');
    const match = envContent.match(/^DATABASE_URL=(.+)$/m);
    return match ? match[1].trim() : process.env.DATABASE_URL || null;
  } catch (error) {
    console.error('Error reading current DATABASE_URL:', error);
    return null;
  }
}

/**
 * Update .env file with new database connection
 */
function updateEnvFile(newUrl: string): boolean {
  try {
    let envContent = '';
    
    if (existsSync(ENV_FILE)) {
      envContent = readFileSync(ENV_FILE, 'utf8');
    }

    // Check if DATABASE_URL already exists
    if (envContent.includes('DATABASE_URL=')) {
      // Replace existing DATABASE_URL
      envContent = envContent.replace(
        /^DATABASE_URL=.*$/m,
        `DATABASE_URL=${newUrl}`
      );
    } else {
      // Add DATABASE_URL to end of file
      envContent += `\nDATABASE_URL=${newUrl}\n`;
    }

    if (!DRY_RUN) {
      writeFileSync(ENV_FILE, envContent);
    }
    
    console.log(`${DRY_RUN ? '[DRY RUN] ' : ''}✅ DATABASE_URL updated in .env file`);
    return true;
  } catch (error) {
    console.error('❌ Failed to update .env file:', error);
    return false;
  }
}

/**
 * Test database connection
 */
async function testConnection(url: string): Promise<{ success: boolean; tablesAccessible: string[]; error?: string }> {
  const { PrismaClient } = await import('@prisma/client');
  
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url,
      },
    },
  });

  try {
    // Test basic connection
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection successful');

    // Test table access
    const tables = [
      'conversations',
      'conversation_state',
      'sms_events',
      'booked_calls',
    ];

    const accessibleTables: string[] = [];

    for (const table of tables) {
      try {
        const result = await prisma.$queryRawUnsafe<{ count: number }[]>(
          `SELECT COUNT(*) as count FROM "${table}" LIMIT 1`
        );
        accessibleTables.push(table);
        console.log(`  ✅ Table "${table}" accessible (${result[0]?.count || 0} rows)`);
      } catch (error) {
        console.log(`  ❌ Table "${table}" not accessible`);
      }
    }

    return {
      success: true,
      tablesAccessible: accessibleTables,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('❌ Database connection failed:', errorMessage);
    return {
      success: false,
      tablesAccessible: [],
      error: errorMessage,
    };
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Run Prisma migrations
 */
function runMigrations(): boolean {
  try {
    console.log('Running Prisma migrations...');
    
    if (DRY_RUN) {
      console.log('[DRY RUN] Would execute: npx prisma migrate deploy');
      return true;
    }

    const output = execSync('npx prisma migrate deploy', {
      cwd: resolve(__dirname, '..'),
      encoding: 'utf8',
      stdio: 'pipe',
    });

    console.log('✅ Migrations completed successfully');
    console.log(output);
    return true;
  } catch (error) {
    console.error('❌ Migration failed:', error);
    return false;
  }
}

/**
 * Generate Railway CLI command for updating environment variables
 */
function generateRailwayCommand(): string {
  return `
# To update the DATABASE_URL in Railway, run:
railway variables set DATABASE_URL="${NEW_DB_URL}"

# Or use the Railway dashboard:
# 1. Go to https://railway.app/dashboard
# 2. Select the sms-insights project
# 3. Go to Variables
# 4. Update DATABASE_URL to: ${NEW_DB_URL}
`;
}

/**
 * Run the complete migration process
 */
async function runMigration(): Promise<MigrationResult> {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Database Connection Migration');
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (DRY_RUN) {
    console.log('🔍 DRY RUN MODE - No changes will be made\n');
  }

  const result: MigrationResult = {
    success: false,
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    steps: {
      backupCreated: false,
      envUpdated: false,
      connectionTested: false,
      migrationsRun: false,
    },
    errors: [],
    newConnection: NEW_DB_URL.replace(/\/\/.*@/, '//***@'),
  };

  // Step 1: Get current connection
  const currentUrl = getCurrentDatabaseUrl();
  result.oldConnection = currentUrl?.replace(/\/\/.*@/, '//***@') || 'not found';
  
  console.log(`Current connection: ${result.oldConnection}`);
  console.log(`New connection:     ${result.newConnection}\n`);

  // Step 2: Create backup
  console.log('Step 1: Creating backup...');
  result.steps.backupCreated = createBackup();
  
  if (!result.steps.backupCreated && existsSync(ENV_FILE)) {
    result.errors.push('Failed to create backup');
    console.log('⚠️  Continuing without backup...\n');
  } else {
    console.log('');
  }

  // Step 3: Update .env file
  console.log('Step 2: Updating .env file...');
  result.steps.envUpdated = updateEnvFile(NEW_DB_URL);
  
  if (!result.steps.envUpdated) {
    result.errors.push('Failed to update .env file');
  }
  console.log('');

  // Step 4: Test connection
  console.log('Step 3: Testing new database connection...');
  const connectionTest = await testConnection(NEW_DB_URL);
  result.steps.connectionTested = connectionTest.success;
  
  if (!connectionTest.success) {
    result.errors.push(`Connection test failed: ${connectionTest.error}`);
  }
  console.log('');

  // Step 5: Run migrations (only if connection successful)
  if (connectionTest.success) {
    console.log('Step 4: Running Prisma migrations...');
    result.steps.migrationsRun = runMigrations();
    
    if (!result.steps.migrationsRun) {
      result.errors.push('Migrations failed');
    }
    console.log('');
  } else {
    console.log('⚠️  Skipping migrations due to connection failure\n');
  }

  // Summary
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Migration Summary');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Backup Created:    ${result.steps.backupCreated ? '✅' : '❌'}`);
  console.log(`Env File Updated:  ${result.steps.envUpdated ? '✅' : '❌'}`);
  console.log(`Connection Tested: ${result.steps.connectionTested ? '✅' : '❌'}`);
  console.log(`Migrations Run:    ${result.steps.migrationsRun ? '✅' : '❌'}`);
  console.log(`Errors:            ${result.errors.length}`);
  console.log('═══════════════════════════════════════════════════════════════\n');

  if (result.errors.length === 0) {
    result.success = true;
    console.log('✅ Migration completed successfully!\n');
    
    console.log('Next steps:');
    console.log('1. Update Railway environment variables:');
    console.log(generateRailwayCommand());
    console.log('2. Restart the Railway deployment');
    console.log('3. Monitor the application for errors');
    console.log('4. Run the verification script to confirm data integrity');
  } else {
    console.log('❌ Migration completed with errors:\n');
    result.errors.forEach(error => console.log(`   - ${error}`));
    console.log('\nPlease resolve these issues before proceeding.');
  }

  // Save report
  const reportPath = `./migration-result-${Date.now()}.json`;
  writeFileSync(reportPath, JSON.stringify(result, null, 2));
  console.log(`\n📄 Migration report saved to: ${reportPath}`);

  return result;
}

// Run the migration
runMigration()
  .then(result => {
    process.exit(result.success ? 0 : 1);
  })
  .catch(error => {
    console.error('Migration failed:', error);
    process.exit(1);
  });
