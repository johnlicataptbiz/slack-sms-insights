import { queryBoardItems } from './services/monday-client.ts';

async function checkLatestSyncedItems() {
  const boardId = process.env.MONDAY_PERSONAL_BOARD_ID;
  const { items } = await queryBoardItems(boardId);

  // The 5 most recent synced items
  const itemIds = ['11532164228', '11532176372', '11532164361', '11532175836', '11532163876'];

  console.log('\n🎯 Checking the 5 most recently synced items:\n');

  let allGood = true;

  itemIds.forEach((itemId) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) {
      console.log(`❌ Item ${itemId} not found`);
      return;
    }

    const source = item.columnValues.find((cv) => cv.id === 'color_mkznd6kp');
    const channel = item.columnValues.find((cv) => cv.id === 'color_mkznwqh0');
    const swing = item.columnValues.find((cv) => cv.id === 'color_mm089dk3');

    const hasAll = source?.text && channel?.text && swing?.text;
    const status = hasAll ? '✅' : '❌';

    if (!hasAll) allGood = false;

    console.log(`${status} ${item.name}`);
    console.log(`   Source?: ${source?.text || '(empty)'}`);
    console.log(`   Channel?: ${channel?.text || '(empty)'}`);
    console.log(`   Swing?: ${swing?.text || '(empty)'}`);
    console.log('');
  });

  if (allGood) {
    console.log('🎉🎉🎉 SUCCESS! All items have status columns populated! 🎉🎉🎉\n');
  } else {
    console.log('❌ Some items still have empty columns\n');
  }
}

checkLatestSyncedItems().catch(console.error);
