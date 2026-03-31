import { getBookedCallAttributionSources } from './services/booked-calls.ts';
import { queryBoardItems } from './services/monday-client.ts';
import { getPrismaClient } from './services/prisma.ts';

const prisma = getPrismaClient();

async function findActuallyMissingCalls() {
  console.log('\n🔍 Finding calls that are NOT actually on Monday board...\n');

  const boardId = process.env.MONDAY_PERSONAL_BOARD_ID;
  const from = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const to = new Date();

  // Get all Jack's calls
  const sources = await getBookedCallAttributionSources({ from, to });
  const jackCalls = sources.filter((s) => s.bucket === 'jack');

  console.log(`Found ${jackCalls.length} Jack calls in last 14 days`);

  // Get all items on Monday board
  const { items } = await queryBoardItems(boardId);
  console.log(`Found ${items.length} items on Monday board`);

  // Check which calls are actually on the board (by checking if name matches)
  const missingCalls = [];

  for (const call of jackCalls) {
    const callDate = call.eventTs.substring(0, 10);
    const contactName = call.contactName || 'Unknown';

    // Check if an item exists with this name pattern
    const exists = items.some((item) => item.name.includes(contactName) && item.name.includes(callDate));

    if (!exists) {
      missingCalls.push(call);
    }
  }

  console.log(`\n${missingCalls.length} calls are NOT on Monday board:\n`);

  missingCalls
    .sort((a, b) => new Date(b.eventTs).getTime() - new Date(a.eventTs).getTime())
    .forEach((call, idx) => {
      console.log(`${idx + 1}. ${call.contactName || 'Unknown'} - ${call.eventTs.substring(0, 10)}`);
      console.log(`   Line: ${call.line || 'NULL'}`);
      console.log(`   First Conversion: ${call.firstConversion?.substring(0, 50) || 'NULL'}`);
      console.log('');
    });

  await prisma.$disconnect();
  return missingCalls;
}

findActuallyMissingCalls().catch(console.error);
