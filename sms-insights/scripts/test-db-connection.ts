#!/usr/bin/env node
/**
 * Simple Database Connection Test
 * Tests the current database connection using the existing Prisma service
 */

import 'dotenv/config';
import { getPrismaClient } from '../services/prisma.js';

async function testConnection() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Database Connection Test');
  console.log('═══════════════════════════════════════════════════════════════\n');

  try {
    const prisma = getPrismaClient();
    console.log('✅ Prisma client initialized\n');

    // Test basic connection
    const testResult = await prisma.$queryRaw`SELECT 1 as test`;
    console.log('✅ Database connection successful\n');

    // Check key tables
    console.log('📊 Checking key tables...\n');
    const tables = ['conversations', 'conversation_state', 'sms_events', 'booked_calls'];
    
    for (const table of tables) {
      try {
        const result = await prisma.$queryRawUnsafe<{ count: number }[]>(
          `SELECT COUNT(*) as count FROM "${table}"`
        );
        const count = Number(result[0]?.count || 0);
        console.log(`  ✅ ${table}: ${count.toLocaleString()} rows`);
      } catch (e) {
        console.log(`  ❌ ${table}: Error reading table`);
      }
    }

    // Check qualification data
    console.log('\n🔍 Checking qualification data...\n');
    try {
      const qualResult = await prisma.$queryRawUnsafe<{ count: number }[]>(`
        SELECT COUNT(*) as count 
        FROM conversation_state 
        WHERE qualification_full_or_part_time != 'unknown'
           OR qualification_revenue_mix != 'unknown'
           OR qualification_coaching_interest != 'unknown'
      `);
      const qualCount = Number(qualResult[0]?.count || 0);
      console.log(`  ✅ Conversations with qualification data: ${qualCount.toLocaleString()}`);
      
      const totalResult = await prisma.$queryRawUnsafe<{ count: number }[]>(
        `SELECT COUNT(*) as count FROM conversation_state`
      );
      const totalCount = Number(totalResult[0]?.count || 0);
      console.log(`  📊 Total conversation states: ${totalCount.toLocaleString()}`);
      
      if (qualCount > 0) {
        console.log(`  🎯 Qualification coverage: ${((qualCount / totalCount) * 100).toFixed(1)}%`);
      }
    } catch (e) {
      console.log('  ❌ Error checking qualification data');
    }

    // Check sequence qualification API
    console.log('\n🔍 Checking sequence qualification service...\n');
    try {
      const { buildSequenceQualificationBreakdown } = await import('../services/sequence-qualification-analytics.js');
      const qualData = await buildSequenceQualificationBreakdown({
        from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        to: new Date().toISOString(),
        timezone: 'America/Chicago',
        minConversations: 1,
      });
      console.log(`  ✅ Sequence qualification service working`);
      console.log(`  📊 Found ${qualData.length} sequences with qualification data`);
    } catch (e) {
      console.log(`  ⚠️  Sequence qualification service error: ${e instanceof Error ? e.message : String(e)}`);
    }

    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  Connection Test Complete');
    console.log('═══════════════════════════════════════════════════════════════');

    await prisma.$disconnect();
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Connection test failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

testConnection();
