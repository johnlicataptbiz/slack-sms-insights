#!/usr/bin/env tsx
/**
 * Migrate data from old Monday boards to redesigned boards
 *
 * Usage: npx tsx scripts/migrate-boards-to-redesign.ts [--dry-run]
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

// Load .env file
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      process.env[key.trim()] = value.trim().replace(/^["']|["']$/g, '');
    }
  }
}

const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;
const dryRun = process.argv.includes('--dry-run');

if (!MONDAY_API_TOKEN) {
  console.error('❌ Error: MONDAY_API_TOKEN environment variable is required');
  process.exit(1);
}

// Old board IDs
const OLD_BOARDS = {
  events: '18404367751',
  sequences: '18404367764',
  reports: '18404367781',
};

// New board IDs
const NEW_BOARDS = {
  personal: process.env.MONDAY_PERSONAL_BOARD_ID || '18404975822',
  reports: process.env.MONDAY_SMS_REPORTS_BOARD_ID || '18404975829',
  sequences: process.env.MONDAY_SMS_SEQUENCES_BOARD_ID || '18404975834',
};

type MondayApiResponse = {
  data?: Record<string, unknown>;
  errors?: Array<{ message: string }>;
};

async function callMondayApi(query: string, variables?: Record<string, unknown>): Promise<MondayApiResponse> {
  const response = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: MONDAY_API_TOKEN!,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Monday API request failed: ${response.statusText}`);
  }

  return response.json();
}

interface ColumnMapping {
  oldColumnId: string;
  oldColumnTitle: string;
  newColumnId: string;
}

interface BoardItem {
  id: string;
  name: string;
  column_values: Array<{
    id: string;
    text: string;
    value: string | null;
  }>;
}

interface BoardColumn {
  id: string;
  title: string;
  type: string;
}

async function getBoardItems(boardId: string): Promise<BoardItem[]> {
  const query = `
    query ($boardId: ID!) {
      boards(ids: [$boardId]) {
        items_page(limit: 500) {
          items {
            id
            name
            column_values {
              id
              text
              value
            }
          }
        }
      }
    }
  `;

  const result = await callMondayApi(query, { boardId });

  if (result.errors) {
    console.error(`  ⚠️  Error fetching items: ${result.errors.map((e) => e.message).join(', ')}`);
    return [];
  }

  const items = result.data?.boards?.[0]?.items_page?.items || [];
  return items;
}

async function getBoardColumns(boardId: string): Promise<BoardColumn[]> {
  const query = `
    query ($boardId: ID!) {
      boards(ids: [$boardId]) {
        columns {
          id
          title
          type
        }
      }
    }
  `;

  const result = await callMondayApi(query, { boardId });

  if (result.errors) {
    console.error(`  ⚠️  Error fetching columns: ${result.errors.map((e) => e.message).join(', ')}`);
    return [];
  }

  return result.data?.boards?.[0]?.columns || [];
}

function buildColumnMappings(oldColumns: BoardColumn[], newColumns: BoardColumn[]): ColumnMapping[] {
  const mappings: ColumnMapping[] = [];

  for (const oldCol of oldColumns) {
    // Try to find matching column in new board by title
    const newCol = newColumns.find((nc) => nc.title.toLowerCase() === oldCol.title.toLowerCase());

    if (newCol) {
      mappings.push({
        oldColumnId: oldCol.id,
        oldColumnTitle: oldCol.title,
        newColumnId: newCol.id,
      });
    }
  }

  return mappings;
}

// Map old status labels to new board's default labels
const STATUS_LABEL_MAP: Record<string, string> = {
  // Old -> New mapping for Status column
  Active: '0', // Maps to first label
  Paused: '1', // Maps to second label
  Testing: '2', // Maps to third label
  Archived: '2', // Maps to third label
  // Trend column
  Up: '0',
  Flat: '1',
  Down: '2',
  // Health column
  Good: '0',
  Watch: '1',
  Action: '2',
};

function mapStatusValue(value: string | null | undefined, columnTitle: string): string | null {
  if (!value) return null;

  // Check if this is a status column that needs mapping
  const lowerTitle = columnTitle.toLowerCase();
  if (lowerTitle === 'status' || lowerTitle === 'trend' || lowerTitle === 'health') {
    return STATUS_LABEL_MAP[value] || value;
  }

  return value;
}

async function createItem(boardId: string, itemName: string): Promise<string | null> {
  if (dryRun) {
    console.log(`    [DRY RUN] Would create: ${itemName}`);
    return 'dry-run-id';
  }

  // Step 1: Create item with just name
  const createQuery = `
    mutation ($boardId: ID!, $itemName: String!) {
      create_item(board_id: $boardId, item_name: $itemName) {
        id
      }
    }
  `;

  const createResult = await callMondayApi(createQuery, { boardId, itemName });

  if (createResult.errors) {
    console.warn(`  ⚠️  "${itemName}" create failed: ${createResult.errors[0]?.message || 'Unknown error'}`);
    return null;
  }

  return createResult.data?.create_item?.id || null;
}

async function patchItemColumns(
  boardId: string,
  itemId: string,
  columnValues: Record<string, unknown>,
): Promise<boolean> {
  if (dryRun) {
    console.log(`    [DRY RUN] Would patch columns for item ${itemId}`);
    return true;
  }

  // Step 2: Patch column values - must stringify!
  const patchQuery = `
    mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
      change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
        id
      }
    }
  `;

  const patchResult = await callMondayApi(patchQuery, {
    boardId,
    itemId,
    columnValues: JSON.stringify(columnValues),
  });

  if (patchResult.errors) {
    console.warn(`  ⚠️  Column patch failed for item ${itemId}: ${patchResult.errors[0]?.message || 'Unknown error'}`);
    return false;
  }

  return true;
}

// ============================================================================
// MIGRATION: SMS Reports
// ============================================================================
async function migrateSmsReports(): Promise<void> {
  console.log('\n📊 Migrating SMS Reports...');
  console.log(`   From: ${OLD_BOARDS.reports}`);
  console.log(`   To:   ${NEW_BOARDS.reports}`);

  const oldItems = await getBoardItems(OLD_BOARDS.reports);
  const oldColumns = await getBoardColumns(OLD_BOARDS.reports);
  const newColumns = await getBoardColumns(NEW_BOARDS.reports);

  console.log(`   Found ${oldItems.length} items in old board`);

  const mappings = buildColumnMappings(oldColumns, newColumns);
  console.log(`   Found ${mappings.length} column mappings`);

  // Build column values using new column IDs
  const columnValuesMap: Record<string, string> = {};
  for (const item of oldItems) {
    for (const mapping of mappings) {
      const cv = item.column_values.find((v) => v.id === mapping.oldColumnId);
      if (cv && cv.text) {
        columnValuesMap[mapping.newColumnId] = cv.text;
      }
    }
  }

  let migrated = 0;

  for (const item of oldItems) {
    const columnValues: Record<string, unknown> = {};

    for (const mapping of mappings) {
      const cv = item.column_values.find((v) => v.id === mapping.oldColumnId);
      if (cv && cv.text) {
        columnValues[mapping.newColumnId] = cv.text;
      }
    }

    const itemName = item.name || `Report ${item.id}`;
    const newId = await createItem(NEW_BOARDS.reports, itemName);

    if (newId) {
      // Patch columns in a second step
      await patchItemColumns(NEW_BOARDS.reports, newId, columnValues);
      migrated++;
    }
  }

  console.log(`   ✅ Migrated ${migrated} of ${oldItems.length} items`);
}

// ============================================================================
// MIGRATION: SMS Sequences
// ============================================================================
async function migrateSmsSequences(): Promise<void> {
  console.log('\n📱 Migrating SMS Sequences...');
  console.log(`   From: ${OLD_BOARDS.sequences}`);
  console.log(`   To:   ${NEW_BOARDS.sequences}`);

  const oldItems = await getBoardItems(OLD_BOARDS.sequences);
  const oldColumns = await getBoardColumns(OLD_BOARDS.sequences);
  const newColumns = await getBoardColumns(NEW_BOARDS.sequences);

  console.log(`   Found ${oldItems.length} items in old board`);

  const mappings = buildColumnMappings(oldColumns, newColumns);
  console.log(`   Found ${mappings.length} column mappings`);

  let migrated = 0;

  for (const item of oldItems) {
    const columnValues: Record<string, unknown> = {};

    for (const mapping of mappings) {
      const cv = item.column_values.find((v) => v.id === mapping.oldColumnId);
      if (cv && cv.text) {
        // Map status labels to new board's format
        const mappedValue = mapStatusValue(cv.text, mapping.oldColumnTitle);
        if (mappedValue) {
          columnValues[mapping.newColumnId] = mappedValue;
        }
      }
    }

    const itemName = item.name || `Sequence ${item.id}`;
    const newId = await createItem(NEW_BOARDS.sequences, itemName);

    if (newId) {
      // Patch columns in a second step
      await patchItemColumns(NEW_BOARDS.sequences, newId, columnValues);
      migrated++;
    }
  }

  console.log(`   ✅ Migrated ${migrated} of ${oldItems.length} items`);
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log('🚀 Monday Board Migration to Redesigned Boards');
  console.log('═══════════════════════════════════════════════\n');

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  try {
    await migrateSmsReports();
    await migrateSmsSequences();

    console.log('\n═══════════════════════════════════════════════');
    console.log('✅ Migration complete!');
    console.log('\n📋 Board summary:');
    console.log(`   Old SMS Events Board:    ${OLD_BOARDS.events} (manual migration needed)`);
    console.log(`   Old SMS Sequences Board: ${OLD_BOARDS.sequences} (migrated above)`);
    console.log(`   Old SMS Reports Board:   ${OLD_BOARDS.reports} (migrated above)`);
    console.log('\n🔗 View new boards:');
    console.log(`   Personal Booked Calls: ${NEW_BOARDS.personal}`);
    console.log(`   SMS Reports:           ${NEW_BOARDS.reports}`);
    console.log(`   SMS Sequences:         ${NEW_BOARDS.sequences}`);
    console.log('\n📝 Next steps:');
    console.log('   1. Review migrated data in new boards');
    console.log('   2. Archive old boards in Monday.com when ready');
    console.log('');
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

main();
