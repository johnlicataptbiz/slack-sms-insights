#!/usr/bin/env tsx
/**
 * Cleanup script for SMS Daily Reports board (18404367781).
 * Keeps only the most recent 14 days of reports.
 *
 * Usage:
 *   MONDAY_API_TOKEN=your_token npx tsx scripts/cleanup-sms-daily-reports-board.ts [--keep-days=14] [--dry-run=false]
 */

import 'dotenv/config';

const MONDAY_API_URL = 'https://api.monday.com/v2';
const BOARD_ID = '18404367781';

const getMondayToken = (): string => {
  const token = (process.env.MONDAY_API_TOKEN || '').trim();
  if (!token) throw new Error('MONDAY_API_TOKEN is required');
  return token;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function requestMonday(query: string, variables: Record<string, unknown>) {
  const token = getMondayToken();
  const response = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: { Authorization: token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const payload = (await response.json()) as { data?: unknown; errors?: Array<{ message?: string }> };
  if (!response.ok || payload.errors?.length) {
    throw new Error(
      payload.errors?.map((e) => e.message).filter(Boolean).join('; ') ?? `HTTP ${response.status}`,
    );
  }
  return payload.data;
}

async function getAllBoardItems(boardId: string) {
  const query = `
    query GetItems($boardId: [ID!]) {
      boards(ids: $boardId) {
        items_page(limit: 500) {
          items { id, name, created_at }
        }
      }
    }
  `;
  const data = (await requestMonday(query, { boardId: [boardId] })) as {
    boards?: Array<{ items_page?: { items?: Array<{ id: string; name: string; created_at: string }> } }>;
  };
  return data?.boards?.[0]?.items_page?.items ?? [];
}

async function deleteItem(itemId: string, dryRun: boolean) {
  if (dryRun) {
    console.log(`  [DRY RUN] Would delete ${itemId}`);
    return;
  }
  await requestMonday(
    `mutation Del($id: ID!) { delete_item(item_id: $id) { id } }`,
    { id: itemId },
  );
  console.log(`  ✓ Deleted ${itemId}`);
  await sleep(300);
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--dry-run=false');
  const keepDaysParam = args.find((a) => a.startsWith('--keep-days='));
  const keepDays = keepDaysParam ? Number.parseInt(keepDaysParam.split('=')[1], 10) : 14;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - keepDays);

  console.log(`🧹 SMS Daily Reports Board Cleanup (${BOARD_ID})`);
  console.log(`📅 Keeping reports from last ${keepDays} days (after ${cutoff.toISOString().slice(0, 10)})`);
  console.log(`🔒 Dry run: ${dryRun ? 'YES' : 'NO'}`);

  const items = await getAllBoardItems(BOARD_ID);
  console.log(`📊 Found ${items.length} items`);

  const toDelete = items.filter((item) => new Date(item.created_at) < cutoff);
  const toKeep = items.length - toDelete.length;

  console.log(`📋 Will delete ${toDelete.length} items older than ${keepDays} days, keeping ${toKeep}\n`);

  for (const item of toDelete) {
    try {
      await deleteItem(item.id, dryRun);
    } catch (err) {
      console.error(`  ✗ Failed: ${item.id} - ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(dryRun ? `\n📋 Dry run: ${toDelete.length} items would be deleted` : `\n✅ Deleted ${toDelete.length} old items`);
}

main().catch((e) => { console.error('❌', e); process.exit(1); });