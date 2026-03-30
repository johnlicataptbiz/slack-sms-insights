/**
 * Data Migration Script: conversation_state normalization
 *
 * Migrates data from conversation_state to qualification_profile and escalation_log tables
 * Run after schema migrations are applied
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({});

async function migrateConversationState() {
  console.log('Starting conversation_state data migration...');

  try {
    // Get all conversation_state records
    const states = await prisma.conversation_state.findMany({
      include: { conversation: true }
    });

    console.log(`Found ${states.length} conversation_state records to migrate`);

    for (const state of states) {
      // Create qualification_profile
      if (state.qualification_score || state.qualification_status || state.last_qualification_at) {
        await prisma.qualification_profile.create({
          data: {
            conversation_id: state.conversation_id,
            qualification_score: state.qualification_score,
            qualification_status: state.qualification_status,
            last_qualification_at: state.last_qualification_at,
            qualification_completed_at: state.qualification_completed_at,
            qualification_completed_by: state.qualification_completed_by,
          }
        });
        console.log(`Created qualification_profile for conversation ${state.conversation_id}`);
      }

      // Create escalation_log if escalation exists
      if (state.escalation_level && state.escalation_level !== 'none') {
        await prisma.escalation_log.create({
          data: {
            conversation_id: state.conversation_id,
            escalation_level: state.escalation_level,
            escalation_created_at: state.escalation_created_at,
            escalation_resolved_at: state.escalation_resolved_at,
            escalation_resolved_by: state.escalation_resolved_by,
          }
        });
        console.log(`Created escalation_log for conversation ${state.conversation_id}`);
      }
    }

    console.log('Data migration completed successfully');

    // Optional: Remove migrated fields from conversation_state
    // This would require another migration to drop columns

  } catch (error) {
    console.error('Migration failed:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run if called directly
if (require.main === module) {
  migrateConversationState()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = { migrateConversationState };