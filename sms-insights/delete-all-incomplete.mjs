import { queryBoardItems } from './services/monday-client.ts';

const MONDAY_API_URL = 'https://api.monday.com/v2';

const getMondayToken = () => {
  const token = (process.env.MONDAY_API_TOKEN || '').trim();
  if (!token) throw new Error('MONDAY_API_TOKEN is not configured');
  return token;
};

async function deleteAllIncompleteItems() {
  console.log('\n🗑️  Finding and deleting ALL incomplete items...\n');
  
  const boardId = process.env.MONDAY_PERSONAL_BOARD_ID;
  const { items } = await queryBoardItems(boardId);
  
  // Find incomplete items (have date pattern but empty status columns)
  const incomplete = items.filter(item => {
    const hasDatePattern = / - \d{4}-\d{2}-\d{2}$/.test(item.name);
    if (!hasDatePattern) return false;
    
    const statusColumns = ['color_mkznsang', 'color_mkznd6kp', 'color_mkznwqh0', 'color_mm089dk3'];
    const allEmpty = statusColumns.every(colId => {
      const colValue = item.columnValues.find(cv => cv.id === colId);
      return !colValue?.text || colValue.text.trim() === '';
    });
    
    return allEmpty;
  });
  
  console.log(`Found ${incomplete.length} incomplete items to delete\n`);
  
  if (incomplete.length === 0) {
    console.log('✅ No incomplete items found!\n');
    return;
  }
  
  const token = getMondayToken();
  let deleted = 0;
  
  for (const item of incomplete) {
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
        console.log(`❌ Failed: ${item.name} - ${result.errors[0].message}`);
      }
      
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 500));
      
    } catch (error) {
      console.log(`❌ Error deleting ${item.name}: ${error.message}`);
    }
  }
  
  console.log(`\n✅ Deleted ${deleted} out of ${incomplete.length} items\n`);
}

deleteAllIncompleteItems().catch(console.error);
