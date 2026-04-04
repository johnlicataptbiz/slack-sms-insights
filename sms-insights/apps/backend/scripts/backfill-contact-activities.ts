/**
 * Backfill contact_activities from sms_events
 * Creates unified activity timeline entries from existing SMS data
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function backfillContactActivities() {
  console.log('📋 Starting contact_activities backfill...\n');

  try {
    // Get all SMS events grouped by contact
    const smsEvents = await prisma.sms_events.findMany({
      select: {
        id: true,
        contact_id: true,
        contact_phone: true,
        normalized_contact_key: true,
        direction: true,
        body: true,
        aloware_user: true,
        event_ts: true,
        conversation_id: true,
        sequence: true,
        event_role: true,
      },
      orderBy: {
        event_ts: 'asc',
      },
    });

    console.log(`Found ${smsEvents.length} SMS events to process`);

    let created = 0;
    let skipped = 0;
    const BATCH_SIZE = 100;
    const batch: {
      contact_key: string;
      activity_type: 'sms_inbound' | 'sms_outbound';
      reference_id: string;
      reference_type: string;
      rep_id: string | null;
      summary: string;
      occurred_at: Date;
    }[] = [];

    for (const event of smsEvents) {
      const contactKey = event.normalized_contact_key || event.contact_phone || event.contact_id;
      if (!contactKey) {
        skipped++;
        continue;
      }

      // Check if activity already exists for this event
      const existing = await prisma.contactActivities.findFirst({
        where: {
          reference_id: event.id,
          reference_type: 'sms',
        },
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Create activity entry
      batch.push({
        contact_key: contactKey,
        activity_type: event.direction === 'inbound' ? 'sms_inbound' : 'sms_outbound',
        reference_id: event.id,
        reference_type: 'sms',
        rep_id: event.aloware_user,
        summary: event.body ? event.body.substring(0, 200) : null,
        occurred_at: event.event_ts,
      });

      // Process batch
      if (batch.length >= BATCH_SIZE) {
        await prisma.contactActivities.createMany({
          data: batch,
        });
        created += batch.length;
        console.log(`  Processed ${created} activities...`);
        batch.length = 0;
      }
    }

    // Process remaining batch
    if (batch.length > 0) {
      await prisma.contactActivities.createMany({
        data: batch,
      });
      created += batch.length;
    }

    console.log(`\n✅ Created ${created} new activities`);
    console.log(`⏭️  Skipped ${skipped} existing activities`);

    // Now add status change activities from conversation_state
    console.log('\n📊 Processing conversation state changes...');

    const conversations = await prisma.conversation.findMany({
      include: {
        conversation_state: true,
      },
    });

    let stateChanges = 0;
    const stateBatch: {
      contact_key: string;
      activity_type: 'status_change';
      reference_id: string;
      reference_type: string;
      summary: string;
      metadata: object;
      occurred_at: Date;
    }[] = [];

    for (const conv of conversations) {
      if (!conv.conversation_state) continue;

      // Create qualification change activity
      stateBatch.push({
        contact_key: conv.contactKey,
        activity_type: 'status_change',
        reference_id: conv.id,
        reference_type: 'conversation',
        summary: `Conversation status: ${conv.status}`,
        metadata: {
          qualification_step: conv.conversation_state.qualification_progress_step,
          cadence_status: conv.conversation_state.cadence_status,
          escalation_level: conv.conversation_state.escalation_level,
        },
        occurred_at: conv.updatedAt,
      });
      stateChanges++;

      if (stateBatch.length >= 50) {
        await prisma.contactActivities.createMany({ data: stateBatch });
        stateBatch.length = 0;
      }
    }

    if (stateBatch.length > 0) {
      await prisma.contactActivities.createMany({ data: stateBatch });
    }

    console.log(`✅ Created ${stateChanges} state change activities`);

    console.log('\n✨ Contact activities backfill complete!\n');
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

backfillContactActivities();
