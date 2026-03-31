#!/usr/bin/env node
/**
 * Full Recovery Process for PTBizSMS
 *
 * This script orchestrates the complete recovery process including:
 * 1. Database status check
 * 2. Cleanup operations (duplicates, error runs)
 * 3. Backfill operations (Slack events, booked calls, contact profiles, qualifications)
 * 4. Data fixes and enrichment
 * 5. Sync operations (Monday.com)
 * 6. Verification and health checks
 *
 * Usage:
 *   cd sms-insights
 *   DATABASE_URL=... npx tsx scripts/full-recovery.ts [--skip-cleanup] [--skip-backfill] [--dry-run]
 */

import { execSync } from 'child_process';
import { config as loadEnv } from 'dotenv';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..');

interface RecoveryOptions {
  skipCleanup: boolean;
  skipBackfill: boolean;
  skipSync: boolean;
  skipFixes: boolean;
  dryRun: boolean;
  verbose: boolean;
}

function parseArgs(): RecoveryOptions {
  const args = process.argv.slice(2);
  return {
    skipCleanup: args.includes('--skip-cleanup'),
    skipBackfill: args.includes('--skip-backfill'),
    skipSync: args.includes('--skip-sync'),
    skipFixes: args.includes('--skip-fixes'),
    dryRun: args.includes('--dry-run'),
    verbose: args.includes('--verbose') || args.includes('-v'),
  };
}

function log(message: string, level: 'info' | 'success' | 'warning' | 'error' = 'info') {
  const timestamp = new Date().toISOString();
  const icons = {
    info: 'ℹ️',
    success: '✅',
    warning: '⚠️',
    error: '❌',
  };
  console.log(`${icons[level]} [${timestamp}] ${message}`);
}

function runCommand(command: string, description: string, options: RecoveryOptions): boolean {
  log(`${description}...`, 'info');

  if (options.verbose) {
    log(`Command: ${command}`, 'info');
  }

  if (options.dryRun) {
    log(`[DRY-RUN] Would execute: ${command}`, 'warning');
    return true;
  }

  try {
    const result = execSync(command, {
      cwd: PROJECT_ROOT,
      encoding: 'utf-8',
      stdio: 'pipe',
      env: process.env,
    });
    log(`${description} completed successfully`, 'success');
    if (result?.trim()) {
      console.log(result);
    }
    return true;
  } catch (error) {
    const execError = error as Error & {
      stdout?: string | Buffer;
      stderr?: string | Buffer;
    };
    log(`${description} failed: ${execError.message}`, 'error');
    if (options.verbose) {
      if (execError.stdout) {
        console.log(String(execError.stdout));
      }
      if (execError.stderr) {
        console.error(String(execError.stderr));
      }
    }
    return false;
  }
}

async function runStep(
  stepNumber: number,
  stepName: string,
  commands: Array<{ command: string; description: string }>,
  options: RecoveryOptions,
): Promise<boolean> {
  log('\n═══════════════════════════════════════════════════════════════', 'info');
  log(`STEP ${stepNumber}: ${stepName}`, 'info');
  log('═══════════════════════════════════════════════════════════════\n', 'info');

  let allSuccess = true;
  for (const { command, description } of commands) {
    const success = runCommand(command, description, options);
    if (!success) {
      allSuccess = false;
      if (!options.dryRun) {
        log(`Step ${stepNumber} failed. Continuing with next steps...`, 'warning');
      }
    }
  }

  return allSuccess;
}

