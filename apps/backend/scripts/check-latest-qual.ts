import { getPrismaClient } from '../services/prisma.js';
import 'dotenv/config';

const prisma = getPrismaClient();

async function main() {
  const latest = await prisma.conversation_state.findFirst({
    where: { 
      OR: [
        { qualification_revenue_mix: { not: 'unknown' } },
        { qualification_full_or_part_time: { not: 'unknown' } }
      ]
    },
    orderBy: { updated_at: 'desc' }
  });
  
  console.log('Latest qualification update:', latest?.updated_at);
  console.log('Latest qualification data:', {
    revenue: latest?.qualification_revenue_mix,
    employment: latest?.qualification_full_or_part_time,
    interest: latest?.qualification_coaching_interest
  });
}

main().catch(console.error);
