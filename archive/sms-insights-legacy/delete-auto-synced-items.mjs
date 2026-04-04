const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
};

const getMondayToken = () => {
  const token = (process.env.MONDAY_API_TOKEN || '').trim();
  if (!token) throw new Error('MONDAY_API_TOKEN is not configured');
  return token;
};

const mondayGraphQL = async (mutation) => {
  const token = getMondayToken();
  const response = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: mutation }),
  });
  
  const result = await response.json();
  if (!response.ok || result.errors?.length) {
    throw new Error(result.errors?.[0]?.message || `API error: ${response.status}`);
  }
  return result.data;
};

async function deleteIncompleteAutoSyncedItems() {
  console.log(`\n${colors.bright}🗑️  DELETING INCOMPLETE AUTO-SYNCED ITEMS${colors.reset}\n`);
  
  const itemIds = [
    // March 4
    '11531770184', // Kali Jacobson
    '11531767489', // Jayden Townes
    '11531770307', // Samantha Levy
    // March 5
    '11531767554', // Nate Funk
    '11531759451', // Jamie Grill
    // March 8
    '11531771033', // Jeff Smith
    // March 9
    '11531770982', // Brooke Fitch-Collins
    '11531796141', // Ana Morales
    '11531771184', // Steve Kim
    // March 10
    '11531767564', // Dylan McLean
    '11531780311', // Alexander Leto
    '11531792349', // Marissa Hagenbruch
    '11531792344', // Paige Eisdorfer
    '11531803755', // Anthony Meyer
    // March 11
    '11531792578', // Josh Darby
    '11531763532', // Jennifer Lockoman
    '11531790360', // Joshua Costello
    '11531791399', // Laura Myers
    '11531790738', // Beth Pavelka
    '11531764679', // Gabe Punke
    // March 12
    '11531779128', // Devin Capela
    '11531774454', // Neil Shimabukuro
    '11531779296', // Jenny Mcateer
    // March 13
    '11531781420', // Ericka Wigfall
    '11531799264', // Vanessa Kopaniak
    '11531797320', // Parker Sims
    // March 14
    '11531797480', // Hans & Amanda Smelker
    // March 16
    '11531794521', // PTBizSMS Weekly Summary (NOT a booked call!)
    '11531781101', // Calvin` Gaines
    '11531797651', // Mouzzam Kagalwala
    '11531814200', // Joeseph Abano
    '11531813937', // Nivedita Sinnarkar
    '11531791198', // Dominick Dauria
  ];
  
  console.log(`Found ${itemIds.length} items to delete\n`);
  console.log('⚠️  WARNING: This will permanently delete these items from Monday.com!\n');
  console.log('Press Ctrl+C to cancel, or wait 5 seconds to proceed...\n');
  
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  console.log('Starting deletion...\n');
  
  let deleted = 0;
  let failed = 0;
  
  for (const itemId of itemIds) {
    try {
      const mutation = `
        mutation {
          delete_item(item_id: ${itemId}) {
            id
          }
        }
      `;
      
      await mondayGraphQL(mutation);
      deleted++;
      console.log(`${colors.green}✓${colors.reset} Deleted item ${itemId}`);
    } catch (error) {
      failed++;
      console.log(`${colors.red}✗${colors.reset} Failed to delete ${itemId}: ${error.message}`);
    }
  }
  
  console.log(`\n${colors.bright}Summary:${colors.reset}`);
  console.log(`  Deleted: ${deleted}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${itemIds.length}\n`);
}

deleteIncompleteAutoSyncedItems().catch(console.error);
