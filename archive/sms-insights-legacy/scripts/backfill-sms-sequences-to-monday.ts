#!/usr/bin/env tsx
/**
 * Backfill SMS sequences to Monday.com
 *
 * This script syncs SMS sequence performance data to Monday.com SMS Sequences board.
 * Usage: npx tsx scripts/backfill-sms-sequences-to-monday.ts [--days 90] [--board-id BOARD_ID]
 *
 * @example
 * npx tsx scripts/backfill-sms-sequences-to-monday.ts
 * npx tsx scripts/backfill-sms-sequences-to-monday.ts --days 30
 * npx tsx scripts/backfill-sms-sequences-to-monday.ts --board-id 1234567890
 */

import { syncMondaySmsSequencesBoard } from '../services/monday-sms-sequences.js';
import { getPrisma } from '../services/prisma.js';

const args = process.argv.slice(2);
const daysParam = args.find((arg) => arg.startsWith('--days='));
const boardIdParam = args.find((arg) => arg.startsWith('--board-id='));

const daysBack = daysParam ? Number.parseInt(daysParam.split('=')[1], 10) : 90;
const boardId = boardIdParam ? boardIdParam.split('=')[1] : process.env.MONDAY_SMS_SEQUENCES_BOARD_ID;

if (!boardId) {
  console.error('Error: MONDAY_SMS_SEQUENCES_BOARD_ID environment variable or --board-id argument is required');
  process.exit(1);
}

async function main() {
  console.log('🚀 Starting SMS Sequences backfill to Monday.com');
  console.log(`📅 Days back: ${daysBack}`);
  console.log(`📱 Board ID: ${boardId}`);
  console.log('');

  const prisma = getPrisma();
  const logger = {
    info: (msg: string, data?: Record<string, unknown>) => {
      console.log('ℹ️  [INFO]', msg, data ? JSON.stringify(data) : '');
    },
    debug: (msg: string, data?: Record<string, unknown>) => {
      console.log('🔍 [DEBUG]', msg, data ? JSON.stringify(data) : '');
    },
    warn: (msg: string, data?: Record<string, unknown>) => {
      console.log('⚠️  [WARN]', msg, data ? JSON.stringify(data) : '');
    },
    error: (msg: string, data?: Record<string, unknown>) => {
      console.error('❌ [ERROR]', msg, data ? JSON.stringify(data) : '');
    },
  };

  try {
    // Get the cutoff date
    const cutoffDate = new Date();
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - daysBack);
    logger.info('Cutoff date', { cutoffDate: cutoffDate.toISOString() });

    // Count sequence registry records to be synced
    const sequenceCount = await prisma.sequence_registry.count({
      where: {
        created_at: {
          gte: cutoffDate,
        },
      },
    });
    logger.info('Total sequence registry records to sync', { count: sequenceCount });

    if (sequenceCount === 0) {
      console.log('✅ No sequence registry records to sync');
      return;
    }

    // Sync the board
    console.log('');
    console.log('🔄 Starting sync...');
    const result = await syncMondaySmsSequencesBoard(boardId, logger, { force: true });

    console.log('');
    console.log('📊 Sync Result:');
    console.log(`   Status: ${result.status}`);
    console.log(`   Fetched Items: ${result.fetchedItems}`);
    console.log(`   Upserted Items: ${result.upsertedItems}`);
    console.log(`   Started At: ${result.startedAt}`);
    console.log(`   Finished At: ${result.finishedAt}`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }

    if (result.status === 'success') {
      console.log('');
      console.log('✅ SMS Sequences backfill completed successfully!');
    } else {
      console.log('');
      console.log('❌ SMS Sequences backfill failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();