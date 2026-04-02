#!/usr/bin/env node
/**
 * Check Database Status
 * Verifies which database is currently connected and its key characteristics
 */

import 'dotenv/config';
import { getPrismaClient } from '../services/prisma.js';

async function checkDatabaseStatus() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Database Status Check');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const prisma = getPrismaClient();

  try {
    // Check connection
    await prisma.$queryRaw`SELECT 1`;
    console.log('✅ Database connection successful\n');

    // Check database name and version
    const dbInfo = await prisma.$queryRaw<{ db: string; version: string }[]>`
      SELECT current_database() as db, version() as version
    `;
    console.log('Database Info:');
    console.log(`  Name: ${dbInfo[0].db}`);
    console.log(`  Version: ${dbInfo[0].version.split(' ')[0]}\n`);

    // Check for ptbizsms-specific tables
    const keyTables = [
      'lead_outcomes',
      'lead_attribution', 
      'monday_board_registry',
      'monday_call_snapshots',
      'sequence_version_decisions',
      'conversion_examples'
    ];
    
    console.log('Checking for ptbizsms-specific tables:');
    for (const table of keyTables) {
      const exists = await prisma.$queryRaw<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = ${table}
        ) as exists
      `;
      const status = exists[0].exists ? '✅' : '❌';
      console.log(`  ${status} ${table}`);
    }

    // Check data volumes
    console.log('\nData Volumes:');
    const tables = ['conversations', 'conversation_state', 'sms_events', 'booked_calls', 'lead_outcomes'];
    for (const table of tables) {
      try {
        const result = await prisma.$queryRaw<{ count: number }[]>`
          SELECT COUNT(*) as count FROM "${table}"
        `;
        const count = Number(result[0].count);
        console.log(`  ${table}: ${count.toLocaleString()} rows`);
      } catch (e) {
        console.log(`  ${table}: Error or not found`);
      }
    }

    // Check qualification data
    console.log('\nQualification Data:');
    const qualResult = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*) as count 
      FROM conversation_state 
      WHERE qualification_full_or_part_time != 'unknown'
         OR qualification_revenue_mix != 'unknown'
         OR qualification_coaching_interest != 'unknown'
    `;
    const qualCount = Number(qualResult[0].count);
    
    const totalResult = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*) as count FROM conversation_state
    `;
    const totalCount = Number(totalResult[0].count);
    
    console.log(`  Conversations with qualification: ${qualCount.toLocaleString()}`);
    console.log(`  Total conversation states: ${totalCount.toLocaleString()}`);
    console.log(`  Coverage: ${((qualCount / totalCount) * 100).toFixed(1)}%`);

    // Determine if this is the ptbizsms database
    const hasLeadOutcomes = await prisma.$queryRaw<{ exists: boolean }[]>`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'lead_outcomes'
      ) as exists
    `;

    console.log('\n═══════════════════════════════════════════════════════════════');
    if (hasLeadOutcomes[0].exists) {
      console.log('  ✅ This appears to be the PTBIZSMS database');
      console.log('  (Contains lead_outcomes table - specific to ptbizsms)');
    } else {
      console.log('  ⚠️  This appears to be the OLD database');
      console.log('  (Missing lead_outcomes table)');
    }
    console.log('═══════════════════════════════════════════════════════════════');

    await prisma.$disconnect();
  } catch (error) {
    console.error('\n❌ Database check failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

checkDatabaseStatus();
