import pkg from '@prisma/client';
const { PrismaClient } = pkg;

const DATABASE_URL = process.env.DATABASE_URL || process.env.PRISMA_ACCELERATE_URL;
const prisma = new PrismaClient();

async function resetMeredithSync() {
  try {
    console.log('🔍 Looking for Meredith\'s Monday push records...\n');
    
    // Find all push records for Meredith
    const pushRecords = await prisma.monday_booked_call_push.findMany({
      where: {
        payload_json: {
          path: ['source', 'contactName'],
          string_contains: 'Meredith'
        }
      }
    });

    console.log(`Found ${pushRecords.length} push record(s)\n`);

    if (pushRecords.length === 0) {
      console.log('❌ No push records found. Checking booked_calls directly...\n');
      
      const calls = await prisma.booked_calls.findMany({
        where: {
          OR: [
            { text: { contains: 'Meredith', mode: 'insensitive' } },
            { text: { contains: 'Atkinson', mode: 'insensitive' } }
          ]
        },
        orderBy: { event_ts: 'desc' },
        take: 3,
      });

      console.log(`Found ${calls.length} booked call(s):\n`);
      calls.forEach((c, i) => {
        console.log(`${i + 1}. ${c.slack_message_ts} - ${c.event_ts}`);
      });

      if (calls.length > 0) {
        console.log('\n🔍 Checking for push records by message_ts...\n');
        for (const call of calls) {
          const pushByTs = await prisma.monday_booked_call_push.findFirst({
            where: {
              slack_message_ts: call.slack_message_ts
            }
          });
          if (pushByTs) {
            console.log(`✅ Found push record for ${call.slack_message_ts}`);
            console.log('   Status:', pushByTs.status);
            console.log('   Monday Item ID:', pushByTs.monday_item_id);
            console.log('   Deleting...');
            
            await prisma.monday_booked_call_push.delete({
              where: { id: pushByTs.id }
            });
            
            console.log('   ✅ Deleted!\n');
          }
        }
      }
    } else {
      for (const record of pushRecords) {
        console.log('📋 Push Record:');
        console.log('   ID:', record.id);
        console.log('   Status:', record.status);
        console.log('   Monday Item ID:', record.monday_item_id);
        console.log('   Message TS:', record.slack_message_ts);
        console.log('   Deleting...');
        
        await prisma.monday_booked_call_push.delete({
          where: { id: record.id }
        });
        
        console.log('   ✅ Deleted!\n');
      }
    }

    console.log('✅ Done! Now add the :jack: reaction again in Slack.\n');

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

resetMeredithSync();
