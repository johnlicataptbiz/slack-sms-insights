#!/usr/bin/env tsx
/**
 * Debug script for SMS events and conversation linking.
 * Verifies data integrity post-TypeScript fixes.
 */

import { getPrismaClient } from '../services/prisma.js';
import 'dotenv/config';
import type { Prisma } from '@prisma/client';

async function check() {
  const prisma = getPrismaClient();

  // Last 10 SMS events with conversation linking
  const messages: Pick<Prisma.SmsEventSelect, 'id' | 'conversation_id' | 'direction' | 'body' | 'event_ts'>[] = await prisma.smsEvents.findMany({
    take: 10,
    orderBy: { event_ts: 'desc' },
    select: {
      id: true,
      conversation_id: true,
      direction: true,
      body: true,
      event_ts: true,
    },
  });

  console.log('📱 Last 10 SMS events:');
  console.table(
    messages.map((m) => ({
      id: m.id.slice(-8),
      conv_id: m.conversation_id?.slice(-8) || 'null',
      direction: m.direction,
      body: (m.body || '').slice(0, 30) + '...',
      event_ts: m.event_ts.toISOString(),
    })),
  );

  // Total inbound message count
  const inboundCount = await prisma.smsEvents.count({
    where: { direction: 'inbound' },
  });
  console.log('\n📈 Total inbound messages:', inboundCount);

  // Conversations with inbound messages
  const convsWithInbound = await prisma.smsEvents.groupBy({
    by: ['conversation_id'],
    where: { direction: 'inbound' },
    _count: { id: true },
  });

  console.log('💬 Conversations with inbound messages:', convsWithInbound.length);

  await prisma.$disconnect();
  process.exit(0);
}

check().catch((error) => {
  console.error('❌ Debug check failed:', error);
  process.exit(1);
});

