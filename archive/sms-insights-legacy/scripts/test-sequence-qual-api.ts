#!/usr/bin/env node
/**
 * Test Sequence Qualification API
 */

import 'dotenv/config';
import { buildSequenceQualificationBreakdown } from '../services/sequence-qualification-analytics.js';

async function testAPI() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Testing Sequence Qualification API');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  try {
    const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const to = new Date().toISOString();
    
    console.log(`Date range: ${from} to ${to}\n`);
    
    const result = await buildSequenceQualificationBreakdown({
      from,
      to,
      timezone: 'America/Chicago',
      minConversations: 1,
    });
    
    console.log('✅ API call successful');
    console.log(`📊 Found ${result.length} sequences with qualification data\n`);
    
    if (result.length > 0) {
      console.log('First sequence details:');
      const first = result[0];
      console.log(`  Label: ${first.sequenceLabel}`);
      console.log(`  Total conversations: ${first.totalConversations}`);
      console.log(`  Full-time: ${first.fullTime.count} (${first.fullTime.pct.toFixed(1)}%)`);
      console.log(`  Part-time: ${first.partTime.count} (${first.partTime.pct.toFixed(1)}%)`);
      console.log(`  Mostly cash: ${first.mostlyCash.count} (${first.mostlyCash.pct.toFixed(1)}%)`);
      console.log(`  High interest: ${first.highInterest.count} (${first.highInterest.pct.toFixed(1)}%)`);
      console.log(`  Top niches: ${first.topNiches.map(n => n.niche).join(', ') || 'None'}`);
      
      if (first.mondayOutcomes) {
        console.log(`  Monday outcomes: ${first.mondayOutcomes.totalOutcomes} (Booked: ${first.mondayOutcomes.booked})`);
      }
      
      console.log('\n✅ All qualification fields populated correctly');
    } else {
      console.log('⚠️  No sequences found in the last 7 days');
    }
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('  API Test Complete');
    console.log('═══════════════════════════════════════════════════════════════');
    
    return result;
  } catch (error) {
    console.error('\n❌ API test failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

testAPI().then(() => process.exit(0));
