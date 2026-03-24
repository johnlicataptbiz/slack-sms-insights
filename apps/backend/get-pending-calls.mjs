import { getPrismaClient } from './services/prisma.ts';
import { getBookedCallAttributionSources } from './services/booked-calls.ts';

const prisma = getPrismaClient();

async function getPendingCalls() {
  const from = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const to = new Date();
  
  const sources = await getBookedCallAttributionSources({ from, to });
  const jackCalls = sources.filter(s => s.bucket === 'jack');
  
  // Check which are synced
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
  
  const pending = jackCalls
    .filter(c => !syncedMap.has(`${c.slackChannelId}:${c.slackMessageTs}`))
    .sort((a, b) => new Date(b.eventTs).getTime() - new Date(a.eventTs).getTime())
    .slice(0, 10); // Get 10 most recent
  
  console.log(`\nFound ${pending.length} most recent pending calls:\n`);
  
  pending.forEach((call, idx) => {
    console.log(`${idx + 1}. ${call.contactName || 'Unknown'} - ${call.eventTs.substring(0, 10)}`);
    console.log(`   Line: ${call.line || 'NULL'}`);
    console.log(`   First Conversion: ${call.firstConversion || 'NULL'}`);
    console.log(`   Phone: ${call.contactPhone || 'NULL'}`);
    console.log('');
  });
  
  await prisma.$disconnect();
  
  return pending;
}

getPendingCalls().catch(console.error);
