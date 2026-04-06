#!/usr/bin/env tsx
/**
 * Cleanup script for SMS Sequences board (18404367764).
 * Removes duplicate sequence entries, keeping only one per sequence name.
 *
 * Usage:
 *   MONDAY_API_TOKEN=your_token npx tsx scripts/cleanup-sms-sequences-board.ts [--dry-run=false]
 */

import 'dotenv/config';

const MONDAY_API_URL = 'https://api.monday.com/v2';
const BOARD_ID = '18404367764';

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
  console.log(`🧹 SMS Sequences Board Cleanup (${BOARD_ID})`);
  console.log(`🔒 Dry run: ${dryRun ? 'YES' : 'NO'}`);

  const items = await getAllBoardItems(BOARD_ID);
  console.log(`📊 Found ${items.length} items`);

  const byName = new Map<string, Array<{ id: string; name: string; created_at: string }>>();
  for (const item of items) {
    const key = item.name.toLowerCase().trim();
    byName.set(key, [...(byName.get(key) ?? []), item]);
  }

  const toDelete: Array<{ id: string; name: string }> = [];
  for (const [name, group] of byName) {
    if (group.length > 1) {
      const sorted = [...group].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      for (let i = 1; i < sorted.length; i++) {
        toDelete.push({ id: sorted[i].id, name: sorted[i].name });
      }
    }
  }

  console.log(`📋 Duplicates found: ${toDelete.length} items to delete across ${byName.size - (items.length - toDelete.length)} sequence names\n`);

  for (const item of toDelete) {
    try {
      await deleteItem(item.id, dryRun);
    } catch (err) {
      console.error(`  ✗ Failed: ${item.id} - ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(dryRun ? `\n📋 Dry run: ${toDelete.length} items would be deleted` : `\n✅ Deleted ${toDelete.length} duplicates`);
}

main().catch((e) => { console.error('❌', e); process.exit(1); });