async function main(): Promise<boolean> {
  const options = parseArgs();

  loadEnv({ path: resolve(PROJECT_ROOT, '.env') });

  if (!process.env.DATABASE_URL) {
    log('DATABASE_URL is not set. Recovery commands may fail.', 'warning');
  }

  log('\n╔═══════════════════════════════════════════════════════════════╗', 'info');
  log('║           PTBIZSMS FULL RECOVERY PROCESS                      ║', 'info');
  log('╚═══════════════════════════════════════════════════════════════╝\n', 'info');

  if (options.dryRun) {
    log('⚠️  DRY RUN MODE - No changes will be applied\n', 'warning');
  }

  const results: Record<string, boolean> = {};

  // Step 1: Database Status Check
  results.step1 = await runStep(
    1,
    'DATABASE STATUS CHECK',
    [
      {
        command: 'npx tsx scripts/check-db-status.ts',
        description: 'Checking database connection and data volumes',
      },
    ],
    options,
  );

  // Step 2: Cleanup Operations
  if (!options.skipCleanup) {
    results.step2 = await runStep(
      2,
      'CLEANUP OPERATIONS',
      [
        {
          command: 'npx tsx scripts/cleanup-daily-runs.ts --apply --days-back 90',
          description: 'Cleaning up duplicate daily runs (90 days)',
        },
        {
          command: 'npx tsx scripts/cleanup-error-runs.ts --apply',
          description: 'Cleaning up error runs',
        },
        {
          command: 'npx tsx scripts/cleanup-booked-calls-dupes.ts --apply',
          description: 'Cleaning up duplicate booked calls',
        },
      ],
      options,
    );
  } else {
    log('⏭️  Skipping cleanup operations (--skip-cleanup)', 'warning');
    results.step2 = true;
  }

  // Step 3: Backfill Operations
  if (!options.skipBackfill) {
    results.step3 = await runStep(
      3,
      'BACKFILL OPERATIONS',
      [
        {
          command: 'npx tsx scripts/backfill-slack-events.ts',
          description: 'Backfilling Slack SMS events',
        },
        {
          command: 'npx tsx scripts/backfill-booked-calls.ts',
          description: 'Backfilling booked call records',
        },
        {
          command: 'npx tsx scripts/backfill-contact-profiles.ts',
          description: 'Backfilling contact profiles',
        },
        {
          command: 'npx tsx scripts/backfill-contact-profiles-lrn.ts',
          description: 'Backfilling contact profiles with LRN data',
        },
        {
          command: 'npx tsx scripts/backfill-qualification.ts',
          description: 'Backfilling qualification data from conversations',
        },
      ],
      options,
    );
  } else {
    log('⏭️  Skipping backfill operations (--skip-backfill)', 'warning');
    results.step3 = true;
  }

  // Step 4: Data Fixes and Enrichment
  if (!options.skipFixes) {
    results.step4 = await runStep(
      4,
      'DATA FIXES AND ENRICHMENT',
      [
        {
          command: 'npx tsx scripts/apply-all-fixes.ts',
          description: 'Applying all data fixes (employment, interest, revenue)',
        },
        {
          command: 'npx tsx scripts/final-fixes.ts',
          description: 'Applying final fixes and templates',
        },
        {
          command: 'npx tsx scripts/refresh-booked-call-attribution.ts',
          description: 'Refreshing booked call attribution',
        },
        {
          command: 'npx tsx scripts/recompute-all-qualifications.ts',
          description: 'Recomputing all qualifications',
        },
      ],
      options,
    );
  } else {
    log('⏭️  Skipping data fixes (--skip-fixes)', 'warning');
    results.step4 = true;
  }

  // Step 5: Monday.com Sync Operations
  if (!options.skipSync) {
    results.step5 = await runStep(
      5,
      'MONDAY.COM SYNC OPERATIONS',
      [
        {
          command: 'npx tsx scripts/sync-monday.ts',
          description: 'Syncing records to Monday.com',
        },
        {
          command: 'npx tsx scripts/check-monday-lead-normalization.ts',
          description: 'Checking Monday lead normalization',
        },
        {
          command: 'npx tsx scripts/rebuild-monday-governed-analytics.ts',
          description: 'Rebuilding Monday governed analytics',
        },
      ],
      options,
    );
  } else {
    log('⏭️  Skipping Monday sync operations (--skip-sync)', 'warning');
    results.step5 = true;
  }

  // Step 6: Verification and Health Checks
  results.step6 = await runStep(
    6,
    'VERIFICATION AND HEALTH CHECKS',
    [
      {
        command: 'npx tsx scripts/check-db-status.ts',
        description: 'Re-checking database health and volumes',
      },
      {
        command: 'npx tsx scripts/verify-sales-metrics.ts',
        description: 'Verifying sales metrics integrity',
      },
      {
        command: 'npx tsx scripts/check-booked-calls.ts',
        description: 'Validating booked calls consistency',
      },
      {
        command: 'npx tsx scripts/check-qual-counts.ts',
        description: 'Validating qualification counts',
      },
    ],
    options,
  );

  const orderedResults: Array<{ key: string; label: string }> = [
    { key: 'step1', label: 'Database status check' },
    { key: 'step2', label: 'Cleanup operations' },
    { key: 'step3', label: 'Backfill operations' },
    { key: 'step4', label: 'Data fixes and enrichment' },
    { key: 'step5', label: 'Monday.com sync operations' },
    { key: 'step6', label: 'Verification and health checks' },
  ];

  log('\n╔═══════════════════════════════════════════════════════════════╗', 'info');
  log('║                 RECOVERY SUMMARY                              ║', 'info');
  log('╚═══════════════════════════════════════════════════════════════╝', 'info');

  for (const { key, label } of orderedResults) {
    const passed = results[key] === true;
    log(`${label.padEnd(36)} ${passed ? '✅ PASS' : '❌ FAIL'}`, passed ? 'success' : 'error');
  }

  const overallSuccess = orderedResults.every(({ key }) => results[key] === true);
  if (overallSuccess) {
    log('Full recovery process completed successfully.', 'success');
  } else {
    log('Full recovery process completed with one or more failures. Review logs above.', 'warning');
  }

  return overallSuccess;
}

main()
  .then((success) => {
    process.exit(success ? 0 : 1);
  })
  .catch((error) => {
    log(`Unhandled error in full recovery: ${error instanceof Error ? error.message : String(error)}`, 'error');
    process.exit(1);
  });
