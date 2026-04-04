#!/usr/bin/env tsx
/**
 * Backfill Personal Booked Calls board from database
 *
 * Usage: npx tsx scripts/backfill-personal-board.ts [--dry-run] [--days 90]
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
const DATABASE_URL = process.env.DATABASE_URL;
const dryRun = process.argv.includes('--dry-run');

// Get days from command line
const daysArg = process.argv.find((arg) => arg.startsWith('--days='));
const daysBack = daysArg ? Number.parseInt(daysArg.split('=')[1], 10) : 7; // Default: last 7 days

if (!MONDAY_API_TOKEN) {
  console.error('❌ Error: MONDAY_API_TOKEN environment variable is required');
  process.exit(1);
}

if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL environment variable is required');
  process.exit(1);
}

// Board ID
const PERSONAL_BOARD_ID = process.env.MONDAY_PERSONAL_BOARD_ID || '18404975822';

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

interface Column {
  id: string;
  title: string;
  type: string;
}

interface BookedCall {
  id: string;
  slack_message_ts: string;
  event_ts: Date;
  text: string | null;
  raw: unknown;
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
  return result.data?.boards?.[0]?.columns || [];
}

async function queryBookedCallsFromDatabase(): Promise<BookedCall[]> {
  // Use existing prisma singleton
  const { getPrisma } = await import('../services/prisma.js');
  const prisma = getPrisma();

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);

  const calls = await prisma.booked_calls.findMany({
    where: {
      event_ts: {
        gte: cutoffDate,
      },
    },
    select: {
      id: true,
      slack_message_ts: true,
      event_ts: true,
      text: true,
      raw: true,
    },
    orderBy: { event_ts: 'desc' },
    take: 500,
  });

  return calls;
}

async function createItem(boardId: string, itemName: string): Promise<string | null> {
  if (dryRun) {
    console.log(`    [DRY RUN] Would create: ${itemName}`);
    return 'dry-run-id';
  }

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

async function main() {
  console.log('🚀 Backfill Personal Booked Calls Board');
  console.log('═══════════════════════════════════════════════\n');

  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  try {
    // Get columns from board
    const columns = await getBoardColumns(PERSONAL_BOARD_ID);
    console.log(`📋 Board columns: ${columns.map((c) => c.title).join(', ')}\n`);

    // Find column IDs
    const contactCol = columns.find((c) => c.title === 'Contact Name');
    const phoneCol = columns.find((c) => c.title === 'Phone');
    const callDateCol = columns.find((c) => c.title === 'Call Date');
    const setterCol = columns.find((c) => c.title === 'Setter');
    const advisorCol = columns.find((c) => c.title === 'Advisor');
    const sourceCol = columns.find((c) => c.title === 'Source');
    const slackCol = columns.find((c) => c.title === 'Slack Link');

    // Query booked calls from database
    console.log(`📊 Querying booked_calls from database (last ${daysBack} days)...`);
    const bookedCalls = await queryBookedCallsFromDatabase();
    console.log(`   Found ${bookedCalls.length} booked calls\n`);

    let created = 0;
    let failed = 0;

    for (const call of bookedCalls) {
      // Extract contact info from raw data if available
      const raw = call.raw as {
        contact_name?: string;
        contact_phone?: string;
        setter?: string;
        source?: string;
      } | null;

      // Format item name from date
      const eventDate = new Date(call.event_ts);
      const itemName = `Call - ${eventDate.toISOString().slice(0, 10)}`;

      // Build column values
      const columnValues: Record<string, unknown> = {};

      if (callDateCol && call.event_ts) {
        const dateStr = call.event_ts.toISOString().slice(0, 10);
        columnValues[callDateCol.id] = { date: dateStr };
      }

      if (contactCol && raw?.contact_name) {
        columnValues[contactCol.id] = raw.contact_name;
      }

      if (phoneCol && raw?.contact_phone) {
        columnValues[phoneCol.id] = raw.contact_phone;
      }

      if (setterCol && raw?.setter) {
        columnValues[setterCol.id] = raw.setter;
      }

      if (sourceCol && raw?.source) {
        columnValues[sourceCol.id] = raw.source;
      }

      if (slackCol && call.slack_message_ts) {
        columnValues[slackCol.id] = {
          url: `https://slack.com/archives/CHANNEL/p${call.slack_message_ts.replace('.', '')}`,
          text: 'View in Slack',
        };
      }

      // Create item
      const itemId = await createItem(PERSONAL_BOARD_ID, itemName);

      if (itemId) {
        // Patch columns
        await patchItemColumns(PERSONAL_BOARD_ID, itemId, columnValues);
        created++;

        if (created % 10 === 0) {
          console.log(`   Progress: ${created}/${bookedCalls.length} items created`);
        }
      } else {
        failed++;
      }
    }

    console.log('\n═══════════════════════════════════════════════');
    console.log(`✅ Complete! Created ${created} items${failed > 0 ? `, ${failed} failed` : ''}`);
    console.log(`\n🔗 View board: https://physical-therapy-biz.monday.com/boards/${PERSONAL_BOARD_ID}`);
    console.log('');
  } catch (error) {
    console.error('\n❌ Error:', error);
    process.exit(1);
  }
}

main();
