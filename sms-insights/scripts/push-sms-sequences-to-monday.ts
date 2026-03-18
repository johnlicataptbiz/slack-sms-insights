#!/usr/bin/env tsx
/**
 * Push SMS Sequences to Monday.com
 */

import { getPrisma } from '../services/prisma.js';

const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;
const BOARD_ID = process.env.MONDAY_SMS_SEQUENCES_BOARD_ID || '18404367764';

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

async function createSequenceItem(sequence: any, columnIds: any) {
  const itemName = sequence.label || `Sequence ${sequence.id}`;
  
  const query = `
    mutation ($boardId: ID!, $itemName: String!, $columnValues: JSON!) {
      create_item (
        board_id: $boardId,
        item_name: $itemName,
        column_values: $columnValues
      ) {
        id
      }
    }
  `;

  const columnValues: Record<string, any> = {};
  
  if (columnIds.sequenceName) {
    columnValues[columnIds.sequenceName] = sequence.label || sequence.normalized_label;
  }
  if (columnIds.status) {
    const statusLabel = sequence.status === 'active' ? 'Active' : sequence.status === 'inactive' ? 'Paused' : 'Draft';
    columnValues[columnIds.status] = { label: statusLabel };
  }
  if (columnIds.leadMagnet && sequence.lead_magnet) {
    columnValues[columnIds.leadMagnet] = sequence.lead_magnet;
  }
  if (columnIds.owner && sequence.owner_rep) {
    columnValues[columnIds.owner] = sequence.owner_rep;
  }
  if (columnIds.startDate) {
    columnValues[columnIds.startDate] = { date: sequence.created_at.toISOString().substring(0, 10) };
  }

  await callMondayApi(query, {
    boardId: BOARD_ID,
    itemName,
    columnValues: JSON.stringify(columnValues),
  });
}

async function getColumnIds() {
  const query = `
    query ($boardId: [ID!]) {
      boards (ids: $boardId) {
        columns {
          id
          title
          type
        }
      }
    }
  `;

  const result = await callMondayApi(query, { boardId: [BOARD_ID] });
  const columns = result.data?.boards?.[0]?.columns || [];
  
  const findColumn = (title: string) => columns.find((c: any) => c.title.toLowerCase().includes(title.toLowerCase()))?.id;
  
  return {
    sequenceName: findColumn('sequence name') || findColumn('name'),
    status: findColumn('status'),
    leadMagnet: findColumn('lead magnet'),
    owner: findColumn('owner'),
    startDate: findColumn('start date'),
  };
}

async function main() {
  console.log('🚀 Pushing SMS Sequences to Monday.com');
  console.log(`📱 Board ID: ${BOARD_ID}\n`);

  const prisma = getPrisma();

  try {
    console.log('📋 Fetching board columns...');
    const columnIds = await getColumnIds();
    console.log('✅ Column mapping:', columnIds);
    console.log('');

    console.log('📊 Fetching sequences from database...');
    const sequences = await prisma.sequence_registry.findMany({
      orderBy: { created_at: 'desc' },
      take: 30,
    });

    console.log(`✅ Found ${sequences.length} sequences to sync\n`);

    if (sequences.length === 0) {
      console.log('✅ No sequences to sync');
      return;
    }

    let synced = 0;
    let failed = 0;

    for (const sequence of sequences) {
      try {
        await createSequenceItem(sequence, columnIds);
        console.log(`  ✓ Synced: ${sequence.label}`);
        synced++;
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`  ✗ Failed: ${error instanceof Error ? error.message : String(error)}`);
        failed++;
      }
    }

    console.log('');
    console.log('📊 Summary:');
    console.log(`   ✓ Synced: ${synced}`);
    console.log(`   ✗ Failed: ${failed}`);
    console.log('');
    console.log('✅ Backfill completed!');
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
