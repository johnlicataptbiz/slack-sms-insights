#!/usr/bin/env tsx
/**
 * Cleanup script to identify and remove duplicate items from Monday board 10029059942.
 *
 * Board 10029059942 is the personal "My Calls" board.
 * Duplicates were created when backfill scripts ran and upsertBookedCallItem
 * didn't search for existing items before creating new ones.
 *
 * Usage:
 *   MONDAY_API_TOKEN=your_token npx tsx scripts/cleanup-monday-personal-board-dupes.ts [--dry-run]
 *
 * Defaults to dry-run mode for safety. Pass --dry-run=false to actually delete duplicates.
 */

import 'dotenv/config';

const MONDAY_API_URL = 'https://api.monday.com/v2';
const BOARD_ID = '10029059942';

const getMondayToken = (): string => {
  const token = (process.env.MONDAY_API_TOKEN || '').trim();
  if (!token) {
    throw new Error('MONDAY_API_TOKEN environment variable is required');
  }
  return token;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function requestMonday(
  query: string,
  variables: Record<string, unknown>,
) {
  const token = getMondayToken();
  const response = await fetch(MONDAY_API_URL, {
    method: 'POST',
    headers: {
      Authorization: token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  const payload = (await response.json()) as {
    data?: unknown;
    errors?: Array<{ message?: string }>;
  };

  if (!response.ok || payload.errors?.length) {
    const errMsg =
      payload.errors
        ?.map((err) => err.message)
        .filter(Boolean)
        .join('; ') ||
      `Monday API request failed with status ${response.status}`;
    throw new Error(errMsg);
  }

  return payload.data;
}

async function getAllBoardItems(boardId: string) {
  console.log(`📋 Fetching all items from board ${boardId}...`);

  const query = `
    query GetAllBoardItems($boardId: [ID!]) {
      boards(ids: $boardId) {
        items_page(limit: 500) {
          items {
            id
            name
            created_at
            updated_at
            column_values {
              id
              text
            }
          }
        }
      }
    }
  `;

  const data = (await requestMonday(query, { boardId: [boardId] })) as {
    boards?: Array<{
      items_page?: {
        items?: Array<{
          id: string;
          name: string;
          created_at: string;
          updated_at: string;
          column_values?: Array<{
            id: string;
            text: string | null;
          }>;
        }>;
      };
    }>;
  };

  return data?.boards?.[0]?.items_page?.items || [];
}

async function deleteItem(itemId: string, dryRun: boolean) {
  if (dryRun) {
    console.log(`  [DRY RUN] Would delete item ${itemId}`);
    return;
  }

  const mutation = `
    mutation DeleteItem($itemId: ID!) {
      delete_item(item_id: $itemId) {
        id
      }
    }
  `;

  await requestMonday(mutation, { itemId });
  console.log(`  ✓ Deleted item ${itemId}`);
  await sleep(300); // Rate limit friendly
}

async function main() {
  const args = process.argv.slice(2);
  const dryRunFlag = args.find((a) => a.startsWith('--dry-run='));
  const dryRun = dryRunFlag ? dryRunFlag.split('=')[1] !== 'false' : true;

  console.log('🧹 Monday Personal Board Duplicate Cleanup');
  console.log(`📱 Board ID: ${BOARD_ID}`);
  console.log(
    `🔒 Dry run: ${dryRun ? 'YES (no items will be deleted)' : 'NO (items WILL be deleted)'}`,
  );
  console.log('');

  const items = await getAllBoardItems(BOARD_ID);
  console.log(`📊 Found ${items.length} total items on board\n`);

  if (items.length === 0) {
    console.log('✅ No items found on board');
    return;
  }

  // Group by contact name (item name without date/suffix)
  const extractContactName = (itemName: string): string => {
    const separatorIndex = itemName.indexOf(' - ');
    if (separatorIndex > 0) return itemName.substring(0, separatorIndex).trim();
    const bulletIndex = itemName.indexOf(' • ');
    if (bulletIndex > 0) return itemName.substring(0, bulletIndex).trim();
    return itemName.trim();
  };

  // Group items by contact name
  const itemsByName = new Map<
    string,
    Array<{
      id: string;
      name: string;
      created_at: string;
      updated_at: string;
    }>
  >();

  for (const item of items) {
    const name = extractContactName(item.name);
    const key = name.toLowerCase();
    if (!itemsByName.has(key)) itemsByName.set(key, []);
    (itemsByName.get(key) ?? []).push({
      id: item.id,
      name: item.name,
      created_at: item.created_at,
      updated_at: item.updated_at,
    });
  }

  // Find duplicates (contact names with more than one item)
  const itemsToDelete: Array<{
    id: string;
    name: string;
    contactName: string;
  }> = [];

  for (const [contactName, contactItems] of itemsByName) {
    if (contactItems.length > 1) {
      // Keep the oldest (first created), delete the rest
      const sorted = [...contactItems].sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      const keep = sorted[0];
      console.log(
        `⚠️  Duplicate: "${contactName}" has ${contactItems.length} items`,
      );
      console.log(
        `   KEEP: ${keep.id} - ${keep.name} (created: ${keep.created_at})`,
      );

      for (let i = 1; i < sorted.length; i++) {
        const duplicate = sorted[i];
        console.log(
          `   DEL:  ${duplicate.id} - ${duplicate.name} (created: ${duplicate.created_at})`,
        );
        itemsToDelete.push({
          id: duplicate.id,
          name: duplicate.name,
          contactName,
        });
      }
      console.log('');
    }
  }

  if (itemsToDelete.length === 0) {
    console.log('✅ No duplicates found on board!');
    return;
  }

  console.log(
    `\n📊 Summary: Found ${itemsToDelete.length} duplicate items to delete\n`,
  );

  if (dryRun) {
    console.log('ℹ️  This is a dry run. No items will be deleted.');
    console.log('ℹ️  Run with --dry-run=false to actually delete duplicates.\n');
  }

  // Delete duplicates
  let deletedCount = 0;
  for (const item of itemsToDelete) {
    try {
      await deleteItem(item.id, dryRun);
      deletedCount++;
    } catch (error) {
      console.error(
        `  ✗ Failed to delete ${item.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (!dryRun) {
    console.log(
      `\n✅ Deleted ${deletedCount} duplicate items from board ${BOARD_ID}`,
    );
  } else {
    console.log(
      `\n📋 Dry run complete. ${deletedCount} items WOULD have been deleted.`,
    );
  }
}

main().catch((error) => {
  console.error('❌ Cleanup failed:', error);
  process.exit(1);
});
