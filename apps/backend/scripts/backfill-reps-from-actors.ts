/**
 * Backfill reps from actor_directory
 * Seeds the new reps table from existing actor_directory data
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface ActorRow {
  canonical_name: string;
  role: string | null;
  aliases: string[];
  active: boolean;
  notes: string | null;
}

async function backfillReps() {
  console.log('👥 Starting reps backfill...\n');

  try {
    // Get all actors
    const actors = await prisma.$queryRaw<ActorRow[]>`
      SELECT canonical_name, role, aliases, active, notes
      FROM actor_directory
    `;

    console.log(`Found ${actors.length} actors to process`);

    let created = 0;
    let skipped = 0;

    for (const actor of actors) {
      // Check if rep already exists
      const existing = await prisma.reps.findUnique({
        where: { id: actor.canonical_name },
      });

      if (existing) {
        skipped++;
        continue;
      }

      // Create rep from actor
      await prisma.reps.create({
        data: {
          id: actor.canonical_name,
          name: actor.canonical_name,
          team: actor.role || 'unknown',
          role: actor.role || undefined,
          is_active: actor.active,
          specialties: actor.aliases.length > 0 ? actor.aliases : undefined,
        },
      });
      created++;
    }

    console.log(`\n✅ Created ${created} new reps`);
    console.log(`⏭️  Skipped ${skipped} existing reps`);

    // Now add Slack user mappings if available
    console.log('\n🔗 Checking for Slack user mappings...');

    // Get unique aloware_users from sms_events
    const slackUsers = await prisma.$queryRaw<Array<{ aloware_user: string | null }>>`
      SELECT DISTINCT aloware_user 
      FROM sms_events 
      WHERE aloware_user IS NOT NULL
    `;

    console.log(`Found ${slackUsers.length} unique aloware users in SMS events`);

    // Update reps with Slack user info where we can infer
    // This is a simple mapping based on name matching
    for (const user of slackUsers) {
      if (!user.aloware_user) continue;

      const userLower = user.aloware_user.toLowerCase();
      const firstName = userLower.split(/[\s@(]/)[0];

      // Try to find a matching rep by name
      const matchingRep = actors.find(
        (a) =>
          a.canonical_name.toLowerCase().includes(firstName) ||
          firstName.includes(a.canonical_name.toLowerCase().split(/[\s_]/)[0]),
      );

      if (matchingRep) {
        await prisma.reps.update({
          where: { id: matchingRep.canonical_name },
          data: {
            slack_user_id: user.aloware_user,
            name: user.aloware_user, // Use the aloware format as display name
          },
        });
        console.log(`  ✓ Mapped ${user.aloware_user} to ${matchingRep.canonical_name}`);
      }
    }

    console.log('\n✨ Reps backfill complete!\n');
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

backfillReps();
