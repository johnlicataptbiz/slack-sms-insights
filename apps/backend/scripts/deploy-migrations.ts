/**
 * Production Migration Deployment Script
 * Runs Prisma migrations and verifies database alignment
 * Must run before app.ts starts
 * Usage: node --import tsx scripts/deploy-migrations.ts
 */

import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const log = {
  info: (msg: string) => console.log(`ℹ️  ${msg}`),
  success: (msg: string) => console.log(`✅ ${msg}`),
  warn: (msg: string) => console.log(`⚠️  ${msg}`),
  error: (msg: string) => console.error(`❌ ${msg}`),
};

const run = (cmd: string, args: string[] = []): Promise<void> => {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, {
      cwd: rootDir,
      stdio: 'inherit',
      shell: true,
    });

    proc.on('error', (err) => {
      log.error(`Command failed: ${cmd} ${args.join(' ')}`);
      reject(err);
    });

    proc.on('exit', (code) => {
      if (code !== 0) {
        reject(
          new Error(
            `Command exited with code ${code}: ${cmd} ${args.join(' ')}`,
          ),
        );
      } else {
        resolve();
      }
    });
  });
};

const verifyDatabase = async (): Promise<boolean> => {
  const databaseUrl = (process.env.DATABASE_URL || '').trim();

  if (!databaseUrl) {
    log.error('DATABASE_URL not set');
    return false;
  }

  try {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();

    // Check if _prisma_migrations table exists (indicates Prisma has been initialized)
    const result = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = '_prisma_migrations'
      )
    `);

    const exists = result.rows[0].exists;
    client.release();
    await pool.end();

    if (!exists) {
      log.warn(
        '_prisma_migrations table not found; database may need initialization',
      );
      return false;
    }

    log.success('Database connection verified');
    return true;
  } catch (error) {
    log.error(
      `Failed to verify database: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
};

// Required enum types that must exist in the database for the schema to work.
// If the database was initialized from 0_init (which uses plain TEXT), these
// enums may not exist even though the current schema uses typed enums.
const REQUIRED_ENUMS = [
  'SmsDirection',
  'ConversationStatus',
  'CadenceStatus',
  'DailyRunStatus',
  'MondayBookedCallPushStatus',
  'SendAttemptStatus',
  'SequenceVersionStatus',
  'WorkItemSeverity',
  'WorkItemType',
  'SequenceRegistryStatus',
  'MondaySyncStatus',
] as const;

const verifyEnumsExist = async (): Promise<boolean> => {
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    log.error('DATABASE_URL not set');
    return false;
  }

  try {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();

    // Query existing enum types from PostgreSQL
    const result = await client.query(`
      SELECT typname FROM pg_type WHERE typcategory = 'E'
    `);

    const existingEnums = new Set(result.rows.map((r) => r.typname));
    client.release();
    await pool.end();

    const missing = REQUIRED_ENUMS.filter(
      (e) => !existingEnums.has(e.toLowerCase()),
    );

    if (missing.length > 0) {
      log.warn(
        `Missing enum types: ${missing.join(', ')}. The 20260404_ensure_enums_exist migration will create them.`,
      );
      return true; // Not a failure - migration will create them
    }

    log.success('All required enum types exist');
    return true;
  } catch (error) {
    log.error(
      `Failed to verify enums: ${error instanceof Error ? error.message : String(error)}`,
    );
    return false;
  }
};

