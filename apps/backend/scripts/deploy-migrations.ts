/**
 * Production Migration Deployment Script
 * Runs Prisma migrations and verifies database alignment
 * Must run before app.ts starts
 * Usage: node --import tsx scripts/deploy-migrations.ts
 */

import { spawn } from 'node:child_process';
import { join } from 'node:path';
import 'dotenv/config';

const __dirname = new URL('.', import.meta.url).pathname;
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
        reject(new Error(`Command exited with code ${code}: ${cmd} ${args.join(' ')}`));
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
      log.warn('_prisma_migrations table not found; database may need initialization');
      return false;
    }

    log.success('Database connection verified');
    return true;
  } catch (error) {
    log.error(`Failed to verify database: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
};

const deployMigrations = async (): Promise<void> => {
  log.info('Starting production migration deployment...\n');

  const skipMigrations = (process.env.SKIP_MIGRATIONS || '').toLowerCase() === 'true';
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

  // 2. Validate Prisma schema
  log.info('Step 2/4: Validating Prisma schema...');
  try {
    await run('npx', ['prisma', 'validate', '--config', 'prisma.config.ts']);
    log.success('Schema validation passed');
  } catch (_error) {
    log.error('Schema validation failed; cannot deploy migrations');
    process.exit(1);
  }

  // 3. Deploy migrations
  log.info('Step 3/4: Deploying Prisma migrations...');
  try {
    await run('npx', ['prisma', 'migrate', 'deploy', '--config', 'prisma.config.ts']);
    log.success('Migrations deployed successfully');
  } catch (error) {
    log.error(`Migration deployment failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  // 4. Generate Prisma client
  log.info('Step 4/4: Generating Prisma client...');
  try {
    await run('npx', ['prisma', 'generate', '--config', 'prisma.config.ts']);
    log.success('Prisma client generated');
  } catch (error) {
    log.error(`Prisma client generation failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }

  log.success('\n✨ Production migration deployment complete!');
};

// Main execution
deployMigrations().catch((error) => {
  log.error(`Unhandled error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
