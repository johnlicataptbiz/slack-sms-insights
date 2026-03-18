#!/usr/bin/env tsx
/**
 * Push SMS Daily Reports to Monday.com
 */

import { getPrisma } from '../services/prisma.js';

const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;
const BOARD_ID = process.env.MONDAY_SMS_REPORTS_BOARD_ID || '18404367781';

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

async function createReportItem(report: any, columnIds: any) {
  const reportDate = report.report_date ? new Date(report.report_date).toISOString().substring(0, 10) : new Date(report.timestamp).toISOString().substring(0, 10);
  const itemName = `Daily Report - ${reportDate} - ${report.channel_name || report.channel_id}`;
  
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
  
  if (columnIds.reportDate) {
    columnValues[columnIds.reportDate] = { date: reportDate };
  }
  if (columnIds.channel && report.channel_name) {
    columnValues[columnIds.channel] = report.channel_name;
  }
  if (columnIds.status) {
    const statusLabel = report.status === 'success' ? 'Success' : report.status === 'error' ? 'Error' : 'Pending';
    columnValues[columnIds.status] = { label: statusLabel };
  }
  if (columnIds.reportType && report.report_type) {
    columnValues[columnIds.reportType] = report.report_type;
  }
  if (columnIds.summary && report.summary_text) {
    columnValues[columnIds.summary] = { text: report.summary_text };
  }
  if (columnIds.duration && report.duration_ms) {
    columnValues[columnIds.duration] = report.duration_ms;
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
    reportDate: findColumn('report date') || findColumn('date'),
    channel: findColumn('channel'),
    status: findColumn('status'),
    reportType: findColumn('report type') || findColumn('type'),
    summary: findColumn('summary'),
    duration: findColumn('duration'),
  };
}

async function main() {
  console.log('🚀 Pushing SMS Daily Reports to Monday.com');
  console.log(`📱 Board ID: ${BOARD_ID}\n`);

  const prisma = getPrisma();

  try {
    console.log('📋 Fetching board columns...');
    const columnIds = await getColumnIds();
    console.log('✅ Column mapping:', columnIds);
    console.log('');

    console.log('📊 Fetching daily reports from database...');
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    
    const reports = await prisma.daily_runs.findMany({
      where: {
        timestamp: { gte: cutoff },
      },
      orderBy: { timestamp: 'desc' },
      take: 50,
    });

    console.log(`✅ Found ${reports.length} reports to sync\n`);

    if (reports.length === 0) {
      console.log('✅ No reports to sync');
      return;
    }

    let synced = 0;
    let failed = 0;

    for (const report of reports) {
      try {
        await createReportItem(report, columnIds);
        const date = report.report_date ? new Date(report.report_date).toISOString().substring(0, 10) : new Date(report.timestamp).toISOString().substring(0, 10);
        console.log(`  ✓ Synced: ${date} - ${report.channel_name || report.channel_id}`);
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
