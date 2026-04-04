#!/usr/bin/env tsx
/**
 * Push SMS weekly reports to Monday.com.
 *
 * This script backfills the leadership summary board with curated weekly
 * snapshots instead of raw daily rows.
 */

import { syncWeeklySummaryToMonday } from '../services/weekly-manager-summary.js';

const weeksBack = Number.parseInt(
  (process.argv.find((arg) => arg.startsWith('--weeks=')) || '').split('=')[1] || '4',
  10,
);

const mondayWeekStart = (base: Date): string => {
  const date = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate()));
  const currentDay = date.getUTCDay();
  const deltaToMonday = currentDay === 0 ? 6 : currentDay - 1;
  date.setUTCDate(date.getUTCDate() - deltaToMonday);
  return date.toISOString().slice(0, 10);
};

async function main() {
  console.log('🚀 Pushing SMS Weekly Reports to Monday.com');
  console.log(`📅 Weeks back: ${weeksBack}`);
  console.log('');

  const summaries: Array<{ weekStart: string; status: string; itemId: string | null }> = [];

  for (let offset = weeksBack - 1; offset >= 0; offset -= 1) {
    const base = new Date();
    base.setUTCDate(base.getUTCDate() - offset * 7);
    const weekStart = mondayWeekStart(base);
    const result = await syncWeeklySummaryToMonday({ weekStart }, console);
    summaries.push({ weekStart, status: result.status, itemId: result.itemId });
    console.log(`  ✓ ${weekStart}: ${result.status}${result.itemId ? ` (${result.itemId})` : ''}`);
  }

  console.log('');
  console.log('📊 Summary:');
  console.log(`   ✓ Synced: ${summaries.filter((row) => row.status === 'synced').length}`);
  console.log(`   ✗ Skipped: ${summaries.filter((row) => row.status === 'skipped').length}`);
  console.log('');
  console.log('✅ Weekly report backfill completed!');
}

main().catch((error) => {
  console.error('❌ Backfill failed:', error);
  process.exit(1);
});
