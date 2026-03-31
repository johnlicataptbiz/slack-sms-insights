/**
 * cleanup-error-runs.ts
 * Deletes ALL remaining error rows from daily_runs and verifies clean state.
 *
 * Run via: railway run npx tsx scripts/cleanup-error-runs.ts
 */

import { getPrismaClient } from '../services/prisma.js';

const prisma = getPrismaClient();

async function main() {
  // Find remaining error runs
  const errors = await prisma.daily_runs.findMany({
    where: { status: 'error' },
    select: { id: true, timestamp: true, report_date: true, error_message: true },
    orderBy: { timestamp: 'desc' },
    take: 20,
  });

  console.log(`Remaining error runs: ${errors.length}`);
  for (const r of errors) {
    const ts = r.timestamp?.toISOString().slice(0, 19) ?? 'null';
    const rd = r.report_date?.toISOString().slice(0, 10) ?? 'null';
    const err = (r.error_message ?? '').slice(0, 80);
    console.log(`  [error] id=${r.id}  ts=${ts}  reportDate=${rd}`);
    console.log(`    err: ${err}`);
  }

  if (errors.length > 0) {
    const ids = errors.map((r) => r.id);
    const del = await prisma.daily_runs.deleteMany({ where: { id: { in: ids } } });
    console.log(`\nDeleted ${del.count} error row(s).`);
  } else {
    console.log('\nNo error rows to delete — already clean.');
  }

  // Verify clean state
  const recent = await prisma.daily_runs.findMany({
    orderBy: { timestamp: 'desc' },
    take: 10,
    select: { id: true, status: true, timestamp: true, report_date: true },
  });

  console.log('\nClean state (last 10):');
  for (const r of recent) {
    const icon = r.status === 'success' ? '✅' : '❌';
    const ts = r.timestamp?.toISOString().slice(0, 19) ?? 'null';
    const rd = r.report_date?.toISOString().slice(0, 10) ?? 'null';
    console.log(`  ${icon} ${ts}  reportDate=${rd}  [${r.status}]`);
  }
}

main()
  .catch((e) => {
    console.error('Script failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    try {
      await (prisma as any).$disconnect();
    } catch {}
  });
