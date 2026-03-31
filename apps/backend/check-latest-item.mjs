import { queryBoardItems } from './services/monday-client.ts';

async function checkLatestItem() {
  const boardId = process.env.MONDAY_PERSONAL_BOARD_ID;
  const { items } = await queryBoardItems(boardId);

  // Check the NEW item created with the fix
  const itemId = '11532176153'; // Test item we just created
  const item = items.find((i) => i.id === itemId);

  if (!item) {
    console.log(`\n❌ Item ${itemId} not found\n`);
    return;
  }

  const source = item.columnValues.find((cv) => cv.id === 'color_mkznd6kp');
  const channel = item.columnValues.find((cv) => cv.id === 'color_mkznwqh0');
  const swing = item.columnValues.find((cv) => cv.id === 'color_mm089dk3');
  const callType = item.columnValues.find((cv) => cv.id === 'color_mkznsang');

  const hasValues = source?.text || channel?.text || swing?.text;

  console.log('\n🎯 TESTING ITEM CREATED WITH FIX:\n');
  console.log(`Name: ${item.name}`);
  console.log(`ID: ${item.id}`);
  console.log(`Updated: ${item.updatedAt}\n`);

  console.log(`Source?: ${source?.text || '(empty)'} ${source?.text ? '✅' : '❌'}`);
  console.log(`Channel?: ${channel?.text || '(empty)'} ${channel?.text ? '✅' : '❌'}`);
  console.log(`Swing?: ${swing?.text || '(empty)'} ${swing?.text ? '✅' : '❌'}`);
  console.log(`Call Type?: ${callType?.text || '(empty)'} ${callType?.text ? '✅' : '⚠️  (expected empty)'}\n`);

  if (hasValues) {
    console.log('\n🎉 SUCCESS! The fix is working! Status columns are populated!\n');
  } else {
    console.log('\n❌ FAILED: Status columns are still empty\n');
  }
}

checkLatestItem().catch(console.error);
