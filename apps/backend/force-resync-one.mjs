import { getPrismaClient } from './services/prisma.ts';

const prisma = getPrismaClient();

async function forceResyncOneCall() {
  console.log('\n🔄 Finding a call to force re-sync...\n');

  // Get a recent call that was synced
  const recentSync = await prisma.monday_booked_call_pushes.findFirst({
    where: {
      status: 'synced',
      updated_at: {
        gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
      },
    },
    orderBy: { updated_at: 'desc' },
  });

  if (!recentSync) {
    console.log('No recent synced calls found\n');
    await prisma.$disconnect();
    return;
  }

  console.log('Found call to re-sync:');
  console.log(`  Slack Channel: ${recentSync.slack_channel_id}`);
  console.log(`  Slack Message: ${recentSync.slack_message_ts}`);
  console.log(`  Current Monday Item: ${recentSync.monday_item_id}`);
  console.log(`  Last Synced: ${recentSync.updated_at}`);
  console.log('');

  // Delete this tracking record to force re-sync
  await prisma.monday_booked_call_pushes.delete({
    where: {
      board_id_slack_channel_id_slack_message_ts: {
        board_id: recentSync.board_id,
        slack_channel_id: recentSync.slack_channel_id,
        slack_message_ts: recentSync.slack_message_ts,
      },
    },
  });

  console.log('✅ Deleted sync tracking record - this call will re-sync now!\n');

  await prisma.$disconnect();
}

forceResyncOneCall().catch(console.error);
