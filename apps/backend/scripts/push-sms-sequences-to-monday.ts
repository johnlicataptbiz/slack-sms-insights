#!/usr/bin/env tsx
/**
 * Push SMS sequence performance to Monday.com.
 *
 * The goal is to keep the board as a KPI dashboard, not a registry export.
 */

import { getPrisma } from '../services/prisma.js';
import { findColumnIdByTitle, mondaySmsBoardSchemas } from '../services/monday-board-schemas.js';
import { queryBoardColumns, upsertBookedCallItem } from '../services/monday-client.js';

const BOARD_ID = process.env.MONDAY_SMS_SEQUENCES_BOARD_ID || '18404367764';

type SequenceMetrics = {
  sequence_id: string;
  label: string;
  normalized_label: string;
  status: 'active' | 'inactive';
  owner_rep: string | null;
  lead_magnet: string | null;
  version_tag: string | null;
  updated_at: Date;
  messages_sent: number;
  replies_received: number;
  booked_calls: number;
  booking_rate_pct: number;
  reply_rate_pct: number;
  trend: 'Up' | 'Flat' | 'Down';
};

const formatOwner = (value: string | null): string => {
  const trimmed = (value || '').trim();
  if (!trimmed) return 'Unassigned';
  return trimmed;
};

const trendLabel = (replyRatePct: number, bookingRatePct: number): 'Up' | 'Flat' | 'Down' => {
  if (bookingRatePct >= 5 || replyRatePct >= 18) return 'Up';
  if (bookingRatePct >= 1 || replyRatePct >= 8) return 'Flat';
  return 'Down';
};

const buildNotes = (sequence: SequenceMetrics): string => {
  const notes = [
    `Owner: ${formatOwner(sequence.owner_rep)}`,
    sequence.lead_magnet ? `Lead magnet: ${sequence.lead_magnet}` : null,
    sequence.version_tag ? `Version: ${sequence.version_tag}` : null,
    `Last updated: ${sequence.updated_at.toISOString().slice(0, 10)}`,
  ].filter(Boolean);
  return notes.join('\n');
};

const buildItemName = (sequence: SequenceMetrics): string => sequence.label || sequence.normalized_label || `Sequence ${sequence.sequence_id}`;

const buildColumnValues = (
  sequence: SequenceMetrics,
  columnsById: Record<string, string | null>,
): Record<string, unknown> => {
  const values: Record<string, unknown> = {};
  if (columnsById.sequenceName) values[columnsById.sequenceName] = sequence.label || sequence.normalized_label;
  if (columnsById.owner) values[columnsById.owner] = formatOwner(sequence.owner_rep);
  if (columnsById.status) values[columnsById.status] = { label: sequence.status === 'active' ? 'Active' : 'Paused' };
  if (columnsById.timeWindow) values[columnsById.timeWindow] = 'Last 30 Days';
  if (columnsById.messagesSent) values[columnsById.messagesSent] = sequence.messages_sent;
  if (columnsById.replies) values[columnsById.replies] = sequence.replies_received;
  if (columnsById.replyRate) values[columnsById.replyRate] = Number(sequence.reply_rate_pct.toFixed(2));
  if (columnsById.bookedCalls) values[columnsById.bookedCalls] = sequence.booked_calls;
  if (columnsById.bookingRate) values[columnsById.bookingRate] = Number(sequence.booking_rate_pct.toFixed(2));
  if (columnsById.trend) values[columnsById.trend] = { label: sequence.trend };
  if (columnsById.lastUpdated) values[columnsById.lastUpdated] = { date: sequence.updated_at.toISOString().slice(0, 10) };
  if (columnsById.notes) values[columnsById.notes] = buildNotes(sequence);
  return values;
};

async function getColumnIds() {
  const columns = await queryBoardColumns(BOARD_ID);
  return {
    sequenceName: findColumnIdByTitle(columns, ['Sequence Name', 'Name']),
    owner: findColumnIdByTitle(columns, ['Owner']),
    status: findColumnIdByTitle(columns, ['Status']),
    timeWindow: findColumnIdByTitle(columns, ['Time Window']),
    messagesSent: findColumnIdByTitle(columns, ['Messages Sent', 'Sends']),
    replies: findColumnIdByTitle(columns, ['Replies', 'Responses']),
    replyRate: findColumnIdByTitle(columns, ['Reply Rate %', 'Reply Rate']),
    bookedCalls: findColumnIdByTitle(columns, ['Booked Calls', 'Bookings']),
    bookingRate: findColumnIdByTitle(columns, ['Booking Rate %', 'Booking Rate']),
    trend: findColumnIdByTitle(columns, ['Trend']),
    lastUpdated: findColumnIdByTitle(columns, ['Last Updated', 'Updated']),
    notes: findColumnIdByTitle(columns, ['Optimization Notes', 'Notes']),
  };
}

