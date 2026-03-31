#!/usr/bin/env node
/**
 * Generate Live Database Report - PRISMA VERSION
 * Creates LIVE-DATABASE-REPORT.md using Prisma client
 * Fallback for pg pool version when DB is SQLite
 */

import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { getPrismaClient } from './services/prisma.js';

async function generateReport() {
  console.log('🔍 Starting live database analysis with Prisma...');

  const prisma = getPrismaClient();

  try {
    // ===== CORE TABLE STATS =====
    const [snapshots, boards, leads, attribs, sequences] = await Promise.all([
      prisma.mondayCallSnapshot.aggregate({
        _count: { id: true },
        _max: { updatedAt: true }
      }),
      prisma.mondayBoardRegistry.count({ where: { active: true } }),
      prisma.leadOutcome.count(),
      prisma.leadAttribution.count(),
      prisma.sequenceRegistry.count({ where: { status: 'active' } })
    ]);

    // ===== MONDAY SYNC HEALTH =====
    const syncHealth = await prisma.mondaySyncState.aggregate({
      _count: { id: true },
      _avg: { 
        lastSyncAt: { 
          select: { 
            _avg: { 
              updatedAt: true 
            } 
          } 
        } 
      }
    });

    // ===== 7-DAY KPIs =====
    const kpis = await prisma.mondayCallSnapshot.aggregate({
      where: {
        updatedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }
      },
      _count: true,
      _sum: { isBooked: true }
    });

    const report = `# 📊 LIVE DATABASE REPORT (Prisma)
Generated: ${new Date().toISOString()}

## Table Counts
| Table | Count |
|-------|-------|
| monday_call_snapshots | ${snapshots._count.id} |
| Active boards | ${boards} |
| lead_outcomes | ${leads} |
| lead_attribution | ${attribs} |
| Active sequences | ${sequences} |

## Health
All tables accessible via Prisma ✅

---
*Powered by Prisma Client*
`;

    fs.writeFileSync(path.resolve('../LIVE-DATABASE-REPORT.md'), report);
    console.log('✅ LIVE-DATABASE-REPORT.md generated with Prisma!');
  } catch (error) {
    console.error('❌ Prisma report error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

generateReport();