const verifyTableStructure = async (): Promise<void> => {
  const databaseUrl = (process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    log.error('DATABASE_URL not set');
    return;
  }

  try {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const client = await pool.connect();

    // Check sms_events columns
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'sms_events' 
      ORDER BY ordinal_position
    `);

    const columns = result.rows.map((r) => r.column_name);
    const directionType = result.rows.find(
      (r) => r.column_name === 'direction',
    )?.data_type;

    log.info(`sms_events has ${columns.length} columns`);

    // Check direction column is TEXT (not enum type in info_schema)
    if (
      directionType &&
      directionType !== 'text' &&
      directionType !== 'USER-DEFINED'
    ) {
      log.warn(
        `direction column type is ${directionType}, expected text or enum`,
      );
    }

    // Check for expected new columns
    const expectedNewCols = [
      'delivery_status',
      'delivered_at',
      'read_at',
      'media_urls',
      'link_clicks',
    ];
    const missingCols = expectedNewCols.filter((c) => !columns.includes(c));
    if (missingCols.length > 0) {
      log.warn(`Missing new columns: ${missingCols.join(', ')}`);
    }

    // Check old columns are gone
    const removedCols = [
      'normalized_contact_key',
      'normalized_phone',
      'sequence_version_id',
      'event_role',
    ];
    const stillPresent = removedCols.filter((c) => columns.includes(c));
    if (stillPresent.length > 0) {
      log.warn(`Old columns still present: ${stillPresent.join(', ')}`);
    }

    client.release();
    await pool.end();

    log.success('Table structure verification complete');
  } catch (error) {
    log.warn(
      `Table structure check failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
};

const deployMigrations = async (): Promise<void> => {
  log.info('Starting production migration deployment...\n');

  const skipMigrations =
    (process.env.SKIP_MIGRATIONS || '').toLowerCase() === 'true';
  if (skipMigrations) {
    log.warn('SKIP_MIGRATIONS=true; skipping migration deployment');
    return;
  }

  // 1. Verify database connectivity
  log.info('Step 1/4: Verifying database connectivity...');
  const dbReady = await verifyDatabase();
  if (!dbReady) {
    log.error('Database verification failed; cannot proceed');
    process.exit(1);
  }

  // 1.5. Verify required PostgreSQL enum types exist
  log.info('Step 1.5/4: Verifying required enum types exist...');
  const enumsOk = await verifyEnumsExist();
  if (!enumsOk) {
    log.error('Enum verification failed; cannot proceed');
    process.exit(1);
  }

  // 2. Validate Prisma schema
  log.info('Step 2/4: Validating Prisma schema...');
  try {
    await run('npx', ['prisma', 'validate', '--config', 'prisma.config.ts']);
    log.success('Schema validation passed');
  } catch (_error) {
    log.error('Schema validation failed; cannot deploy migrations');
    process.exit(1);
  }

  // 3. Deploy migrations with drift handling
  // If the database has diverged from local migrations, use db push to sync
  // the schema without touching the migration history table.
  log.info('Step 3/4: Syncing database schema...');
  try {
    // Try standard migrate deploy first
    await run('npx', [
      'prisma',
      'migrate',
      'deploy',
      '--config',
      'prisma.config.ts',
    ]);
    log.success('Migrations deployed successfully');
  } catch (migrateError) {
    const msg = migrateError instanceof Error ? migrateError.message : String(migrateError);
    if (msg.includes('detected failed') || msg.includes('drift') || msg.includes('diverge')) {
      log.warn('Migration history diverged; using db push to sync schema...');
      try {
        await run('npx', [
          'prisma',
          'db',
          'push',
          '--config',
          'prisma.config.ts',
          '--accept-data-loss',
        ]);
        log.success('Database schema synced via db push');
      } catch (pushError) {
        log.error(
          `DB push failed: ${pushError instanceof Error ? pushError.message : String(pushError)}`,
        );
        process.exit(1);
      }
    } else {
      log.error(`Migration deployment failed: ${msg}`);
      process.exit(1);
    }
  }

  // 4. Generate Prisma client
  log.info('Step 4/4: Generating Prisma client...');
  try {
    await run('npx', ['prisma', 'generate', '--config', 'prisma.config.ts']);
    log.success('Prisma client generated');
  } catch (error) {
    log.error(
      `Prisma client generation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exit(1);
  }

  log.info('Final verification - checking table structure...');
  await verifyTableStructure();
  log.success('\n✨ Production migration deployment complete!');
};

// Main execution
deployMigrations().catch((error) => {
  log.error(
    `Unhandled error: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