async function main() {
  console.log('🚀 Pushing SMS sequence performance to Monday.com');
  console.log(`📱 Board ID: ${BOARD_ID}`);
  console.log(`🧱 Schema: ${mondaySmsBoardSchemas.sequences.boardName}`);
  console.log('');

  const prisma = getPrisma();

  try {
    console.log('📋 Fetching board columns...');
    const columnIds = await getColumnIds();
    console.log('✅ Column mapping:', columnIds);
    console.log('');

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    console.log('📊 Aggregating sequence performance from fact tables...');
    const [sequences, smsFacts, bookingFacts] = await Promise.all([
      prisma.sequence_registry.findMany({ orderBy: { updated_at: 'desc' }, take: 50 }),
      prisma.fact_sms_daily.findMany({ where: { day: { gte: cutoff } } }),
      prisma.fact_booking_daily.findMany({ where: { day: { gte: cutoff } } }),
    ]);

    const smsBySequence = new Map<string, { messagesSent: number; repliesReceived: number; updatedAt: Date }>();
    for (const row of smsFacts) {
      const current = smsBySequence.get(row.sequence_id) || { messagesSent: 0, repliesReceived: 0, updatedAt: row.updated_at };
      current.messagesSent += row.messages_sent;
      current.repliesReceived += row.replies_received;
      if (row.updated_at > current.updatedAt) current.updatedAt = row.updated_at;
      smsBySequence.set(row.sequence_id, current);
    }

    const bookingsBySequence = new Map<string, { bookedCalls: number; updatedAt: Date }>();
    for (const row of bookingFacts) {
      const current = bookingsBySequence.get(row.sequence_id) || { bookedCalls: 0, updatedAt: row.updated_at };
      current.bookedCalls += row.booked_total;
      if (row.updated_at > current.updatedAt) current.updatedAt = row.updated_at;
      bookingsBySequence.set(row.sequence_id, current);
    }

    const summaries: SequenceMetrics[] = sequences.map((sequence) => {
      const sms = smsBySequence.get(sequence.id) || { messagesSent: 0, repliesReceived: 0, updatedAt: sequence.updated_at };
      const bookings = bookingsBySequence.get(sequence.id) || { bookedCalls: 0, updatedAt: sequence.updated_at };
      const messagesSent = sms.messagesSent;
      const repliesReceived = sms.repliesReceived;
      const bookedCalls = bookings.bookedCalls;
      const replyRatePct = messagesSent > 0 ? (repliesReceived / messagesSent) * 100 : 0;
      const bookingRatePct = messagesSent > 0 ? (bookedCalls / messagesSent) * 100 : 0;

      return {
        sequence_id: sequence.id,
        label: sequence.label,
        normalized_label: sequence.normalized_label,
        status: sequence.status,
        owner_rep: sequence.owner_rep,
        lead_magnet: sequence.lead_magnet,
        version_tag: sequence.version_tag,
        updated_at: sms.updatedAt > bookings.updatedAt ? sms.updatedAt : bookings.updatedAt,
        messages_sent: messagesSent,
        replies_received: repliesReceived,
        booked_calls: bookedCalls,
        booking_rate_pct: bookingRatePct,
        reply_rate_pct: replyRatePct,
        trend: trendLabel(replyRatePct, bookingRatePct),
      };
    });

    console.log(`✅ Aggregated ${summaries.length} sequence rows\n`);

    let synced = 0;
    let failed = 0;

    for (const sequence of summaries) {
      try {
        const itemName = buildItemName(sequence);
        const markdown = buildNotes(sequence);
        const columnValues = buildColumnValues(sequence, columnIds);
        await upsertBookedCallItem(
          BOARD_ID,
          {
            itemName,
            updateMarkdown: markdown,
            columnValues,
          },
          {
            info: () => undefined,
            debug: () => undefined,
            warn: () => undefined,
            error: () => undefined,
          },
        );
        console.log(`  ✓ Synced: ${itemName}`);
        synced++;
        await new Promise((resolve) => setTimeout(resolve, 400));
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
    console.log('✅ Sequence backfill completed!');
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
