import { queryBoardItems } from './services/monday-client.ts';

async function finalVerification() {
  const boardId = process.env.MONDAY_PERSONAL_BOARD_ID;
  const { items } = await queryBoardItems(boardId);

  // Get the 9 new items we just created
  const newIds = [
    '11532264237', // Brooke Fitch-Collins
    '11532264124', // Marissa Hagenbruch
    '11532281080', // Jennifer Lockoman
    '11532264432', // Hans & Amanda Smelker
    '11532281577', // Calvin` Gaines
    '11532281452', // Mouzzam Kagalwala
    '11532252388', // Joeseph Abano
    '11532246795', // Nivedita Sinnarkar
    '11532268950', // Dominick Dauria
  ];

  console.log('\n🎯 FINAL VERIFICATION OF 9 NEWLY ADDED CALLS:\n');

  let allPerfect = true;

  newIds.forEach((id, idx) => {
    const item = items.find((i) => i.id === id);
    if (!item) {
      console.log(`${idx + 1}. ❌ Item ${id} not found`);
      return;
    }

    const source = item.columnValues.find((cv) => cv.id === 'color_mkznd6kp');
    const channel = item.columnValues.find((cv) => cv.id === 'color_mkznwqh0');
    const swing = item.columnValues.find((cv) => cv.id === 'color_mm089dk3');
    const date = item.columnValues.find((cv) => cv.id === 'date_mkznycfs');

    const hasAll = source?.text && channel?.text && swing?.text && date?.text;
    if (!hasAll) allPerfect = false;

    console.log(`${idx + 1}. ${hasAll ? '✅' : '❌'} ${item.name}`);
    console.log(`    Date Set: ${date?.text || '(empty)'}`);
    console.log(`    Source: ${source?.text || '(empty)'}`);
    console.log(`    Channel: ${channel?.text || '(empty)'}`);
    console.log(`    Swing: ${swing?.text || '(empty)'}`);
    console.log('');
  });

  // Summary
  console.log('═══════════════════════════════════════════════════════');
  if (allPerfect) {
    console.log('🎉 ALL 9 CALLS HAVE COMPLETE DATA!');
  } else {
    console.log('⚠️  Some calls have missing data');
  }
  console.log('═══════════════════════════════════════════════════════\n');

  // Show board totals
  const withDatePattern = items.filter((i) => / - \d{4}-\d{2}-\d{2}$/.test(i.name));
  const manualOnly = items.filter((i) => !/ - \d{4}-\d{2}-\d{2}$/.test(i.name));

  console.log('📊 MONDAY BOARD SUMMARY:');
  console.log(`   Manual entries: ${manualOnly.length}`);
  console.log(`   Auto-synced (with date): ${withDatePattern.length}`);
  console.log(`   Total items: ${items.length}\n`);
}

finalVerification().catch(console.error);
