#!/usr/bin/env tsx
/**
 * Weekly Monday intelligent maintenance:
 * - optional dedupe scripts
 * - graph relink reconciliation (events -> sequences -> reports)
 * - sync diagnostics + KPI parity summary
 *
 * Usage:
 *   npx tsx scripts/run-monday-intelligence-maintenance.ts [--with-dedupe]
 */

import { execSync } from 'node:child_process';
import { syncMondaySmsBoard } from '../services/monday-sms-sync.js';
import { syncMondaySmsSequencesBoard } from '../services/monday-sms-sequences.js';
import { syncMondaySmsReportsBoard } from '../services/monday-sms-reports.js';
import { runMondaySmsIntelligentGraphReconciliation } from '../services/monday-sms-intelligence.js';

const withDedupe = process.argv.includes('--with-dedupe');

const ids = {
  eventsBoardId: (process.env.MONDAY_SMS_EVENTS_BOARD_ID || '').trim(),
  sequencesBoardId: (process.env.MONDAY_SMS_SEQUENCES_BOARD_ID || '').trim(),
  reportsBoardId: (process.env.MONDAY_SMS_REPORTS_BOARD_ID || '').trim(),
};

const logger = {
  info: (message: string, data?: Record<string, unknown>) =>
    console.log(`ℹ️  ${message}${data ? ` ${JSON.stringify(data)}` : ''}`),
  debug: (message: string, data?: Record<string, unknown>) =>
    console.log(`🔎 ${message}${data ? ` ${JSON.stringify(data)}` : ''}`),
  warn: (message: string, data?: Record<string, unknown>) =>
    console.warn(`⚠️  ${message}${data ? ` ${JSON.stringify(data)}` : ''}`),
  error: (message: string, data?: Record<string, unknown>) =>
    console.error(`❌ ${message}${data ? ` ${JSON.stringify(data)}` : ''}`),
};

const runOptionalDedupe = () => {
  if (!withDedupe) return;
  logger.info('Running optional dedupe scripts');
  execSync('npx tsx scripts/dedupe-monday-items.ts', { stdio: 'inherit' });
  execSync('npx tsx scripts/dedupe-monday-board-registry.ts', { stdio: 'inherit' });
};

async function main(): Promise<void> {
  if (!ids.eventsBoardId || !ids.sequencesBoardId || !ids.reportsBoardId) {
    throw new Error('Missing one or more MONDAY_SMS_*_BOARD_ID variables');
  }

  logger.info('Starting Monday intelligence maintenance', {
    boardIds: ids,
    withDedupe,
    dryRun: process.env.MONDAY_SMS_INTELLIGENCE_DRY_RUN || 'true',
  });
  runOptionalDedupe();

  const reconcileStats = await runMondaySmsIntelligentGraphReconciliation(ids, logger);
  logger.info('Graph reconciliation finished', { reconcileStats });

  const [events, sequences, reports] = await Promise.all([
    syncMondaySmsBoard(ids.eventsBoardId, logger),
    syncMondaySmsSequencesBoard(ids.sequencesBoardId, logger),
    syncMondaySmsReportsBoard(ids.reportsBoardId, logger),
  ]);

  const diagnostics = [events, sequences, reports].map((entry) => ({
    boardId: entry.boardId,
    status: entry.status,
    fetchedItems: entry.fetchedItems,
    upsertedItems: entry.upsertedItems,
    structureValid: entry.diagnostics.structureValid,
    linkCoverage: entry.diagnostics.linkCoverage,
    duplicatesDetected: entry.diagnostics.duplicatesDetected,
    kpiParityDelta: entry.diagnostics.kpiParityDelta,
    missingColumns: entry.diagnostics.missingColumns,
    driftedColumns: entry.diagnostics.driftedColumns,
  }));

  logger.info('Maintenance complete', { diagnostics });
}

main().catch((error) => {
  console.error('❌ Monday intelligence maintenance failed', error);
  process.exit(1);
});

