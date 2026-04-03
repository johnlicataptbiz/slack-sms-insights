#!/usr/bin/env tsx
import { getPrisma } from '../services/prisma.js';

const prisma = getPrisma();

async function main() {
  // Total events
  const total = await prisma.$queryRaw<[{ count: bigint }]>`SELECT COUNT(*) as count FROM sms_events`;
  console.log('Total SMS events:', Number(total[0].count));

  // Events with NULL analytics fields
  const nullStatus = await prisma.$queryRaw<Array<{ field: string; null_count: bigint }>>`
    SELECT 'thread_id' as field, COUNT(*) as null_count FROM sms_events WHERE thread_id IS NULL
    UNION ALL
    SELECT 'delivery_status', COUNT(*) FROM sms_events WHERE delivery_status IS NULL
    UNION ALL
    SELECT 'ai_classification', COUNT(*) FROM sms_events WHERE ai_classification IS NULL
    UNION ALL
    SELECT 'sentiment_score', COUNT(*) FROM sms_events WHERE sentiment_score IS NULL
    UNION ALL
    SELECT 'is_booking_signal', COUNT(*) FROM sms_events WHERE is_booking_signal IS NULL
    UNION ALL
    SELECT 'media_urls', COUNT(*) FROM sms_events WHERE media_urls IS NULL
  `;
  console.log('\nEvents with NULL analytics fields:');
  for (const row of nullStatus) {
    console.log(`  ${row.field}: ${Number(row.null_count)}`);
  }

  // Date range
  const dateRange = await prisma.$queryRaw<[{ min: Date | null; max: Date | null }]>`
    SELECT MIN(event_ts) as min, MAX(event_ts) as max FROM sms_events
  `;
  console.log('\nDate range:', dateRange[0].min, 'to', dateRange[0].max);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
