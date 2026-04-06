#!/usr/bin/env tsx
/**
 * Repair Monday Board Columns - Phase 2 Optimization
 *
 * Compares existing columns on each Monday board against the redesigned schema
 * in monday-board-schemas.ts and adds any missing columns.
 *
 * Usage: npx tsx scripts/repair-monday-board-columns.ts
 *
 * Features:
 * - Detects missing columns by comparing board state to schema
 * - Creates missing columns with correct types and status labels
 * - Reports drift (type mismatches, extra columns)
 * - Non-destructive: never deletes or renames existing columns
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  findMissingBoardColumns,
  type MondayColumnDefinition,
  mondaySmsBoardSchemas,
} from '../services/monday-board-schemas.js';

// ─────────────────────────────────────────────────────────────────────────────
// Environment Setup
// ─────────────────────────────────────────────────────────────────────────────

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
if (!MONDAY_API_TOKEN) {
  console.error('❌ Error: MONDAY_API_TOKEN environment variable is required');
  console.error('   Set it in your .env file or environment');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// Board Configuration: Override with env vars, then fall back to plan defaults
// ─────────────────────────────────────────────────────────────────────────────

const BOARD_CONFIG: Record<string, string> = {
  events: process.env.MONDAY_SMS_EVENTS_BOARD_ID || '18404367751',
  sequences: process.env.MONDAY_SMS_SEQUENCES_BOARD_ID || '18404367764',
  reports: process.env.MONDAY_SMS_REPORTS_BOARD_ID || '18404367781',
};

// ─────────────────────────────────────────────────────────────────────────────
// Monday API Client
// ─────────────────────────────────────────────────────────────────────────────

type MondayApiResponse<T> = {
  data?: T;
  errors?: Array<{ message: string }>;
};

async function callMondayApi<T>(
  query: string,
  variables?: Record<string, unknown>,
): Promise<MondayApiResponse<T>> {
  const response = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: MONDAY_API_TOKEN as string,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Monday API request failed: ${response.statusText}`);
  }

  return response.json() as Promise<MondayApiResponse<T>>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Board & Column Queries
// ─────────────────────────────────────────────────────────────────────────────

interface BoardColumn {
  id: string;
  title: string;
  type: string;
}

async function getBoardColumns(boardId: string): Promise<BoardColumn[]> {
  const query = `
    query ($boardId: [ID!]) {
      boards(ids: $boardId) {
        id
        name
        columns {
          id
          title
          type
        }
      }
    }
  `;

  const result = await callMondayApi<{
    boards?: Array<{ id: string; name: string; columns: BoardColumn[] }>;
  }>(query, { boardId: [boardId] });

  if (result.errors) {
    const messages = result.errors.map((e) => e.message).join(', ');
    throw new Error(`Failed to fetch board columns: ${messages}`);
  }

  const board = result.data?.boards?.[0];
  if (!board) {
    throw new Error(`Board ${boardId} not found or inaccessible`);
  }

  console.log(`  📋 Board "${board.name}" (${board.id})`);
  console.log(`     Found ${board.columns.length} existing columns`);

  return board.columns;
}

// ─────────────────────────────────────────────────────────────────────────────
// Column Creation with Status Defaults
// ─────────────────────────────────────────────────────────────────────────────

const MONDAY_TYPE_MAP: Record<string, string> = {
  status: 'status',
  text: 'text',
  numbers: 'numbers',
  date: 'date',
  link: 'link',
  long_text: 'long_text',
  phone: 'phone',
};

async function createColumn(
  boardId: string,
  definition: MondayColumnDefinition,
): Promise<{ created: boolean; columnId: string | null; error?: string }> {
  const mondayType = MONDAY_TYPE_MAP[definition.type];
  if (!mondayType) {
    return {
      created: false,
      columnId: null,
      error: `Unknown column type: ${definition.type}`,
    };
  }

  // Build defaults for status columns (labels)
  let defaults: string | undefined;
  if (definition.type === 'status' && definition.defaults?.labels) {
    defaults = JSON.stringify(definition.defaults);
  }

  const query = `
    mutation ($boardId: ID!, $title: String!, $columnType: ColumnType!, $defaults: JSON) {
      create_column(board_id: $boardId, title: $title, column_type: $columnType, defaults: $defaults) {
        id
        title
      }
    }
  `;

  const result = await callMondayApi<{
    create_column?: { id: string; title: string };
  }>(query, {
    boardId,
    title: definition.title,
    columnType: mondayType,
    defaults,
  });

  if (result.errors) {
    const messages = result.errors.map((e) => e.message).join(', ');
    // Check for "column already exists" errors (common when re-running)
    if (
      messages.toLowerCase().includes('already exists') ||
      messages.toLowerCase().includes('duplicate')
    ) {
      return { created: false, columnId: null, error: `already exists` };
    }
    return { created: false, columnId: null, error: messages };
  }

  const columnId = result.data?.create_column?.id || null;
  return { created: Boolean(columnId), columnId };
}

// ─────────────────────────────────────────────────────────────────────────────
// Drift Detection: Compare existing columns to schema
// ─────────────────────────────────────────────────────────────────────────────

interface DriftReport {
  boardKey: string;
  boardId: string;
  boardName: string;
  missing: MondayColumnDefinition[];
  typeMismatches: Array<{ title: string; expected: string; actual: string }>;
  extraColumns: string[];
}

function detectDrift(
  boardKey: string,
  boardId: string,
  boardName: string,
  existingColumns: BoardColumn[],
  schemaColumns: MondayColumnDefinition[],
): DriftReport {
  // Missing columns: in schema but not on board
  const missing = findMissingBoardColumns(existingColumns, {
    key: boardKey as 'events' | 'sequences' | 'reports',
    boardName,
    columns: schemaColumns,
  });

  // Type mismatches: column exists but type differs
  const typeMismatches: Array<{
    title: string;
    expected: string;
    actual: string;
  }> = [];
  for (const schemaCol of schemaColumns) {
    const existing = existingColumns.find(
      (c) => c.title.toLowerCase() === schemaCol.title.toLowerCase(),
    );
    if (existing && existing.type !== MONDAY_TYPE_MAP[schemaCol.type]) {
      typeMismatches.push({
        title: schemaCol.title,
        expected: MONDAY_TYPE_MAP[schemaCol.type],
        actual: existing.type,
      });
    }
  }

  // Extra columns: on board but not in schema
  const existingTitleSet = new Set(
    schemaColumns.map((c) => c.title.toLowerCase()),
  );
  const extraColumns = existingColumns
    .filter((c) => !existingTitleSet.has(c.title.toLowerCase()))
    .map((c) => c.title);

  return {
    boardKey,
    boardId,
    boardName,
    missing,
    typeMismatches,
    extraColumns,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Repair Function
// ─────────────────────────────────────────────────────────────────────────────

async function repairBoard(
  boardKey: string,
  boardId: string,
): Promise<{
  success: boolean;
  repaired: number;
  skipped: number;
  errors: string[];
}> {
  const schema =
    mondaySmsBoardSchemas[boardKey as keyof typeof mondaySmsBoardSchemas];
  if (!schema) {
    return {
      success: false,
      repaired: 0,
      skipped: 0,
      errors: [`No schema found for board key: ${boardKey}`],
    };
  }

  console.log(`\n── ${schema.boardName} (Board: ${boardId}) ──`);

  // Step 1: Fetch existing columns
  let existingColumns: BoardColumn[];
  try {
    existingColumns = await getBoardColumns(boardId);
  } catch (error) {
    return {
      success: false,
      repaired: 0,
      skipped: 0,
      errors: [
        `Failed to fetch columns: ${error instanceof Error ? error.message : String(error)}`,
      ],
    };
  }

  // Step 2: Detect drift
  const drift = detectDrift(
    boardKey,
    boardId,
    schema.boardName,
    existingColumns,
    schema.columns,
  );
  const errors: string[] = [];
  let repaired = 0;
  let skipped = 0;

  // Report drift
  if (drift.missing.length > 0) {
    console.log(`  🔧 Missing columns (${drift.missing.length}):`);
    for (const col of drift.missing) {
      console.log(`     - "${col.title}" (type: ${col.type})`);
    }
  }

  if (drift.typeMismatches.length > 0) {
    console.log(`  ⚠️  Type mismatches (${drift.typeMismatches.length}):`);
    for (const m of drift.typeMismatches) {
      console.log(
        `     - "${m.title}": expected ${m.expected}, got ${m.actual}`,
      );
    }
    errors.push(
      `Type mismatches detected (cannot auto-fix): ${drift.typeMismatches.map((m) => `"${m.title}"`).join(', ')}`,
    );
  }

  if (drift.extraColumns.length > 0) {
    console.log(
      `  ℹ️  Extra columns (not in schema): ${drift.extraColumns.join(', ')}`,
    );
  }

  if (drift.missing.length === 0 && drift.typeMismatches.length === 0) {
    console.log('  ✅ Board schema is up to date - no changes needed');
    return { success: true, repaired: 0, skipped: 0, errors: [] };
  }

  // Step 3: Create missing columns
  if (drift.missing.length > 0) {
    console.log('\n  🏗️  Creating missing columns...');
    for (const colDef of drift.missing) {
      process.stdout.write(`     Creating "${colDef.title}"... `);
      const result = await createColumn(boardId, colDef);

      if (result.created) {
        console.log(`✅ (id: ${result.columnId})`);
        repaired++;
      } else if (result.error?.includes('already exists')) {
        console.log('⏭️  (already exists, skipped)');
        skipped++;
      } else {
        console.log(`❌ ${result.error || 'unknown error'}`);
        errors.push(
          `Failed to create "${colDef.title}": ${result.error || 'unknown error'}`,
        );
      }
    }
  }

  return { success: repaired > 0 || skipped > 0, repaired, skipped, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// Entry Point
// ─────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🔧 Monday Board Column Repair - Phase 2');
  console.log('══════════════════════════════════════════════');
  console.log('Comparing board columns against monday-board-schemas.ts');
  console.log(`Boards to check: ${Object.keys(BOARD_CONFIG).join(', ')}`);

  const results: Array<{
    boardKey: string;
    boardId: string;
    repaired: number;
    skipped: number;
    errors: string[];
    success: boolean;
  }> = [];

  for (const [boardKey, boardId] of Object.entries(BOARD_CONFIG)) {
    const result = await repairBoard(boardKey, boardId);
    results.push({
      boardKey,
      boardId,
      ...result,
    });
  }

  // Summary
  console.log('\n══════════════════════════════════════════════');
  console.log('📊 Repair Summary');
  console.log('─────────────────────────────────────────────');

  let totalRepaired = 0;
  let totalSkipped = 0;
  let allSuccessful = true;

  for (const r of results) {
    const status = r.success ? '✅' : '❌';
    console.log(
      `  ${status} ${r.boardKey} (${r.boardId}): ${r.repaired} created, ${r.skipped} skipped`,
    );
    totalRepaired += r.repaired;
    totalSkipped += r.skipped;
    if (!r.success) allSuccessful = false;
    for (const err of r.errors) {
      console.log(`     ⚠️  ${err}`);
    }
  }

  console.log('');
  console.log(
    `Total: ${totalRepaired} columns created, ${totalSkipped} skipped (already existed)`,
  );

  if (allSuccessful) {
    console.log('\n✅ Board column repair complete!');
    console.log('\n📝 Next steps:');
    console.log('   1. Verify columns appear correctly in Monday.com UI');
    console.log(
      '   2. Test sync: npx tsx scripts/push-sms-events-to-monday.ts',
    );
    console.log('   3. Configure Monday automations (Phase 3)');
  } else {
    console.log('\n⚠️  Repair completed with errors - review warnings above');
    console.log('   Some columns could not be created');
  }
}

main().catch((error) => {
  console.error('\n❌ Fatal error:', error);
  process.exit(1);
});
