#!/usr/bin/env tsx
/**
 * Push SMS Events to Monday.com
 * 
 * This script pushes SMS events from the database to Monday.com
 */

import { getPrisma } from '../services/prisma.js';

const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;
const BOARD_ID = process.env.MONDAY_SMS_EVENTS_BOARD_ID || '18404367751';

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

async function createSmsEventItem(event: any, columnIds: any) {
  const itemName = `${event.direction.toUpperCase()}: ${event.contact_name || event.contact_phone || 'Unknown'} - ${event.event_ts.toISOString().substring(0, 10)}`;
  
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
  
  // Add column values based on what we have
  if (columnIds.eventType) {
    columnValues[columnIds.eventType] = { label: event.direction === 'inbound' ? 'Inbound' : 'Outbound' };
  }
  if (columnIds.phone && event.contact_phone) {
    columnValues[columnIds.phone] = { phone: event.contact_phone, countryShortName: 'US' };
  }
  if (columnIds.contactName && event.contact_name) {
    columnValues[columnIds.contactName] = event.contact_name;
  }
  if (columnIds.message && event.body) {
    columnValues[columnIds.message] = { text: event.body };
  }
  if (columnIds.timestamp) {
    columnValues[columnIds.timestamp] = { date: event.event_ts.toISOString().substring(0, 10) };
  }
  if (columnIds.rep && event.aloware_user) {
    columnValues[columnIds.rep] = event.aloware_user;
  }
  if (columnIds.slackThread) {
    const link = `https://slack.com/archives/${event.slack_channel_id}/p${event.slack_message_ts.replace('.', '')}`;
    columnValues[columnIds.slackThread] = { url: link, text: 'View in Slack' };
  }
  if (columnIds.conversationId && event.conversation_id) {
    columnValues[columnIds.conversationId] = event.conversation_id;
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
    eventType: findColumn('event type') || findColumn('type'),
    phone: findColumn('phone'),
    contactName: findColumn('contact name') || findColumn('name'),
    message: findColumn('message'),
    timestamp: findColumn('timestamp') || findColumn('date'),
    rep: findColumn('rep') || findColumn('setter'),
    slackThread: findColumn('slack'),
    conversationId: findColumn('conversation'),
  };
}

async function main() {
  console.log('🚀 Pushing SMS Events to Monday.com');
  console.log(`📱 Board ID: ${BOARD_ID}\n`);

  const prisma = getPrisma();

  try {
    // Get column IDs
    console.log('📋 Fetching board columns...');
    const columnIds = await getColumnIds();
    console.log('✅ Column mapping:', columnIds);
    console.log('');

    // Get recent SMS events (last 30 days, limit 50 for safety)
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    console.log('📊 Fetching SMS events from database...');
    const events = await prisma.sms_events.findMany({
      where: {
        event_ts: { gte: cutoff },
      },
      orderBy: { event_ts: 'desc' },
      take: 50,
    });

    console.log(`✅ Found ${events.length} events to sync\n`);

    if (events.length === 0) {
      console.log('✅ No events to sync');
      return;
    }

    // Push each event
    let synced = 0;
    let failed = 0;

    for (const event of events) {
      try {
        await createSmsEventItem(event, columnIds);
        console.log(`  ✓ Synced: ${event.contact_name || event.contact_phone || 'Unknown'}`);
        synced++;
        
        // Wait 1 second between items to avoid rate limiting
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
