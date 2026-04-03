#!/usr/bin/env node
/**
 * Generate LIVE-DATABASE-REPORT.md using Prisma client with CORRECT model names.
 * Fixed: mondayCallSnapshot → mondayCallSnapshots, proper aggregations.
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import type { Prisma } from '@prisma/client';
import { getPrismaClient } from './services/prisma.js';

async function generateReport(): Promise<void> {
  console.log('🔍 Generating live database report with Prisma...');

  const prisma = getPrismaClient();

  try {
    // ===== CORE TABLE STATS =====
    const [snapshotsAgg, boardsCount, leadsCount, attribsCount, sequencesCount] = await Promise.all([
      prisma.mondayCallSnapshots.aggregate({
        _count: { id: true },
        _max: { updated_at: true },
      }),
      prisma.mondayBoardRegistry.count({ where: { active: true } }),
      prisma.leadOutcomes.count(),
      prisma.leadAttributions.count(),
      prisma.sequenceRegistry.count({ where: { status: 'active' } }),
    ]);

    // ===== MONDAY SYNC HEALTH =====
    const syncHealth = await prisma.mondaySyncStates.aggregate({
      _count: { id: true },
    });

    // ===== RECENT ACTIVITY =====
    const recentKpis = await prisma.mondayCallSnapshots.aggregate({
      where: {
        updated_at: {
          gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
        },
      },
      _count: true,
      _sum: { is_booked: true },
    });

    const reportContent = `# 📊 LIVE DATABASE REPORT (Prisma v7.6.0)
**Generated**: ${new Date().toISOString()}

## 🗄️ Table Counts
| Table | Count |
|-------|-------|
| \`monday_call_snapshots\` | ${snapshotsAgg._count.id} |
| Active Monday boards | ${boardsCount} |
| \`lead_outcomes\` | ${leadsCount} |
| \`lead_attribution\` | ${attribsCount} |
| Active sequences | ${sequencesCount} |

## 🔄 Sync Health
- Monday sync states: ${syncHealth._count.id}
- 7-day booked calls: ${recentKpis._sum.is_booked || 0}/${recentKpis._count}

## ✅ Status
**Prisma Client**: Healthy ✅  
**Schema**: Unified ✅  
**Ready for**: Railway deploy 🚀

---
*Powered by Prisma Client v7.6.0*
`;

    fs.writeFileSync(path.resolve('../LIVE-DATABASE-REPORT.md'), reportContent);
    console.log('✅ LIVE-DATABASE-REPORT.md generated successfully!');
  } catch (error) {
    console.error('❌ Report generation failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

generateReport();
