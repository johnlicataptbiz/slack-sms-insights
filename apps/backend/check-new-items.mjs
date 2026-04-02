import { queryBoardItems } from './services/monday-client.ts';

async function checkNewItems() {
  const boardId = process.env.MONDAY_PERSONAL_BOARD_ID;
  const { items } = await queryBoardItems(boardId);

  // Check the specific new items
  const newItemIds = ['11532108452', '11532134637', '11532127401', '11532124775', '11532102302'];

  console.log('\n🎯 Checking NEW items created with the FIX:\n');

  newItemIds.forEach((itemId) => {
    const item = items.find((i) => i.id === itemId);
    if (!item) {
      console.log(`❌ Item ${itemId} not found\n`);
      return;
    }

    const source = item.columnValues.find((cv) => cv.id === 'color_mkznd6kp');
    const channel = item.columnValues.find((cv) => cv.id === 'color_mkznwqh0');
    const swing = item.columnValues.find((cv) => cv.id === 'color_mm089dk3');
    const callType = item.columnValues.find((cv) => cv.id === 'color_mkznsang');

    const hasValues = source?.text || channel?.text || swing?.text;
    const status = hasValues ? '✅ HAS VALUES' : '❌ EMPTY';

    console.log(`${status} - ${item.name}`);
    console.log(`   ID: ${item.id}`);
    console.log(`   Source?: ${source?.text || '(empty)'}`);
    console.log(`   Channel?: ${channel?.text || '(empty)'}`);
    console.log(`   Swing?: ${swing?.text || '(empty)'}`);
    console.log(`   Call Type?: ${callType?.text || '(empty)'}`);
    console.log(`   Updated: ${item.updatedAt}`);
    console.log('');
  });
}

checkNewItems().catch(console.error);
