#!/usr/bin/env tsx
/**
 * Polish Monday.com SMS boards in place.
 *
 * Creates any missing curated columns on the existing SMS boards so the
 * boards read like operational scorecards instead of raw dumps.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { queryBoardColumns } from '../services/monday-client.js';
import { findMissingBoardColumns, mondaySmsBoardSchemas } from '../services/monday-board-schemas.js';

type ColumnCreationResult = {
  title: string;
  created: boolean;
  reason?: string;
};

const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^([^=]+)=(.*)$/);
    if (match) {
      const [, key, value] = match;
      process.env[key.trim()] = value.trim().replace(/^['"]|['"]$/g, '');
    }
  }
}

const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;

if (!MONDAY_API_TOKEN) {
  console.error('❌ Error: MONDAY_API_TOKEN is required');
  process.exit(1);
}

async function callMondayApi(query: string, variables?: Record<string, unknown>) {
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

  const result = await response.json();
  if (result.errors) {
    throw new Error(`Monday API errors: ${JSON.stringify(result.errors)}`);
  }
  return result;
}

async function createColumn(
  boardId: string,
  title: string,
  columnType: string,
  defaults?: Record<string, unknown>,
): Promise<boolean> {
  const query = `
    mutation ($boardId: ID!, $title: String!, $columnType: ColumnType!, $defaults: JSON) {
      create_column (
        board_id: $boardId,
        title: $title,
        column_type: $columnType,
        defaults: $defaults
      ) {
        id
      }
    }
  `;

  const result = await callMondayApi(query, {
    boardId,
    title,
    columnType,
    defaults: defaults ? JSON.stringify(defaults) : undefined,
  });

  if (result.errors) {
    return false;
  }

  return Boolean(result.data?.create_column?.id);
}

async function repairBoard(boardKey: keyof typeof mondaySmsBoardSchemas, boardId: string): Promise<ColumnCreationResult[]> {
  const schema = mondaySmsBoardSchemas[boardKey];
  const existingColumns = await queryBoardColumns(boardId);
  const missingColumns = findMissingBoardColumns(existingColumns, schema);

  const results: ColumnCreationResult[] = [];
  if (missingColumns.length === 0) {
    return schema.columns.map((column) => ({ title: column.title, created: false, reason: 'already present' }));
  }

  console.log(`\n📋 ${schema.boardName} (${boardId})`);
  console.log(`   Missing columns: ${missingColumns.map((col) => col.title).join(', ')}`);

  for (const column of missingColumns) {
    const created = await createColumn(boardId, column.title, column.type, column.defaults);
    results.push({ title: column.title, created, reason: created ? 'created' : 'could not create' });
    console.log(created ? `   ✓ Created ${column.title}` : `   ⚠️  Could not create ${column.title}`);
  }

  return results;
}

async function main() {
  const boardIds = {
    events: (process.env.MONDAY_SMS_EVENTS_BOARD_ID || '18404367751').trim(),
    sequences: (process.env.MONDAY_SMS_SEQUENCES_BOARD_ID || '18404367764').trim(),
    reports: (process.env.MONDAY_SMS_REPORTS_BOARD_ID || '18404367781').trim(),
  };

  if (!boardIds.events || !boardIds.sequences || !boardIds.reports) {
    console.error('❌ Missing one or more Monday SMS board IDs in .env');
    process.exit(1);
  }

  console.log('🧼 Polishing Monday.com SMS boards');
  console.log('═══════════════════════════════════════');
  console.log('Adding curated columns that turn raw dumps into decision boards...');

  const results = await Promise.all([
    repairBoard('events', boardIds.events),
    repairBoard('sequences', boardIds.sequences),
    repairBoard('reports', boardIds.reports),
  ]);

  const createdCount = results.flat().filter((row) => row.created).length;
  console.log('\n═══════════════════════════════════════');
  console.log(`✅ Completed. Created ${createdCount} missing curated column${createdCount === 1 ? '' : 's'}.`);
  console.log('Legacy raw columns were left in place so existing references stay intact.');
}

main().catch((error) => {
  console.error('❌ Board polish failed:', error);
  process.exit(1);
});
