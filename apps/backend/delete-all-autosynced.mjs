import { queryBoardItems } from './services/monday-client.ts';

const MONDAY_API_URL = 'https://api.monday.com/v2';

const getMondayToken = () => {
  const token = (process.env.MONDAY_API_TOKEN || '').trim();
  if (!token) throw new Error('MONDAY_API_TOKEN is not configured');
  return token;
};

async function deleteAllAutoSyncedItems() {
  console.log('\n🗑️  Deleting ALL auto-synced items (with date pattern)...\n');

  const boardId = process.env.MONDAY_PERSONAL_BOARD_ID;
  const { items } = await queryBoardItems(boardId);

  // Find ALL items with date pattern (auto-synced format: "Name - YYYY-MM-DD")
  const autoSynced = items.filter((item) => / - \d{4}-\d{2}-\d{2}$/.test(item.name));

  // Exclude the test item we want to keep as proof
  const toDelete = autoSynced.filter((item) => item.id !== '11532176153');

  console.log(`Found ${autoSynced.length} auto-synced items`);
  console.log('Keeping 1 test item (ID: 11532176153)');
  console.log(`Deleting ${toDelete.length} items\n`);

  if (toDelete.length === 0) {
    console.log('✅ No items to delete!\n');
    return;
  }

  const token = getMondayToken();
  let deleted = 0;

  for (const item of toDelete) {
    try {
      const mutation = `mutation { delete_item(item_id: ${item.id}) { id } }`;

      const response = await fetch(MONDAY_API_URL, {
        method: 'POST',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: mutation }),
      });

      const result = await response.json();

      if (!result.errors) {
        console.log(`✅ Deleted: ${item.name} [${item.id}]`);
        deleted++;
      } else {
        console.log(`❌ Failed: ${item.name}`);
      }

      // Delay to avoid rate limits
      await new Promise((resolve) => setTimeout(resolve, 500));
    } catch (error) {
      console.log(`❌ Error: ${item.name}`);
    }
  }

  console.log(`\n✅ Deleted ${deleted} out of ${toDelete.length} items\n`);
}

deleteAllAutoSyncedItems().catch(console.error);
