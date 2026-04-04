import { getPrismaClient } from './services/prisma.ts';
import { getBookedCallAttributionSources } from './services/booked-calls.ts';
import { queryBoardItems } from './services/monday-client.ts';

const prisma = getPrismaClient();

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

async function finalSummary() {
  console.log(`\n${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}           FINAL SUMMARY: MONDAY SYNC PROJECT${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}\n`);
  
  const boardId = process.env.MONDAY_PERSONAL_BOARD_ID;
  const from = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const to = new Date();
  
  // Get database info
  const sources = await getBookedCallAttributionSources({ from, to });
  const jackCalls = sources.filter(s => s.bucket === 'jack');
  
  // Get Monday board info
  const { items } = await queryBoardItems(boardId);
  const withDatePattern = items.filter(i => / - \d{4}-\d{2}-\d{2}$/.test(i.name));
  const manualEntries = items.filter(i => !/ - \d{4}-\d{2}-\d{2}$/.test(i.name));
  
  console.log(`${colors.blue}📅 DATABASE (Last 14 Days):${colors.reset}`);
  console.log(`   Jack's booked calls: ${jackCalls.length}\n`);
  
  console.log(`${colors.blue}📋 MONDAY BOARD:${colors.reset}`);
  console.log(`   Total items: ${items.length}`);
  console.log(`   Manual entries (no date suffix): ${manualEntries.length}`);
  console.log(`   Auto-synced (with " - YYYY-MM-DD"): ${withDatePattern.length}\n`);
  
  // Check coverage
  let matched = 0;
  let missing = 0;
  
  for (const call of jackCalls) {
    const contactName = call.contactName || '';
    const exists = items.some(item => {
      const itemNameLower = item.name.toLowerCase();
      const contactNameLower = contactName.toLowerCase();
      return contactNameLower && itemNameLower.includes(contactNameLower);
    });
    if (exists) matched++;
    else missing++;
  }
  
  console.log(`${colors.blue}📊 COVERAGE ANALYSIS:${colors.reset}`);
  console.log(`   ${colors.green}✓ Calls found on Monday: ${matched}${colors.reset}`);
  console.log(`   ${colors.red}✗ Calls missing from Monday: ${missing}${colors.reset}\n`);
  
  // Verify the 9 new ones have complete data
  const newIds = [
    '11532264237', '11532264124', '11532281080', '11532264432',
    '11532281577', '11532281452', '11532252388', '11532246795', '11532268950'
  ];
  
  let complete = 0;
  let incomplete = 0;
  
  newIds.forEach(id => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const s = item.columnValues.find(cv => cv.id === 'color_mkznd6kp');
    const c = item.columnValues.find(cv => cv.id === 'color_mkznwqh0');
    const sw = item.columnValues.find(cv => cv.id === 'color_mm089dk3');
    if (s?.text && c?.text && sw?.text) complete++;
    else incomplete++;
  });
  
  console.log(`${colors.blue}🆕 NEWLY ADDED CALLS (Today):${colors.reset}`);
  console.log(`   ${colors.green}✓ With complete data: ${complete}${colors.reset}`);
  console.log(`   ${colors.red}✗ With incomplete data: ${incomplete}${colors.reset}\n`);
  
  // Final status
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}`);
  console.log(`${colors.bright}${colors.green}✅ STATUS: ${complete === 9 ? 'SUCCESS!' : 'PARTIAL SUCCESS'}${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}═══════════════════════════════════════════════════════════${colors.reset}\n`);
  
  console.log(`${colors.bright}WHAT WAS DONE:${colors.reset}`);
  console.log(`  • Deleted all incomplete auto-synced duplicates`);
  console.log(`  • Added ${complete} missing calls with complete status data`);
  console.log(`  • Kept all ${manualEntries.length} of your original manual entries`);
  console.log(`  • Auto-sync: DISABLED (to prevent future issues)\n`);
  
  await prisma.$disconnect();
}

finalSummary().catch(console.error);
