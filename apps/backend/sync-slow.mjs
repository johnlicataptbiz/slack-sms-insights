import { getPrismaClient } from './services/prisma.ts';
import { syncBookedCallToPersonalBoardFromSlackMessage } from './services/monday-personal-writeback.ts';
import { getBookedCallAttributionSources } from './services/booked-calls.ts';

const prisma = getPrismaClient();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

async function syncOneAtATime() {
  console.log('\n🔄 Syncing calls ONE AT A TIME (to avoid rate limits)...\n');
  
  // Get calls from last 14 days for Jack
  const from = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const to = new Date();
  
  const sources = await getBookedCallAttributionSources({ from, to });
  const jackCalls = sources.filter(s => s.bucket === 'jack');
  
  console.log(`Found ${jackCalls.length} calls for Jack in last 14 days\n`);
  
  // Check which are already synced
  const pushStatuses = await prisma.monday_booked_call_pushes.findMany({
    where: {
      slack_channel_id: { in: jackCalls.map(c => c.slackChannelId) },
      slack_message_ts: { in: jackCalls.map(c => c.slackMessageTs) },
      status: 'synced',
    }
  });
  
  const syncedMap = new Set(
    pushStatuses.map(p => `${p.slack_channel_id}:${p.slack_message_ts}`)
  );
  
  const pending = jackCalls.filter(c => 
    !syncedMap.has(`${c.slackChannelId}:${c.slackMessageTs}`)
  );
  
  console.log(`${jackCalls.length - pending.length} already synced`);
  console.log(`${pending.length} pending sync\n`);
  
  if (pending.length === 0) {
    console.log('✅ All calls already synced!\n');
    await prisma.$disconnect();
    return;
  }
  
  console.log(`Syncing ${Math.min(pending.length, 10)} calls (max 10 for safety)...\n`);
  
  let synced = 0;
  let failed = 0;
  
  for (const call of pending.slice(0, 10)) {
    try {
      console.log(`Syncing: ${call.contactName || 'Unknown'} - ${call.eventTs.substring(0, 10)}...`);
      
      const result = await syncBookedCallToPersonalBoardFromSlackMessage(
        {
          channelId: call.slackChannelId,
          messageTs: call.slackMessageTs,
        },
        {
          info: () => {},
          debug: () => {},
          warn: (msg) => console.log(`  ${colors.yellow}⚠${colors.reset} ${msg}`),
          error: (msg) => console.log(`  ${colors.red}✗${colors.reset} ${msg}`),
        }
      );
      
      if (result.status === 'synced') {
        console.log(`  ${colors.green}✓${colors.reset} Synced successfully`);
        synced++;
      } else if (result.status === 'error') {
        console.log(`  ${colors.red}✗${colors.reset} Error`);
        failed++;
      } else {
        console.log(`  ${colors.yellow}⊘${colors.reset} Skipped: ${result.reason}`);
      }
      
      // Wait 2 seconds between calls to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
      
    } catch (error) {
      console.log(`  ${colors.red}✗${colors.reset} Exception: ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\n📊 Summary:`);
  console.log(`  ${colors.green}✓${colors.reset} Synced: ${synced}`);
  console.log(`  ${colors.red}✗${colors.reset} Failed: ${failed}`);
  console.log(`  Total processed: ${synced + failed}\n`);
  
  await prisma.$disconnect();
}

syncOneAtATime().catch(console.error);
