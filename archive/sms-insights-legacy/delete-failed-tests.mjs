const MONDAY_API_URL = 'https://api.monday.com/v2';

const getMondayToken = () => {
  const token = (process.env.MONDAY_API_TOKEN || '').trim();
  if (!token) throw new Error('MONDAY_API_TOKEN is not configured');
  return token;
};

async function deleteFailedTestItems() {
  console.log('\n🗑️  Deleting failed test items...\n');
  
  const token = getMondayToken();
  
  // All the failed test items (empty columns)
  const itemIds = [
    '11532108452', '11532134637', '11532127401', '11532124775', '11532102302', // First batch
    '11532137347', '11532171612', // Second batch
  ];
  
  console.log(`Deleting ${itemIds.length} failed test items\n`);
  
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
      
      const response = await fetch(MONDAY_API_URL, {
        method: 'POST',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: mutation }),
      });
      
      const result = await response.json();
      
      if (result.errors) {
        console.log(`❌ Failed to delete ${itemId}: ${result.errors[0].message}`);
        failed++;
      } else {
        console.log(`✅ Deleted ${itemId}`);
        deleted++;
      }
    } catch (error) {
      console.log(`❌ Error deleting ${itemId}: ${error.message}`);
      failed++;
    }
  }
  
  console.log(`\n✅ Deleted: ${deleted}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total: ${itemIds.length}\n`);
}

deleteFailedTestItems().catch(console.error);
