import { getBookedCallAttributionSources } from './services/booked-calls.ts';
import { queryBoardItems } from './services/monday-client.ts';
import { getPrismaClient } from './services/prisma.ts';

const prisma = getPrismaClient();

async function findTrulyMissingCalls() {
  console.log('\n🔍 Finding calls that are TRULY missing from Monday...\n');

  const boardId = process.env.MONDAY_PERSONAL_BOARD_ID;
  const from = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const to = new Date();

  // Get all Jack's calls from database
  const sources = await getBookedCallAttributionSources({ from, to });
  const jackCalls = sources.filter((s) => s.bucket === 'jack');

  console.log(`Database: ${jackCalls.length} Jack calls in last 14 days`);

  // Get all items on Monday board (manual entries only now)
  const { items } = await queryBoardItems(boardId);
  console.log(`Monday: ${items.length} items on board\n`);

  // For each database call, check if it exists on Monday (fuzzy name match)
  const missing = [];
  const found = [];

  for (const call of jackCalls) {
    const contactName = call.contactName || '';

    // Fuzzy match - check if ANY Monday item has this contact name
    const exists = items.some((item) => {
      const itemNameLower = item.name.toLowerCase();
      const contactNameLower = contactName.toLowerCase();
      // Match if Monday item contains the contact name (ignoring date suffix)
      return contactNameLower && itemNameLower.includes(contactNameLower);
    });

    if (exists) {
      found.push(call);
    } else {
      missing.push(call);
    }
  }

  console.log(`✅ Found on Monday: ${found.length}`);
  console.log(`❌ Missing from Monday: ${missing.length}\n`);

  if (missing.length > 0) {
    console.log('📋 Calls that need to be added:\n');
    missing
      .sort((a, b) => new Date(b.eventTs).getTime() - new Date(a.eventTs).getTime())
      .forEach((call, idx) => {
        const date = call.eventTs.substring(0, 10);
        const fc = call.firstConversion?.substring(0, 40) || 'NULL';
        console.log(`${idx + 1}. ${call.contactName || 'Unknown'} - ${date}`);
        console.log(`   First Conversion: ${fc}`);
      });
  }

  await prisma.$disconnect();
  return missing;
}

findTrulyMissingCalls().catch(console.error);
