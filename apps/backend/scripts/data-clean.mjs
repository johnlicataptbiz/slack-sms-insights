#!/usr/bin/env node
import { getPrismaClient } from '../services/prisma.js';

const prisma = getPrismaClient();

const fixes = {
  async dedupeLines() {
    const result = await prisma.$executeRawUnsafe(`
      UPDATE sms_events SET line = 'Jack' WHERE line ILIKE '%jack%' OR line LIKE '%817%'
        AND line != 'Jack';
      UPDATE sms_events SET line = 'Brandon' WHERE line ILIKE '%brandon%' OR line LIKE '%678%'
        AND line != 'Brandon';
    `);
    console.log(`✅ Deduped lines: ${result} rows`);
  },

  async trimSpamBodies() {
    const trimmed = await prisma.$executeRawUnsafe(`
      UPDATE sms_events 
      SET body = LEFT(body, 500)
      WHERE LENGTH(body) > 500 AND direction = 'outbound';
    `);
    console.log(`✅ Trimmed long bodies: ${trimmed} rows`);
  },

  async flagTestMessages() {
    const flagged = await prisma.$executeRawUnsafe(`
      UPDATE sms_events 
      SET body = CONCAT('[TEST] ', body)
      WHERE LOWER(body) LIKE '%test%' OR LOWER(body) LIKE '%demo%'
        OR contact_phone IN ('555-555-5555', '+15555555555');
    `);
    console.log(`✅ Flagged test msgs: ${flagged} rows`);
  },
};

async function main() {
  console.log('🧹 Running SAFE Data Cleaning...\n');

  await fixes.dedupeLines();
  await fixes.trimSpamBodies();
  await fixes.flagTestMessages();

  console.log('\n✅ Cleaning COMPLETE!');
  console.log('🔄 Refresh Prisma Studio: npx prisma studio');
}

main().catch(console.error);
