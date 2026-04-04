import { queryBoardItems } from './services/monday-client.ts';

async function inspectSpecificItems() {
  const boardId = process.env.MONDAY_PERSONAL_BOARD_ID;
  const { items } = await queryBoardItems(boardId);
  
  // Check a few items from our list
  const testNames = ['Jennifer Lockoman', 'Josh Darby', 'Kali Jacobson'];
  
  console.log('\n🔍 Checking specific items:\n');
  
  testNames.forEach(name => {
    const matches = items.filter(item => item.name.includes(name));
    console.log(`\n${name}:`);
    matches.forEach(item => {
      const source = item.columnValues.find(cv => cv.id === 'color_mkznd6kp');
      const channel = item.columnValues.find(cv => cv.id === 'color_mkznwqh0');
      const swing = item.columnValues.find(cv => cv.id === 'color_mm089dk3');
      
      console.log(`  ID: ${item.id}`);
      console.log(`  Name: ${item.name}`);
      console.log(`  Source?: ${source?.text || '(empty)'}`);
      console.log(`  Channel?: ${channel?.text || '(empty)'}`);
      console.log(`  Swing?: ${swing?.text || '(empty)'}`);
      console.log(`  Updated: ${item.updatedAt}`);
    });
  });
}

inspectSpecificItems().catch(console.error);
