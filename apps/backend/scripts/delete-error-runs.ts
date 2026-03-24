/**
 * Script: delete-error-runs.ts
 * Deletes the 2 known Prisma Accelerate error runs from daily_runs table
 * and triggers a manual backfill POST for any missing report dates.
 *
 * Run via: railway run npx tsx scripts/delete-error-runs.ts
 */

import { getPrismaClient } from '../services/prisma.js';

const prisma = getPrismaClient();

const ERROR_RUN_IDS = [
  '0bd82467-9cee-4da2-a964-c9ef26ca67a8', // Mar 14 10:45 — Cloudflare Worker resource limit
  '7eff7dac-aad8-470e-ad35-25b10e1db9d5', // Mar 13 13:35 — Accelerate connectivity failure
];

async function main() {
  console.log('=== delete-error-runs ===\n');

  // 1. Show current state before deletion
  console.log('Current error runs to delete:');
  const before = await prisma.daily_runs.findMany({
    where: { id: { in: ERROR_RUN_IDS } },
    select: { id: true, status: true, timestamp: true, report_date: true, error_message: true },
  });

  if (before.length === 0) {
    console.log('  No matching error runs found — already deleted or IDs changed.');
  } else {
    for (const r of before) {
      console.log(`  [${r.status}] id=${r.id}  ts=${r.timestamp?.toISOString().slice(0, 19)}  reportDate=${r.report_date?.toISOString().slice(0, 10) ?? 'null'}`);
      console.log(`    err: ${String(r.error_message ?? '').slice(0, 100).replace(/\n/g, ' ')}`);
    }
  }

  // 2. Delete the error rows
  console.log('\nDeleting error rows...');
  const deleted = await prisma.daily_runs.deleteMany({
    where: { id: { in: ERROR_RUN_IDS } },
  });
  console.log(`  Deleted ${deleted.count} row(s).`);

  // 3. Show remaining runs (last 10) to confirm clean state
  console.log('\nRemaining recent runs (last 10):');
  const remaining = await prisma.daily_runs.findMany({
    orderBy: { timestamp: 'desc' },
    take: 10,
    select: { id: true, status: true, timestamp: true, report_date: true },
  });

  for (const r of remaining) {
    const icon = r.status === 'success' ? '✅' : r.status === 'error' ? '❌' : '⏳';
    console.log(`  ${icon} ${r.timestamp?.toISOString().slice(0, 19)}  reportDate=${r.report_date?.toISOString().slice(0, 10) ?? 'null'}  [${r.status}]`);
  }

  // 4. Check for missing report dates in the last 7 days
  console.log('\nChecking for missing report dates in last 7 days...');
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

  const successfulRuns = await prisma.daily_runs.findMany({
    where: {
      status: 'success',
      timestamp: { gte: sevenDaysAgo },
      report_date: { not: null },
    },
    orderBy: { report_date: 'desc' },
    select: { report_date: true, timestamp: true },
  });

  const coveredDates = new Set(
    successfulRuns
      .map(r => r.report_date?.toISOString().slice(0, 10))
      .filter(Boolean)
  );

  console.log(`  Covered report dates: ${[...coveredDates].sort().join(', ')}`);

  // Generate expected dates (yesterday back 7 days)
  const expectedDates: string[] = [];
  for (let i = 1; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    expectedDates.push(d.toISOString().slice(0, 10));
  }

  const missingDates = expectedDates.filter(d => !coveredDates.has(d));
  if (missingDates.length === 0) {
    console.log('  ✅ No missing dates — all last 7 days are covered.');
  } else {
    console.log(`  ⚠️  Missing report dates: ${missingDates.join(', ')}`);
    console.log('  → Trigger manual runs via POST /api/runs for these dates.');
  }

  console.log('\n=== Done ===');
}

main()
  .catch(e => {
    console.error('Script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    try { await (prisma as any).$disconnect(); } catch {}
  });
