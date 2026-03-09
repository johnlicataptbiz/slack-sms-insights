import 'dotenv/config';
import { getPrismaClient } from '../services/prisma.js';

const prisma = getPrismaClient();

async function main() {
  const result = await prisma.$queryRawUnsafe(`
    SELECT 
        'employment' as category, 
        COALESCE(qualification_full_or_part_time, 'NULL') as value, 
        COUNT(*) as count 
    FROM conversation_state 
    GROUP BY qualification_full_or_part_time
    UNION ALL
    SELECT 
        'revenue' as category, 
        COALESCE(qualification_revenue_mix, 'NULL') as value, 
        COUNT(*) as count 
    FROM conversation_state 
    GROUP BY qualification_revenue_mix
    UNION ALL
    SELECT 
        'interest' as category, 
        COALESCE(qualification_coaching_interest, 'NULL') as value, 
        COUNT(*) as count 
    FROM conversation_state 
    GROUP BY qualification_coaching_interest
    UNION ALL
    SELECT 
        'delivery' as category, 
        COALESCE(qualification_delivery_model, 'NULL') as value, 
        COUNT(*) as count 
    FROM conversation_state 
    GROUP BY qualification_delivery_model;
  `);
  console.table((result as any[]).map(r => ({ ...r, count: Number(r.count) })));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
