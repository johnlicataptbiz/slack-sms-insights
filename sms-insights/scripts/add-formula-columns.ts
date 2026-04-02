#!/usr/bin/env tsx
/**
 * Add Formula Columns to Redesigned Monday Boards
 * 
 * Formula columns calculate metrics automatically in Monday.
 * 
 * Usage: npx tsx scripts/add-formula-columns.ts
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

if (!MONDAY_API_TOKEN) {
  console.error('❌ Error: MONDAY_API_TOKEN environment variable is required');
  process.exit(1);
}

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

// Board IDs
const BOARDS = {
  personal: process.env.MONDAY_PERSONAL_BOARD_ID || '18404975822',
  reports: process.env.MONDAY_SMS_REPORTS_BOARD_ID || '18404975829',
  sequences: process.env.MONDAY_SMS_SEQUENCES_BOARD_ID || '18404975834',
};

interface Column {
  id: string;
  title: string;
  type: string;
}

async function getBoardColumns(boardId: string): Promise<Column[]> {
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
    console.error(`  ⚠️  Error: ${result.errors.map((e) => e.message).join(', ')}`);
    return [];
  }

  return result.data?.boards?.[0]?.columns || [];
}

async function createFormulaColumn(
  boardId: string,
  title: string,
  formula: string
): Promise<string | null> {
  const query = `
    mutation ($boardId: ID!, $title: String!, $formula: String!) {
      create_column(
        board_id: $boardId,
        title: $title,
        column_type: formula,
        description: $formula
      ) {
        id
        title
      }
    }
  `;

  const result = await callMondayApi(query, { boardId, title, formula });

  if (result.errors) {
    console.warn(`  ⚠️  "${title}": ${result.errors.map((e) => e.message).join(', ')}`);
    return null;
  }

  return result.data?.create_column?.id || null;
}

// ============================================================================
// SMS REPORTS BOARD FORMULAS
// ============================================================================
async function setupReportsFormulas(boardId: string): Promise<void> {
  console.log('  📊 Adding formulas to SMS Reports board...');

  const columns = await getBoardColumns(boardId);
  
  // Find existing columns
  const hasJack = columns.some(c => c.title === 'Jack');
  const hasBrandon = columns.some(c => c.title === 'Brandon');
  const hasSelfBooked = columns.some(c => c.title === 'Self Booked');
  const hasReplyRate = columns.some(c => c.title === 'Reply Rate %');
  const hasBookedTarget = columns.some(c => c.title === 'Booked Target');
  const hasReplyTarget = columns.some(c => c.title === 'Reply Target');

  // Create target columns if missing
  if (!hasBookedTarget) {
    await createColumn(boardId, 'Booked Target', 'numbers', '10');
    console.log('    ✓ Created: Booked Target');
  }
  
  if (!hasReplyTarget) {
    await createColumn(boardId, 'Reply Target', 'numbers', '15');
    console.log('    ✓ Created: Reply Target');
  }

  // Create formulas
  const formulas = [
    {
      title: 'Total Booked Formula',
      formula: `{Jack}+{Brandon}+{Self Booked}`,
    },
    {
      title: 'Booked vs Target %',
      formula: `IF({Total Booked}>0, ({Total Booked}/{Booked Target})*100, 0)`,
    },
    {
      title: 'Reply Score',
      formula: `MIN({Reply Rate %}/{Reply Target}, 1)*50`,
    },
    {
      title: 'Booked Score',
      formula: `MIN({Total Booked}/{Booked Target}, 1)*50`,
    },
    {
      title: 'Health Score Formula',
      formula: `{Booked Score}+{Reply Score}`,
    },
    {
      title: 'vs Last Week Formula',
      formula: `IF({Total Booked Previous Week}>0, (({Total Booked}-{Total Booked Previous Week})/{Total Booked Previous Week})*100, 0)`,
    },
  ];

  for (const f of formulas) {
    const existing = columns.some(c => c.title === f.title);
    if (!existing) {
      await createFormulaColumn(boardId, f.title, f.formula);
      console.log(`    ✓ Created: ${f.title}`);
    }
  }
}

// ============================================================================
// SMS SEQUENCES BOARD FORMULAS
// ============================================================================
async function setupSequencesFormulas(boardId: string): Promise<void> {
  console.log('  📱 Adding formulas to SMS Sequences board...');

  const columns = await getBoardColumns(boardId);

  const formulas = [
    {
      title: 'Conversion Rate %',
      formula: `IF({Messages Sent}>0, ({Booked Calls}/{Messages Sent})*100, 0)`,
    },
    {
      title: 'Engagement Score',
      formula: `{Reply Rate %}*0.6+{Booking Rate %}*0.4`,
    },
    {
      title: 'Performance Tier',
      formula: `IF({Booking Rate %}>5, "Top", IF({Booking Rate %}>2, "Mid", "Low"))`,
    },
  ];

  for (const f of formulas) {
    const existing = columns.some(c => c.title === f.title);
    if (!existing) {
      await createFormulaColumn(boardId, f.title, f.formula);
      console.log(`    ✓ Created: ${f.title}`);
    }
  }
}

// ============================================================================
// PERSONAL BOOKED CALLS BOARD FORMULAS
// ============================================================================
async function setupPersonalFormulas(boardId: string): Promise<void> {
  console.log('  📅 Adding formulas to Personal Booked Calls board...');

  const columns = await getBoardColumns(boardId);

  const formulas = [
    {
      title: 'Days Until Call',
      formula: `IF({Date Held}<>"", DAYS({Date Held}, TODAY()), "")`,
    },
    {
      title: 'Is This Week',
      formula: `IF(AND({Date Held}>TODAY(), {Date Held}<TODAY()+7), "Yes", "No")`,
    },
    {
      title: 'Needs Reminder',
      formula: `IF(AND({Date Held}<>"", {Date Held}<=TODAY()+1, {Advisor}=""), "Yes", "No")`,
    },
  ];

  for (const f of formulas) {
    const existing = columns.some(c => c.title === f.title);
    if (!existing) {
      await createFormulaColumn(boardId, f.title, f.formula);
      console.log(`    ✓ Created: ${f.title}`);
    }
  }
}

// ============================================================================
// HELPER: Create regular column
// ============================================================================
async function createColumn(
  boardId: string,
  title: string,
  columnType: string,
  defaults?: string
): Promise<string | null> {
  const query = `
    mutation ($boardId: ID!, $title: String!, $columnType: ColumnType!, $defaults: JSON) {
      create_column(
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
    console.warn(`  ⚠️  "${title}": ${result.errors.map((e) => e.message).join(', ')}`);
    return null;
  }

  return result.data?.create_column?.id || null;
}

// ============================================================================
// MAIN
// ============================================================================
async function main() {
  console.log('🚀 Adding Formula Columns to Monday Boards');
  console.log('═══════════════════════════════════════════════\n');

  try {
    console.log('1️⃣  Personal Booked Calls Board...');
    await setupPersonalFormulas(BOARDS.personal);
    console.log('');

    console.log('2️⃣  SMS Reports Board...');
    await setupReportsFormulas(BOARDS.reports);
    console.log('');

    console.log('3️⃣  SMS Sequences Board...');
    await setupSequencesFormulas(BOARDS.sequences);
    console.log('');

    console.log('═══════════════════════════════════════════════');
    console.log('✅ Complete!');
    console.log('\n📝 Formula columns added:');
    console.log('   - Personal: Days Until Call, Is This Week, Needs Reminder');
    console.log('   - Reports: Conversion Rate %, Engagement Score, Health Score');
    console.log('   - Sequences: Conversion Rate %, Engagement Score, Performance Tier');
    console.log('\n📌 Note: Formula columns require Monday Pro plan or higher');
    console.log('');
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
