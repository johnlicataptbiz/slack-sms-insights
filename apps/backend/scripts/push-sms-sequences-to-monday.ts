#!/usr/bin/env tsx
/**
 * Push SMS sequence performance to Monday.com board.
 * Fixed: getPrisma() → getPrismaClient(), sequenceRegistry camelCase, proper typing.
 *
 * Phase 1 optimization: Structured summaries instead of raw text dumps.
 */

import { findColumnIdByTitle, mondaySmsBoardSchemas } from '../services/monday-board-schemas.js';
import { queryBoardColumns, upsertBookedCallItem, truncateLongText } from '../services/monday-client.js';
import { getPrismaClient } from '../services/prisma.js';
import type { Prisma } from '@prisma/client';

const BOARD_ID = process.env.MONDAY_SMS_SEQUENCES_BOARD_ID || '18404367764';

interface SequenceMetrics {
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
}

const formatOwner = (value: string | null): string => {
  const trimmed = (value || '').trim();
  return trimmed || 'Unassigned';
};

const trendLabel = (replyRatePct: number, bookingRatePct: number): 'Up' | 'Flat' | 'Down' => {
  if (bookingRatePct >= 5 || replyRatePct >= 18) return 'Up';
  if (bookingRatePct >= 1 || replyRatePct >= 8) return 'Flat';
  return 'Down';
};

/**
 * Build structured optimization notes with actionable formatting.
 * Phase 1 change: Replaces raw metadata dumps with bullet-point format.
 */
const buildNotes = (sequence: SequenceMetrics): string => {
  const bulletPoints = [
    `• Owner: ${formatOwner(sequence.owner_rep)}`,
    sequence.lead_magnet ? `• Lead magnet: ${sequence.lead_magnet}` : null,
    sequence.version_tag ? `• Version: ${sequence.version_tag}` : null,
    `• Updated: ${sequence.updated_at.toISOString().slice(0, 10)}`,
    `• Messages: ${sequence.messages_sent.toLocaleString()}`,
    `• Replies: ${sequence.replies_received.toLocaleString()} (${sequence.reply_rate_pct.toFixed(1)}%)`,
    `• Booked: ${sequence.booked_calls} (${sequence.booking_rate_pct.toFixed(1)}%)`,
    `• Trend: ${sequence.trend}`,
  ].filter(Boolean);

  // Add actionable recommendation based on metrics
  if (sequence.reply_rate_pct < 8 && sequence.messages_sent > 50) {
    bulletPoints.push('⚠️ Low reply rate — review opener copy');
  } else if (sequence.booking_rate_pct < 1 && sequence.replies_received > 10) {
    bulletPoints.push('⚠️ Low booking rate — improve CTA or follow-up');
  } else if (sequence.trend === 'Down') {
    bulletPoints.push('⚠️ Declining performance — consider A/B testing');
  } else if (sequence.trend === 'Up' && sequence.booking_rate_pct >= 5) {
    bulletPoints.push('✓ Strong performer — consider scaling volume');
  }

  return truncateLongText(bulletPoints.join('\n'), 500);
};

/**
 * Build item name: clean sequence name without metadata clutter.
 */
const buildItemName = (sequence: SequenceMetrics): string => {
  const label = sequence.label || sequence.normalized_label || `Sequence ${sequence.sequence_id}`;
  // Add brief status indicator to item name for quick scanning
  const statusIcon = sequence.status === 'active' ? '' : ' [paused]';
  return `${label}${statusIcon}`;
};

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
  if (columnsById.lastUpdated)
    values[columnsById.lastUpdated] = { date: sequence.updated_at.toISOString().slice(0, 10) };
  if (columnsById.notes) values[columnsById.notes] = buildNotes(sequence);
  // Computed metrics
  if (columnsById.wowChange) values[columnsById.wowChange] = 0; // TODO: Calculate week-over-week
  if (columnsById.engagement) {
    const score = Math.round(
      Math.min(sequence.reply_rate_pct / 20, 1) * 50 +
      Math.min(sequence.booking_rate_pct / 5, 1) * 50
    );
    values[columnsById.engagement] = score;
  }
  return values;
};

async function getColumnIds(): Promise<Record<string, string | null>> {
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
    wowChange: findColumnIdByTitle(columns, ['Week over Week Change %', 'WoW Change %']),
    engagement: findColumnIdByTitle(columns, ['Engagement Score', 'Engagement']),
  };
}

async function main(): Promise<void> {
  console.log('🚀 Pushing SMS sequence performance to Monday.com');
  console.log(`📱 Board ID: ${BOARD_ID}`);
  console.log(`🧱 Schema: ${mondaySmsBoardSchemas.sequences.boardName}`);
  console.log('');

  const prisma = getPrismaClient();

  try {
    console.log('📋 Fetching board columns...');
    const columnIds = await getColumnIds();
    console.log('✅ Column mapping complete');
    console.log('');

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    console.log('📊 Aggregating sequence performance from fact tables...');
    const [sequences, smsFacts, bookingFacts] = await Promise.all([
      prisma.sequenceRegistry.findMany({ 
        orderBy: { updated_at: 'desc' }, 
        take: 50 
      }),
      prisma.factSmsDaily.findMany({ 
        where: { day: { gte: cutoff } } 
      }),
      prisma.factBookingDaily.findMany({ 
        where: { day: { gte: cutoff } } 
      }),
    ]);

    const smsBySequence = new Map<string, {
      messagesSent: number;
      repliesReceived: number;
      updatedAt: Date;
    }>();
    for (const row of smsFacts) {
      const current = smsBySequence.get(row.sequence_id) || {
        messagesSent: 0,
        repliesReceived: 0,
        updatedAt: row.updated_at,
      };
      current.messagesSent += row.messages_sent;
      current.repliesReceived += row.replies_received;
      if (row.updated_at > current.updatedAt) current.updatedAt = row.updated_at;
      smsBySequence.set(row.sequence_id, current);
    }

    const bookingsBySequence = new Map<string, {
      bookedCalls: number;
      updatedAt: Date;
    }>();
    for (const row of bookingFacts) {
      const current = bookingsBySequence.get(row.sequence_id) || { 
        bookedCalls: 0, 
        updatedAt: row.updated_at 
      };
      current.bookedCalls += row.booked_total;
      if (row.updated_at > current.updatedAt) current.updatedAt = row.updated_at;
      bookingsBySequence.set(row.sequence_id, current);
    }

    const summaries: SequenceMetrics[] = sequences.map((sequence) => {
      const sms = smsBySequence.get(sequence.id) || {
        messagesSent: 0,
        repliesReceived: 0,
        updatedAt: sequence.updated_at,
      };
      const bookings = bookingsBySequence.get(sequence.id) || { 
        bookedCalls: 0, 
        updatedAt: sequence.updated_at 
      };
      const messagesSent = sms.messagesSent;
      const repliesReceived = sms.repliesReceived;
      const bookedCalls = bookings.bookedCalls;
      const replyRatePct = messagesSent > 0 ? (repliesReceived / messagesSent) * 100 : 0;
      const bookingRatePct = messagesSent > 0 ? (bookedCalls / messagesSent) * 100 : 0;

      return {
        sequence_id: sequence.id,
        label: sequence.label,
        normalized_label: sequence.normalized_label,
        status: sequence.status as 'active' | 'inactive',
        owner_rep: sequence.owner_rep,
        lead_magnet: sequence.lead_magnet || null,
        version_tag: sequence.version_tag || null,
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

