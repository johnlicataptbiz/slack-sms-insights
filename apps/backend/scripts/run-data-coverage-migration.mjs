/**
 * Run data coverage migration
 * Applies the enhanced schema changes to the database
 */

import { PrismaClient } from "@prisma/client";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const prisma = new PrismaClient();

async function runMigration() {
  console.log("🚀 Starting data coverage migration...\n");

  try {
    // Read the SQL migration file
    const sqlPath = join(__dirname, "add-data-coverage-tables.sql");
    const sql = readFileSync(sqlPath, "utf-8");

    console.log("📄 Executing SQL migration...");
    await prisma.$executeRawUnsafe(sql);

    console.log("✅ Migration completed successfully!\n");

    // Verify new tables exist
    console.log("🔍 Verifying new tables...");
    const tables = await prisma.$queryRaw`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public'
      AND tablename IN ('call_events', 'contact_activities', 'reps', 'sms_lines', 'health_status_ref')
    `;

    console.log("\n📊 New tables created:");
    for (const t of tables) {
      console.log(`  ✓ ${t.tablename}`);
    }

    // Seed health_status_ref
    console.log("\n🌱 Seeding health_status_ref...");
    try {
      await prisma.health_status_ref.upsert({
        where: { status: "healthy" },
        update: {},
        create: { status: "healthy", label: "Healthy", sort_order: 1 },
      });
      await prisma.health_status_ref.upsert({
        where: { status: "at_risk" },
        update: {},
        create: { status: "at_risk", label: "At Risk", sort_order: 2 },
      });
      await prisma.health_status_ref.upsert({
        where: { status: "stalled" },
        update: {},
        create: { status: "stalled", label: "Stalled", sort_order: 3 },
      });
      await prisma.health_status_ref.upsert({
        where: { status: "disengaged" },
        update: {},
        create: { status: "disengaged", label: "Disengaged", sort_order: 4 },
      });
      console.log("✅ Seeded health status values");
    } catch (e) {
      console.log("⚠️  health_status_ref seeding skipped (may already exist)");
    }

    // Seed reps from existing actor_directory
    console.log("\n👥 Seeding reps from actor_directory...");
    try {
      const actors = await prisma.actor_directory.findMany({
        where: { active: true },
      });

      for (const actor of actors) {
        await prisma.reps.upsert({
          where: { id: actor.canonical_name },
          update: { team: actor.role },
          create: {
            id: actor.canonical_name,
            name: actor.canonical_name,
            team: actor.role,
            is_active: actor.active,
          },
        });
      }
      console.log(`✅ Seeded ${actors.length} reps`);
    } catch (e) {
      console.log("⚠️  Rep seeding skipped (actor_directory may not exist)");
    }

    console.log("\n✨ Migration complete!\n");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runMigration();
