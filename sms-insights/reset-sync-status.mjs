import { getPrismaClient } from './services/prisma.ts';

const prisma = getPrismaClient();

async function resetSyncStatusForDeletedItems() {
  console.log('\n🔄 Resetting sync status for deleted Monday items...\n');
  
  // These are the Monday item IDs we deleted
  const deletedItemIds = [
    '11531770184', '11531767489', '11531770307', '11531767554', '11531759451',
    '11531771033', '11531770982', '11531796141', '11531771184', '11531767564',
    '11531780311', '11531792349', '11531792344', '11531803755', '11531792578',
    '11531763532', '11531790360', '11531791399', '11531790738', '11531764679',
    '11531779128', '11531774454', '11531779296', '11531781420', '11531799264',
    '11531797320', '11531797480', '11531794521', '11531781101', '11531797651',
    '11531814200', '11531813937', '11531791198',
  ];
  
  console.log(`Found ${deletedItemIds.length} deleted items to reset\n`);
  
  // Delete the sync tracking records for these items
  const result = await prisma.monday_booked_call_pushes.deleteMany({
    where: {
      monday_item_id: {
        in: deletedItemIds
      }
    }
  });
  
  console.log(`✅ Deleted ${result.count} sync tracking records\n`);
  console.log('These calls will now be considered "not synced" and will sync again with the fix!\n');
  
  await prisma.$disconnect();
}

resetSyncStatusForDeletedItems().catch(console.error);
