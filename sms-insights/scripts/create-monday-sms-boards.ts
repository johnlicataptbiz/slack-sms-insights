#!/usr/bin/env tsx
/**
 * Create Monday.com SMS Integration Boards
 *
 * This script automatically creates the three required boards for SMS integration:
 * 1. SMS Events Board - tracks individual SMS message events
 * 2. SMS Sequences Board - tracks SMS campaigns/sequences
 * 3. SMS Reports Board - tracks daily SMS performance reports
 *
 * Usage: npx tsx scripts/create-monday-sms-boards.ts
 *
 * The script will:
 * - Create all three boards in Monday.com
 * - Set up appropriate columns for each board
 * - Output the board IDs to add to your .env file
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { mondaySmsBoardSchemas } from '../services/monday-board-schemas.js';

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

if (!MONDAY_API_TOKEN) {
  console.error('❌ Error: MONDAY_API_TOKEN environment variable is required');
  console.error('   Make sure it is set in your .env file');
  process.exit(1);
}

type MondayApiResponse = {
  data?: {
    create_board?: {
      id: string;
      name: string;
    };
    create_column?: {
      id: string;
      title: string;
    };
  };
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

async function createBoard(boardName: string, boardKind: string = 'public'): Promise<string> {
  const query = `
    mutation ($boardName: String!, $boardKind: BoardKind!) {
      create_board (
        board_name: $boardName,
        board_kind: $boardKind
      ) {
        id
        name
      }
    }
  `;

  const result = await callMondayApi(query, { boardName, boardKind });

  if (result.errors) {
    throw new Error(`Failed to create board: ${result.errors.map((e) => e.message).join(', ')}`);
  }

  if (!result.data?.create_board?.id) {
    throw new Error('No board ID returned from API');
  }

  return result.data.create_board.id;
}

async function createColumn(
  boardId: string,
  title: string,
  columnType: string,
  defaults?: Record<string, unknown>,
): Promise<string> {
  const query = `
    mutation ($boardId: ID!, $title: String!, $columnType: ColumnType!, $defaults: JSON) {
      create_column (
        board_id: $boardId,
        title: $title,
        column_type: $columnType,
        defaults: $defaults
      ) {
        id
        title
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
    console.warn(`  ⚠️  Warning: Could not create column "${title}": ${result.errors.map((e) => e.message).join(', ')}`);
    return '';
  }

  return result.data?.create_column?.id || '';
}

async function setupSmsEventsBoard(boardId: string): Promise<void> {
  console.log('  📋 Setting up columns for SMS Events board...');
  for (const col of mondaySmsBoardSchemas.events.columns) {
    await createColumn(boardId, col.title, col.type, col.defaults);
    console.log(`    ✓ Created: ${col.title}`);
  }
}

async function setupSmsSequencesBoard(boardId: string): Promise<void> {
  console.log('  📋 Setting up columns for SMS Sequences board...');
  for (const col of mondaySmsBoardSchemas.sequences.columns) {
    await createColumn(boardId, col.title, col.type, col.defaults);
    console.log(`    ✓ Created: ${col.title}`);
  }
}

async function setupSmsReportsBoard(boardId: string): Promise<void> {
  console.log('  📋 Setting up columns for SMS Reports board...');
  for (const col of mondaySmsBoardSchemas.reports.columns) {
    await createColumn(boardId, col.title, col.type, col.defaults);
    console.log(`    ✓ Created: ${col.title}`);
  }
}

async function updateEnvFile(boardIds: { events: string; sequences: string; reports: string }): Promise<void> {
  const envPath = path.join(process.cwd(), '.env');
  let envContent = fs.readFileSync(envPath, 'utf-8');

  const updates = [
    { key: 'MONDAY_SMS_EVENTS_BOARD_ID', value: boardIds.events },
    { key: 'MONDAY_SMS_SEQUENCES_BOARD_ID', value: boardIds.sequences },
    { key: 'MONDAY_SMS_REPORTS_BOARD_ID', value: boardIds.reports },
    { key: 'MONDAY_SMS_SYNC_ENABLED', value: 'true' },
    { key: 'MONDAY_SMS_WRITEBACK_ENABLED', value: 'true' },
    { key: 'MONDAY_SMS_OUTBOUND_ENABLED', value: 'true' },
    { key: 'MONDAY_SMS_SEQUENCES_SYNC_ENABLED', value: 'true' },
    { key: 'MONDAY_SMS_SEQUENCES_WRITEBACK_ENABLED', value: 'true' },
    { key: 'MONDAY_SMS_SEQUENCES_OUTBOUND_ENABLED', value: 'true' },
    { key: 'MONDAY_SMS_REPORTS_SYNC_ENABLED', value: 'true' },
    { key: 'MONDAY_SMS_REPORTS_WRITEBACK_ENABLED', value: 'true' },
    { key: 'MONDAY_SMS_REPORTS_OUTBOUND_ENABLED', value: 'true' },
  ];

  for (const { key, value } of updates) {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    if (regex.test(envContent)) {
      envContent = envContent.replace(regex, `${key}=${value}`);
    } else {
      envContent += `\n${key}=${value}`;
    }
  }

  fs.writeFileSync(envPath, envContent);
}

async function main() {
  console.log('🚀 Monday.com SMS Boards Setup');
  console.log('═══════════════════════════════════════\n');

  const boardIds = {
    events: '',
    sequences: '',
    reports: '',
  };

  try {
    // Create SMS Events Board
    console.log('1️⃣  Creating SMS Events Board...');
    boardIds.events = await createBoard(mondaySmsBoardSchemas.events.boardName, 'public');
    console.log(`  ✅ Created! Board ID: ${boardIds.events}`);
    await setupSmsEventsBoard(boardIds.events);
    console.log('');

    // Create SMS Sequences Board
    console.log('2️⃣  Creating SMS Sequences Board...');
    boardIds.sequences = await createBoard(mondaySmsBoardSchemas.sequences.boardName, 'public');
    console.log(`  ✅ Created! Board ID: ${boardIds.sequences}`);
    await setupSmsSequencesBoard(boardIds.sequences);
    console.log('');

    // Create SMS Reports Board
    console.log('3️⃣  Creating SMS Reports Board...');
    boardIds.reports = await createBoard(mondaySmsBoardSchemas.reports.boardName, 'public');
    console.log(`  ✅ Created! Board ID: ${boardIds.reports}`);
    await setupSmsReportsBoard(boardIds.reports);
    console.log('');

    // Update .env file
    console.log('4️⃣  Updating .env file...');
    await updateEnvFile(boardIds);
    console.log('  ✅ .env file updated!');
    console.log('');

    // Success summary
    console.log('═══════════════════════════════════════');
    console.log('✅ SUCCESS! All boards created!\n');
    console.log('📋 Board IDs:');
    console.log(`   SMS Events:    ${boardIds.events}`);
    console.log(`   SMS Sequences: ${boardIds.sequences}`);
    console.log(`   SMS Reports:   ${boardIds.reports}`);
    console.log('');
    console.log('🔗 View your boards:');
    console.log(`   https://physical-therapy-biz.monday.com/boards/${boardIds.events}`);
    console.log(`   https://physical-therapy-biz.monday.com/boards/${boardIds.sequences}`);
    console.log(`   https://physical-therapy-biz.monday.com/boards/${boardIds.reports}`);
    console.log('');
    console.log('📝 Next steps:');
    console.log('   1. Restart your dev server: npm run dev');
    console.log('   2. Test the integration: npm run test:monday-sms-sync');
    console.log('   3. Run backfills: npx tsx scripts/backfill-sms-events-to-monday.ts');
    console.log('');
  } catch (error) {
    console.error('');
    console.error('❌ Error creating boards:', error);
    process.exit(1);
  }
}

main();
