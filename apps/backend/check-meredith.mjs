import pkg from '@prisma/client';

const { PrismaClient } = pkg;

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Load .env manually
const envPath = join(__dirname, '.env');
try {
  const envContent = readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach((line) => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length) {
      process.env[key.trim()] = valueParts.join('=').replace(/^"|"$/g, '').trim();
    }
  });
} catch (e) {
  console.warn('Could not load .env file');
}

const prisma = new PrismaClient();

async function checkMeredith() {
  try {
    // Find all calls with Meredith in the text
    const calls = await prisma.booked_calls.findMany({
      where: {
        OR: [
          { text: { contains: 'Meredith', mode: 'insensitive' } },
          { text: { contains: 'Atkinson', mode: 'insensitive' } },
        ],
      },
      include: {
        booked_call_reactions: true,
      },
      orderBy: {
        event_ts: 'desc',
      },
      take: 5,
    });

    console.log(`\n📊 Found ${calls.length} call(s) for Meredith:\n`);

    for (const call of calls) {
      console.log('─'.repeat(60));
      console.log('ID:', call.id);
      console.log('Channel:', call.slack_channel_id);
      console.log('Message TS:', call.slack_message_ts);
      console.log('Event Time:', call.event_ts);
      console.log('Text:', call.text?.substring(0, 100));
      console.log('\n🎯 Reactions:');
      call.booked_call_reactions.forEach((r) => {
        console.log(`  - ${r.reaction_name} (count: ${r.reaction_count})`);
      });

      // Check if there's a Monday push record
      const push = await prisma.monday_booked_call_push.findFirst({
        where: {
          slack_channel_id: call.slack_channel_id,
          slack_message_ts: call.slack_message_ts,
        },
      });

      if (push) {
        console.log('\n📤 Monday Push:');
        console.log('  Status:', push.status);
        console.log('  Monday Item ID:', push.monday_item_id);
        console.log('  Setter Bucket:', push.setter_bucket);
        console.log('  Error:', push.error);
      } else {
        console.log('\n❌ No Monday push record found');
      }
      console.log('');
    }
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkMeredith();
