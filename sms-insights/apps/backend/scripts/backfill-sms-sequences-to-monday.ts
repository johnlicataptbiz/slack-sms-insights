#!/usr/bin/env tsx
/**
 * Backfill SMS sequences to Monday.com - TypeScript clean version.
 * Fixed: getPrisma → getPrismaClient, proper Prisma typing, camelCase models.
 */

import { syncMondaySmsSequencesBoard } from '../services/monday-sms-sequences.js';
import { getPrismaClient } from '../services/prisma.js';
import type { Logger } from '@slack/bolt';
import type { Prisma } from '@prisma/client';

const args = process.argv.slice(2);
const daysParam = args.find((arg) => arg.startsWith('--days='));
const boardIdParam = args.find((arg) => arg.startsWith('--board-id='));

const daysBack = daysParam ? Number.parseInt(daysParam.split('=')[1], 10) : 90;
const boardId = boardIdParam ? boardIdParam.split('=')[1] : process.env.MONDAY_SMS_SEQUENCES_BOARD_ID;

if (!boardId) {
  console.error('❌ Error: MONDAY_SMS_SEQUENCES_BOARD_ID env var or --board-id required');
  process.exit(1);
}

async function main(): Promise<void> {
  console.log('🚀 Starting SMS Sequences backfill to Monday.com');
  console.log(`📅 Days back: ${daysBack}`);
  console.log(`📱 Board ID: ${boardId}`);
  console.log('');

  const prisma = getPrismaClient();
  const logger: Logger = {
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
  } as Logger;

  try {
    const cutoffDate = new Date();
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - daysBack);
    logger.info('Cutoff date set', { cutoffDate: cutoffDate.toISOString() });

    // Count active sequences
    const sequenceCount = await prisma.sequenceRegistry.count({
      where: {
        created_at: {
          gte: cutoffDate,
        },
      },
    });
    logger.info('Sequence registry records found', { count: sequenceCount });

    if (sequenceCount === 0) {
      console.log('✅ No sequence registry records need syncing');
      return;
    }

    console.log('');
    console.log('🔄 Executing sync...');
    const result = await syncMondaySmsSequencesBoard(boardId, logger, { force: true });

    console.log('');
    console.log('📊 Sync Summary:');
    console.log(`   Status: ${result.status}`);
    console.log(`   Fetched: ${result.fetchedItems}`);
    console.log(`   Upserted: ${result.upsertedItems}`);
    console.log(`   Duration: ${result.finishedAt - result.startedAt}ms`);
    
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }

    if (result.status === 'success') {
      console.log('\n✅ SMS Sequences backfill **COMPLETELY SUCCESSFUL**');
    } else {
      console.log('\n❌ Backfill failed');
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ Fatal backfill error:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

