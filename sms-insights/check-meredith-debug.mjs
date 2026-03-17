import { getPrismaClient } from './services/prisma.js';

const prisma = getPrismaClient();

async function checkMeredithCall() {
  try {
    // Find Meredith's call
    const call = await prisma.booked_calls.findFirst({
      where: {
        text: {
          contains: 'Meredith',
        },
      },
      include: {
        booked_call_reactions: true,
      },
      orderBy: {
        event_ts: 'desc',
      },
    });

    if (!call) {
      console.log('❌ No call found for Meredith');
      return;
    }

    console.log('✅ Found call:');
    console.log('ID:', call.id);
    console.log('Timestamp:', call.event_ts);
    console.log('Text:', call.text);
    console.log('\n📦 Raw data:', JSON.stringify(call.raw, null, 2));
    console.log('\n🎯 Reactions:', call.booked_call_reactions);

    // Check if there's a push record
    const push = await prisma.monday_booked_call_push.findFirst({
      where: {
        slack_message_ts: call.slack_message_ts,
      },
    });

    if (push) {
      console.log('\n📤 Monday Push Record:');
      console.log('Status:', push.status);
      console.log('Monday Item ID:', push.monday_item_id);
      console.log('Error:', push.error);
      console.log('Payload:', JSON.stringify(push.payload_json, null, 2));
    } else {
      console.log('\n❌ No Monday push record found');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkMeredithCall();
