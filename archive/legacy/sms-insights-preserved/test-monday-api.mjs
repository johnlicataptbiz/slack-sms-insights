const MONDAY_API_URL = 'https://api.monday.com/v2';

const getMondayToken = () => {
  const token = (process.env.MONDAY_API_TOKEN || '').trim();
  if (!token) throw new Error('MONDAY_API_TOKEN is not configured');
  return token;
};

async function testMondayAPI() {
  console.log('\n🧪 Testing Monday API with our exact payload...\n');
  
  const boardId = process.env.MONDAY_PERSONAL_BOARD_ID;
  const token = getMondayToken();
  
  // This is EXACTLY what we're trying to send
  const columnValues = {
    "date_mkznycfs": { "date": "2026-03-16" },
    "color_mm089dk3": { "label": "First Swing" },
    "color_mkznwqh0": { "label": "Aloware SMS" },
    "color_mkznd6kp": { "label": "Stand Alone Space Setup Guide" }
  };
  
  console.log('Column values we are sending:');
  console.log(JSON.stringify(columnValues, null, 2));
  console.log('');
  
  const mutation = `
    mutation CreateTestItem($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
      create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
        id
      }
    }
  `;
  
  try {
    const response = await fetch(MONDAY_API_URL, {
      method: 'POST',
      headers: {
        Authorization: token,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: mutation,
        variables: {
          boardId,
          itemName: 'TEST ITEM - DELETE ME',
          columnValues: JSON.stringify(columnValues)
        }
      }),
    });
    
    const result = await response.json();
    
    if (result.errors) {
      console.log('❌ Monday API returned errors:');
      result.errors.forEach(err => {
        console.log(`  - ${err.message}`);
      });
    } else {
      console.log('✅ SUCCESS! Item created:', result.data.create_item.id);
      console.log('\nNow checking if columns were set...');
    }
    
    console.log('\nFull response:');
    console.log(JSON.stringify(result, null, 2));
    
  } catch (error) {
    console.log('❌ Error:', error.message);
  }
}

testMondayAPI().catch(console.error);
