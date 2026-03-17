const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

const log = {
  success: (text) => console.log(`${colors.green}✓${colors.reset} ${text}`),
  error: (text) => console.log(`${colors.red}✗${colors.reset} ${text}`),
  info: (text) => console.log(`  ${text}`),
};

// Delete function using Monday API
async function deleteMondayItem(itemId) {
  const apiToken = process.env.MONDAY_API_TOKEN;
  if (!apiToken) {
    throw new Error('MONDAY_API_TOKEN not set');
  }
  
  const query = `
    mutation {
      delete_item (item_id: ${itemId}) {
        id
      }
    }
  `;
  
  const response = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': apiToken,
    },
    body: JSON.stringify({ query })
  });
  
  const result = await response.json();
  
  if (result.errors) {
    throw new Error(result.errors[0].message);
  }
  
  return result.data.delete_item;
}

// Duplicate manual entries to delete (verified as identical)
const duplicatesToDelete = [
  { name: 'Jennifer Lockoman - 2026-03-11', id: '11531792379' },
  { name: 'Joshua Costello - 2026-03-11', id: '11531801756' },
  { name: 'Laura Myers - 2026-03-11', id: '11531773921' },
  { name: 'Beth Pavelka - 2026-03-11', id: '11531774228' },
  { name: 'Gabe Punke - 2026-03-11', id: '11531794900' },
  { name: 'Nivedita Sinnarkar - 2026-03-16', id: '11531816733' },
  { name: 'Dominick Dauria - 2026-03-16', id: '11531800915' },
];

async function deleteDuplicates() {
  console.log(`\n${colors.bright}${colors.yellow}⚠️  WARNING: ABOUT TO DELETE ${duplicatesToDelete.length} MONDAY ITEMS${colors.reset}\n`);
  
  console.log('Items to be deleted:');
  duplicatesToDelete.forEach((item, idx) => {
    console.log(`  ${idx + 1}. ${item.name} (ID: ${item.id})`);
  });
  
  console.log(`\n${colors.yellow}This action cannot be undone!${colors.reset}`);
  console.log(`\nPress Ctrl+C within 5 seconds to cancel...\n`);
  
  // Wait 5 seconds
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  console.log(`${colors.green}Starting deletion...${colors.reset}\n`);
  
  let successCount = 0;
  let errorCount = 0;
  
  for (const item of duplicatesToDelete) {
    try {
      await deleteMondayItem(item.id);
      log.success(`Deleted: ${item.name} (ID: ${item.id})`);
      successCount++;
      
      // Small delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      log.error(`Failed to delete ${item.name}: ${error.message}`);
      errorCount++;
    }
  }
  
  console.log(`\n${colors.bright}DELETION COMPLETE${colors.reset}`);
  console.log(`  ${colors.green}Deleted: ${successCount}${colors.reset}`);
  if (errorCount > 0) {
    console.log(`  ${colors.red}Failed: ${errorCount}${colors.reset}`);
  }
  console.log('');
}

deleteDuplicates();
