#!/usr/bin/env tsx
import { getPrisma } from '../services/prisma.js';

const prisma = getPrisma();

async function main() {
  const result = await prisma.$queryRaw`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'sms_events' 
    AND column_name IN ('delivery_status', 'thread_id', 'ai_classification', 'sentiment_score', 'is_booking_signal', 'media_urls') 
    ORDER BY column_name
  `;
  console.log('Found columns:', JSON.stringify(result, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
