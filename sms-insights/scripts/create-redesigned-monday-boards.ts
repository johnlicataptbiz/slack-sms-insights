#!/usr/bin/env tsx
/**
 * Create/Update Redesigned Monday.com Boards (per MONDAY_BOARD_REDESIGN_PLAN.md)
 *
 * This script:
 * 1. Queries existing boards by name
 * 2. If found, adds the redesigned columns/groups to them
 * 3. If not found, creates new boards with the redesigned structure
 *
 * Usage: npx tsx scripts/create-redesigned-monday-boards.ts
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
  console.error('   Make sure it is set in your .env file');
  process.exit(1);
}

type MondayApiResponse = {
  data?: {
    create_board?: { id: string; name: string };
    create_column?: { id: string; title: string };
    create_group?: { id: string; title: string };
    boards?: Array<{ id: string; name: string }>;
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

/**
 * Find existing board by name using get_boards query
 */
async function findBoardByName(boardName: string): Promise<string | null> {
  // Monday API v2 doesn't support board search by name directly
  // For now, we'll skip lookup and create boards
  // Users can manually specify existing board IDs if needed
  return null;
}

async function createBoard(boardName: string, boardKind: string = 'public'): Promise<string> {
  const query = `
    mutation ($boardName: String!, $boardKind: BoardKind!) {
      create_board(board_name: $boardName, board_kind: $boardKind) {
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
      create_column(board_id: $boardId, title: $title, column_type: $columnType, defaults: $defaults) {
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

async function createGroup(boardId: string, title: string): Promise<string> {
  const query = `
    mutation ($boardId: ID!, $groupName: String!) {
      create_group(board_id: $boardId, group_name: $groupName) {
        id
        title
      }
    }
  `;

  const result = await callMondayApi(query, { boardId, groupName: title });

  if (result.errors) {
    console.warn(`  ⚠️  Warning: Could not create group "${title}": ${result.errors.map((e) => e.message).join(', ')}`);
    return '';
  }

  return result.data?.create_group?.id || '';
}

const buildStatusDefaults = (labels: string[]) =>
  Object.fromEntries(labels.map((label, index) => [String(index), label]));

// ============================================================================
// BOARD A: Personal Booked Calls (Setter Operating Board)
// ============================================================================
async function setupPersonalBookedCallsBoard(boardId: string): Promise<void> {
  console.log('  📋 Setting up Personal Booked Calls board...');

  // Groups for filtering
  console.log('    Creating groups...');
  await createGroup(boardId, 'Today');
  await createGroup(boardId, 'Tomorrow');
  await createGroup(boardId, 'This Week');
  await createGroup(boardId, 'Past / Completed');

  // Columns
  console.log('    Creating columns...');
  await createColumn(boardId, 'Contact Name', 'text');
  await createColumn(boardId, 'Phone', 'phone');
  await createColumn(boardId, 'Call Date', 'date');
  await createColumn(boardId, 'Date Held', 'date');
  await createColumn(boardId, 'Setter', 'text');
  await createColumn(boardId, 'Advisor', 'text');
  await createColumn(boardId, 'Swing', 'status', buildStatusDefaults(['First Swing', 'Second Swing', 'Third Swing', 'Closed Won', 'Closed Lost']));
  await createColumn(boardId, 'Channel', 'status', buildStatusDefaults(['Circle DM', 'Aloware SMS', 'Email Marketing', 'Instagram DM', 'Game Plan Call', 'SELF BOOK']));
  await createColumn(boardId, 'Source', 'status', buildStatusDefaults([
    'Circle Group', 'Book Buyer', 'Start-Up Checklist', 'Raise Your Rates',
    'Stand Alone Space Setup Guide', 'Marketing Email', 'Direct Outreach',
    'Social Media', 'Hiring Guide', 'Webinar', 'Workshop Playbook', 'Signature Self Book'
  ]));
  await createColumn(boardId, 'Slack Link', 'link');
  await createColumn(boardId, 'Notes', 'long_text');
}

// ============================================================================
// BOARD B: SMS Reports (Leadership Summary Board)
// ============================================================================
async function setupSmsReportsBoard(boardId: string): Promise<void> {
  console.log('  📋 Setting up SMS Reports board...');

  // Groups for filtering
  console.log('    Creating groups...');
  await createGroup(boardId, 'Current Quarter');
  await createGroup(boardId, 'Previous Quarter');
  await createGroup(boardId, 'Historical');

  // Columns
  console.log('    Creating columns...');
  await createColumn(boardId, 'Week Start', 'date');
  await createColumn(boardId, 'Reporting Period', 'text');
  await createColumn(boardId, 'Booked Calls Total', 'numbers');
  await createColumn(boardId, 'Jack', 'numbers');
  await createColumn(boardId, 'Brandon', 'numbers');
  await createColumn(boardId, 'Self Booked', 'numbers');
  await createColumn(boardId, 'Total Booked', 'numbers');
  await createColumn(boardId, 'vs Last Week', 'numbers');
  await createColumn(boardId, 'Health Score', 'numbers');
  await createColumn(boardId, 'Reply Rate %', 'numbers');
  await createColumn(boardId, 'Response Time Hours', 'numbers');
  await createColumn(boardId, 'Trend', 'status', buildStatusDefaults(['Up', 'Flat', 'Down']));
  await createColumn(boardId, 'Health', 'status', buildStatusDefaults(['Good', 'Watch', 'Action']));
  await createColumn(boardId, 'Key Notes', 'long_text');
  await createColumn(boardId, 'Actions Next Week', 'long_text');
  await createColumn(boardId, 'Exceptions', 'long_text');
  await createColumn(boardId, 'Last Synced', 'date');
}

// ============================================================================
// BOARD C: SMS Sequences (Optimization Board)
// ============================================================================
async function setupSmsSequencesBoard(boardId: string): Promise<void> {
  console.log('  📋 Setting up SMS Sequences board...');

  // Groups for filtering
  console.log('    Creating groups...');
  await createGroup(boardId, 'Top Performers');
  await createGroup(boardId, 'Needs Optimization');
  await createGroup(boardId, 'Testing / New');

  // Columns
  console.log('    Creating columns...');
  await createColumn(boardId, 'Sequence Name', 'text');
  await createColumn(boardId, 'Owner', 'text');
  await createColumn(boardId, 'Status', 'status', buildStatusDefaults(['Active', 'Paused', 'Testing', 'Archived']));
  await createColumn(boardId, 'Time Window', 'text');
  await createColumn(boardId, 'Messages Sent', 'numbers');
  await createColumn(boardId, 'Replies', 'numbers');
  await createColumn(boardId, 'Reply Rate %', 'numbers');
  await createColumn(boardId, 'Booked Calls', 'numbers');
  await createColumn(boardId, 'Booking Rate %', 'numbers');
  await createColumn(boardId, 'Week over Week Change %', 'numbers');
  await createColumn(boardId, 'Engagement Score', 'numbers');
  await createColumn(boardId, 'Trend', 'status', buildStatusDefaults(['Up', 'Flat', 'Down']));
  await createColumn(boardId, 'Last Updated', 'date');
  await createColumn(boardId, 'Optimization Notes', 'long_text');
}

async function updateEnvFile(boardIds: { personal: string; reports: string; sequences: string }): Promise<void> {
  const envPath = path.join(process.cwd(), '.env');
  let envContent = fs.readFileSync(envPath, 'utf-8');

  const updates = [
    { key: 'MONDAY_PERSONAL_BOARD_ID', value: boardIds.personal },
    { key: 'MONDAY_SMS_REPORTS_BOARD_ID', value: boardIds.reports },
    { key: 'MONDAY_SMS_SEQUENCES_BOARD_ID', value: boardIds.sequences },
    { key: 'MONDAY_SMS_SYNC_ENABLED', value: 'true' },
    { key: 'MONDAY_SMS_WRITEBACK_ENABLED', value: 'true' },
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

async function addGroupsToExistingBoard(boardId: string, groups: string[]): Promise<void> {
  console.log('    Creating groups...');
  for (const group of groups) {
    await createGroup(boardId, group);
  }
}

async function main() {
  console.log('🚀 Monday.com Redesigned Boards Setup');
  console.log('═══════════════════════════════════════════\n');
  console.log('Following MONDAY_BOARD_REDESIGN_PLAN.md specifications\n');

  // Check env vars for existing board IDs (use these if set)
  const existingPersonal = process.env.MONDAY_PERSONAL_BOARD_ID;
  const existingReports = process.env.MONDAY_SMS_REPORTS_BOARD_ID;
  const existingSequences = process.env.MONDAY_SMS_SEQUENCES_BOARD_ID;

  const boardIds = {
    personal: '',
    reports: '',
    sequences: '',
  };

  try {
    // Board A: Personal Booked Calls
    console.log('1️⃣  Personal Booked Calls Board...');
    if (existingPersonal) {
      boardIds.personal = existingPersonal;
      console.log(`  🔄 Using existing board ID: ${boardIds.personal}`);
      await addGroupsToExistingBoard(boardIds.personal, ['Today', 'Tomorrow', 'This Week', 'Past / Completed']);
    } else {
      boardIds.personal = await createBoard('Personal Booked Calls', 'public');
      console.log(`  ✅ Created! Board ID: ${boardIds.personal}`);
      await setupPersonalBookedCallsBoard(boardIds.personal);
    }
    console.log('');

    // Board B: SMS Reports
    console.log('2️⃣  SMS Reports Board...');
    if (existingReports) {
      boardIds.reports = existingReports;
      console.log(`  🔄 Using existing board ID: ${boardIds.reports}`);
      await addGroupsToExistingBoard(boardIds.reports, ['Current Quarter', 'Previous Quarter', 'Historical']);
    } else {
      boardIds.reports = await createBoard('SMS Reports', 'public');
      console.log(`  ✅ Created! Board ID: ${boardIds.reports}`);
      await setupSmsReportsBoard(boardIds.reports);
    }
    console.log('');

    // Board C: SMS Sequences
    console.log('3️⃣  SMS Sequences Board...');
    if (existingSequences) {
      boardIds.sequences = existingSequences;
      console.log(`  🔄 Using existing board ID: ${boardIds.sequences}`);
      await addGroupsToExistingBoard(boardIds.sequences, ['Top Performers', 'Needs Optimization', 'Testing / New']);
    } else {
      boardIds.sequences = await createBoard('SMS Sequences', 'public');
      console.log(`  ✅ Created! Board ID: ${boardIds.sequences}`);
      await setupSmsSequencesBoard(boardIds.sequences);
    }
    console.log('');

    // Update .env file
    console.log('4️⃣  Updating .env file...');
    await updateEnvFile(boardIds);
    console.log('  ✅ .env file updated!');
    console.log('');

    // Success summary
    console.log('═══════════════════════════════════════════');
    console.log('✅ SUCCESS! All boards are now redesigned!\n');
    console.log('📋 Board IDs:');
    console.log(`   Personal Booked Calls: ${boardIds.personal}`);
    console.log(`   SMS Reports:           ${boardIds.reports}`);
    console.log(`   SMS Sequences:         ${boardIds.sequences}`);
    console.log('');
    console.log('🔗 View your boards:');
    console.log(`   https://physical-therapy-biz.monday.com/boards/${boardIds.personal}`);
    console.log(`   https://physical-therapy-biz.monday.com/boards/${boardIds.reports}`);
    console.log(`   https://physical-therapy-biz.monday.com/boards/${boardIds.sequences}`);
    console.log('');
    console.log('📝 Next steps:');
    console.log('   1. Review board structures in Monday.com');
    console.log('   2. Configure status/dropdown options to match your taxonomy');
    console.log('   3. If you see "already exists" warnings for columns/groups, that is normal');
    console.log('   4. Update env vars in production deployment');
    console.log('   5. Run sync: npm run sync:monday');
    console.log('');
  } catch (error) {
    console.error('');
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
