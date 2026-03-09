import { getPrismaClient } from '../services/prisma.js';
import { inferQualificationStateFromMessages } from '../services/qualification-inference.js';
import { listMessagesForConversation, updateConversationState } from '../services/inbox-store.js';
import 'dotenv/config';

async function runBackfill() {
  const prisma = getPrismaClient();
  console.log('🚀 Starting Comprehensive Qualification Backfill...');

  // 1. Get all conversation states
  const states = await prisma.conversation_state.findMany({
    orderBy: { updated_at: 'desc' }
  });

  console.log(`📊 Found ${states.length} conversations to analyze.`);

  let updatedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;
  let totalInboundFound = 0;

  for (let i = 0; i < states.length; i++) {
    const state = states[i];
    const conversationId = state.conversation_id;

    if (i % 50 === 0 && i > 0) {
      console.log(`⏳ Progress: ${i}/${states.length} (${updatedCount} updated, ${skippedCount} skipped, ${totalInboundFound} w/ inbound)`);
    }

    try {
      // 2. Fetch messages for this conversation
      const messages = await listMessagesForConversation(conversationId, 500);

      if (!messages || messages.length === 0) {
        skippedCount++;
        continue;
      }

      const inboundCount = messages.filter(m => m.direction === 'inbound').length;
      if (inboundCount > 0) totalInboundFound++;

      // 3. Run inference (allow overwrite known to get the BEST data from the new patterns)
      const result = inferQualificationStateFromMessages(
        state as any,
        messages as any,
        { allowOverwriteKnown: true }
      );

      if (result.changed) {
        if (updatedCount < 5) {
          console.log(`✨ UPDATING ${conversationId}:`, JSON.stringify(result.updates, null, 2));
        }
        // 4. Update the database
        await updateConversationState(conversationId, result.updates);
        updatedCount++;
      } else {
        skippedCount++;
      }
    } catch (err) {
      console.error(`❌ Error processing conversation ${conversationId}:`, err);
      errorCount++;
    }
  }

  console.log('\n✅ Backfill Complete!');
  console.log('---------------------------');
  console.log(`Total Processed: ${states.length}`);
  console.log(`Total Updated:   ${updatedCount}`);
  console.log(`Total Skipped:   ${skippedCount}`);
  console.log(`Total Errors:    ${errorCount}`);
  console.log('---------------------------');

  process.exit(0);
}

runBackfill().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
