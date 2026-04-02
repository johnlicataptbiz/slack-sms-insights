import { getPrismaClient } from './services/prisma.ts';

const prisma = getPrismaClient();

async function checkSyncStatus() {
  console.log('\n🔍 Checking sync status...\n');

  // Get recent booked calls from last 14 days
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

  const calls = await prisma.booked_calls.findMany({
    where: {
      event_ts: { gte: twoWeeksAgo },
    },
    orderBy: { event_ts: 'desc' },
    take: 10,
  });

  console.log(`Found ${calls.length} recent booked calls\n`);

  for (const call of calls) {
    const pushStatus = await prisma.monday_booked_call_pushes.findFirst({
      where: {
        slack_channel_id: call.slack_channel_id,
        slack_message_ts: call.slack_message_ts,
      },
    });

    console.log(`📅 ${call.event_ts.toISOString().split('T')[0]}`);
    console.log(`   Message: ${call.text?.substring(0, 50) || 'N/A'}`);
    console.log(`   Channel: ${call.slack_channel_id}`);
    console.log(`   Sync status: ${pushStatus ? pushStatus.status : 'NOT TRACKED'}`);
    console.log(`   Monday item: ${pushStatus?.monday_item_id || 'N/A'}`);
    console.log('');
  }

  await prisma.$disconnect();
}

checkSyncStatus().catch(console.error);
