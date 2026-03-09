import { getPrismaClient } from '../services/prisma.js';
import 'dotenv/config';

async function check() {
  const prisma = getPrismaClient();
  const messages = await prisma.sms_events.findMany({
    take: 10,
    orderBy: { event_ts: 'desc' }
  });
  console.log('Last 10 messages:');
  console.table(messages.map(m => ({
    id: m.id,
    conv_id: m.conversation_id,
    direction: m.direction,
    body: m.body?.slice(0, 30)
  })));

  const inboundCount = await prisma.sms_events.count({
    where: { direction: 'inbound' }
  });
  console.log('Total inbound messages:', inboundCount);

  const convsWithInbound = await prisma.sms_events.groupBy({
    by: ['conversation_id'],
    where: { direction: 'inbound' },
    _count: true
  });
  console.log('Conversations with at least one inbound message:', convsWithInbound.length);

  process.exit(0);
}

check().catch(console.error);
