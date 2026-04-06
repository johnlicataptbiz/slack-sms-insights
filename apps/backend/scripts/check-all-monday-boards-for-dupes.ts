#!/usr/bin/env tsx
/**
 * Check multiple Monday boards for duplicate items.
 *
 * Usage:
 *   MONDAY_API_TOKEN=your_token npx tsx scripts/check-all-monday-boards-for-dupes.ts
 *
 * Can also specify specific boards:
 *   MONDAY_API_TOKEN=your_token npx tsx scripts/check-all-monday-boards-for-dupes.ts 18404367751 18404367764 18404367781
 */

import 'dotenv/config';

const MONDAY_API_URL = 'https://api.monday.com/v2';

const DEFAULT_BOARDS = ['18404367764', '18404367751', '18404367781'];

const getMondayToken = (): string => {
  const token = (process.env.MONDAY_API_TOKEN || '').trim();
  if (!token) {
    throw new Error('MONDAY_API_TOKEN environment variable is required');
  }
  return token;
};

async function requestMonday(query: string, variables: Record<string, unknown>) {
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
        .join('; ') ??
      `Monday API request failed with status ${response.status}`;
    throw new Error(errMsg);
  }

  return payload.data;
}

async function getBoardName(boardId: string): Promise<string> {
  const query = `
    query GetBoardName($boardId: [ID!]) {
      boards(ids: $boardId) {
        name
        items_page(limit: 1) {
          items {
            id
          }
        }
      }
    }
  `;
  const data = (await requestMonday(query, { boardId: [boardId] })) as {
    boards?: Array<{ name?: string; items_page?: { items: Array<{ id: string }> } }>;
  };
  return data?.boards?.[0]?.name ?? `Board ${boardId}`;
}

interface BoardItem {
  id: string;
  name: string;
  created_at: string;
}

async function getAllBoardItems(boardId: string): Promise<BoardItem[]> {
  const query = `
    query GetAllBoardItems($boardId: [ID!]) {
      boards(ids: $boardId) {
        items_page(limit: 500) {
          items {
            id
            name
            created_at
          }
        }
      }
    }
  `;

  const data = (await requestMonday(query, { boardId: [boardId] })) as {
    boards?: Array<{ items_page?: { items?: BoardItem[] } }>;
  };

  return data?.boards?.[0]?.items_page?.items ?? [];
}

const extractContactName = (itemName: string): string => {
  const separatorIndex = itemName.indexOf(' - ');
  if (separatorIndex > 0) return itemName.substring(0, separatorIndex).trim();
  const bulletIndex = itemName.indexOf(' • ');
  if (bulletIndex > 0) return itemName.substring(0, bulletIndex).trim();
  return itemName.trim();
};

async function analyzeBoard(boardId: string): Promise<{
  totalItems: number;
  uniqueNames: number;
  duplicateCount: number;
  duplicateDetails: Array<{ name: string; count: number }>;
}> {
  console.log(`\n📋 Checking board ${boardId}...`);
  const boardName = await getBoardName(boardId);
  console.log(`  Board name: "${boardName}"`);

  const items = await getAllBoardItems(boardId);
  console.log(`  Found ${items.length} total items`);

  if (items.length === 0) {
    return { totalItems: 0, uniqueNames: 0, duplicateCount: 0, duplicateDetails: [] };
  }

  const itemsByName = new Map<string, BoardItem[]>();
  for (const item of items) {
    const name = extractContactName(item.name);
    const key = name.toLowerCase();
    const existing = itemsByName.get(key) ?? [];
    itemsByName.set(key, [...existing, item]);
  }

  console.log(`  Unique contact names: ${itemsByName.size}`);

  let duplicateCount = 0;
  const duplicateDetails: Array<{ name: string; count: number }> = [];

  for (const [contactName, contactItems] of itemsByName) {
    if (contactItems.length > 1) {
      duplicateCount += contactItems.length - 1;
      duplicateDetails.push({ name: contactName, count: contactItems.length });
    }
  }

  if (duplicateDetails.length > 0) {
    console.log(`  ⚠️  Found ${duplicateDetails.length} contacts with duplicates (${duplicateCount} extra items):`);
    for (const detail of duplicateDetails.slice(0, 10)) {
      console.log(`    - "${detail.name}": ${detail.count} items`);
    }
    if (duplicateDetails.length > 10) {
      console.log(`    ... and ${duplicateDetails.length - 10} more`);
    }
  } else {
    console.log(`  ✅ No duplicates found!`);
  }

  return { totalItems: items.length, uniqueNames: itemsByName.size, duplicateCount, duplicateDetails };
}

async function main() {
  const args = process.argv.slice(2);
  const boardIds = args.length > 0 ? args : DEFAULT_BOARDS;

  console.log('🧹 Monday Board Duplicate Analyzer');
  console.log(`Boards to check: ${boardIds.join(', ')}`);
  console.log('');

  const results: Awaited<ReturnType<typeof analyzeBoard>>[] = [];
  for (const boardId of boardIds) {
    try {
      const result = await analyzeBoard(boardId);
      results.push(result);
    } catch (error) {
      console.error(`  ❌ Error checking board ${boardId}: ${error instanceof Error ? error.message : String(error)}`);
      results.push({ totalItems: 0, uniqueNames: 0, duplicateCount: 0, duplicateDetails: [] });
    }
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 SUMMARY');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(
    `Board ID            | Total Items | Unique Names | Duplicates`,
  );
  console.log('----------------------|-------------|--------------|-----------');
  let totalAllItems = 0;
  let totalAllDupes = 0;
  for (let i = 0; i < boardIds.length; i++) {
    const r = results[i];
    const boardId = boardIds[i];
    const dupLabel = r.duplicateCount > 0 ? `⚠️  ${r.duplicateCount}` : '✅ 0';
    console.log(
      `${boardId.padEnd(21)}| ${String(r.totalItems).padStart(11)} | ${String(r.uniqueNames).padStart(12)} | ${dupLabel}`,
    );
    totalAllItems += r.totalItems;
    totalAllDupes += r.duplicateCount;
  }
  console.log('----------------------|-------------|--------------|-----------');
  console.log(
    `TOTAL                 | ${String(totalAllItems).padStart(11)} |             | ${totalAllDupes > 0 ? `⚠️  ${totalAllDupes}` : '✅ 0'}`,
  );
}

main().catch((error) => {
  console.error('❌ Failed:', error);
  process.exit(1);
});