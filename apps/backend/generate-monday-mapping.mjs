import { getPrismaClient } from './services/prisma.ts';

const prisma = getPrismaClient();

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

/**
 * Generate the recommended Monday column mapping based on existing columns
 */
async function generateMapping() {
  console.log(`\n${colors.bright}${colors.cyan}╔═══════════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}║    MONDAY BOARD MAPPING - USING EXISTING COLUMNS              ║${colors.reset}`);
  console.log(`${colors.bright}${colors.cyan}╚═══════════════════════════════════════════════════════════════╝${colors.reset}\n`);
  
  // Proposed mapping using existing columns
  const mapping = {
    callDateColumnId: "date_mkznycfs",          // "Date Set" - already mapped
    contactNameColumnId: "name",                 // "Name" - use item name for contact
    phoneColumnId: null,                         // No phone column exists - we'll skip this
    setterColumnId: null,                        // Not needed - each setter has own board
    stageColumnId: "color_mm089dk3",            // "Swing?" - already mapped
    firstConversionColumnId: null,               // Could use "Source?" but let's see
    lineColumnId: "color_mkznwqh0",             // "Channel?" - for line info
    sourceColumnId: "color_mkznd6kp",           // "Source?" - for source type
    slackLinkColumnId: null,                     // No link column - skip
    notesColumnId: null,                         // No long text column - will use item name/updates
  };
  
  console.log(`${colors.green}✓${colors.reset} Recommended Mapping (using existing columns):\n`);
  console.log(JSON.stringify(mapping, null, 2));
  
  console.log(`\n${colors.cyan}Field Explanations:${colors.reset}`);
  console.log(`  ${colors.green}callDateColumnId${colors.reset}      → Date Set (when call was booked)`);
  console.log(`  ${colors.green}contactNameColumnId${colors.reset}   → Name (contact name in item title)`);
  console.log(`  ${colors.yellow}phoneColumnId${colors.reset}         → null (no phone column available)`);
  console.log(`  ${colors.yellow}setterColumnId${colors.reset}        → null (not needed - board is per setter)`);
  console.log(`  ${colors.green}stageColumnId${colors.reset}         → Swing? (call status)`);
  console.log(`  ${colors.green}lineColumnId${colors.reset}          → Channel? (phone line used)`);
  console.log(`  ${colors.green}sourceColumnId${colors.reset}        → Source? (source type)`);
  console.log(`  ${colors.yellow}firstConversionColumnId${colors.reset} → null (no suitable column)`);
  console.log(`  ${colors.yellow}slackLinkColumnId${colors.reset}    → null (no link column available)`);
  console.log(`  ${colors.yellow}notesColumnId${colors.reset}         → null (no long text column)`);
  
  console.log(`\n${colors.cyan}How to Apply:${colors.reset}`);
  console.log(`\n1. Add this to your .env file (local testing):`);
  console.log(`${colors.blue}MONDAY_PERSONAL_COLUMN_MAP_JSON='${JSON.stringify(mapping)}'${colors.reset}`);
  
  console.log(`\n2. Or add to Railway environment variables:`);
  console.log(`   Variable Name: ${colors.green}MONDAY_PERSONAL_COLUMN_MAP_JSON${colors.reset}`);
  console.log(`   Value: ${colors.blue}${JSON.stringify(mapping)}${colors.reset}`);
  
  console.log(`\n3. Also ensure these are set to 'true' in Railway:`);
  console.log(`   ${colors.green}MONDAY_AUTO_WRITE_ENABLED=true${colors.reset}`);
  console.log(`   ${colors.green}MONDAY_OUTBOUND_ENABLED=true${colors.reset}`);
  
  console.log(`\n${colors.cyan}What Data Will Be Synced:${colors.reset}`);
  console.log(`  • Item Name: Contact name + Date (e.g., "Dominick Dauria - 2026-03-17")`);
  console.log(`  • Date Set: When the call was booked from Slack`);
  console.log(`  • Channel?: Phone line used (e.g., "Jack's Personal Line")`);
  console.log(`  • Source?: Set to "Slack booked call"`);
  console.log(`  • Swing?: Set to "Booked"`);
  
  console.log(`\n${colors.yellow}Note:${colors.reset} Phone number won't be synced since there's no phone column.`);
  console.log(`If you want phone numbers, you'll need to add a "Phone" column to your Monday board.`);
  
  console.log(`\n${colors.cyan}Next Steps:${colors.reset}`);
  console.log(`1. Copy the MONDAY_PERSONAL_COLUMN_MAP_JSON value above`);
  console.log(`2. Add it to Railway environment variables`);
  console.log(`3. Run: ${colors.green}railway run node --import tsx monday-sync-manager.mjs sync${colors.reset}`);
  console.log(`4. Check your Monday board for the synced calls!\n`);
  
  await prisma.$disconnect();
}

generateMapping();
