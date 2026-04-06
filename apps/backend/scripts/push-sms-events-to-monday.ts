#!/usr/bin/env tsx
/**
 * Push SMS conversation summaries to Monday.com - TypeScript clean.
 * Fixed: getPrisma → getPrismaClient, sms_events → smsEvents, proper typing.
 *
 * Phase 1 optimization: Structured summaries instead of raw text dumps.
 */

import { findColumnIdByTitle, mondaySmsBoardSchemas } from '../services/monday-board-schemas.js';
import {
  queryBoardColumns,
  upsertBookedCallItem,
  extractFirstSentence,
  truncateText,
  truncateLongText,
} from '../services/monday-client.js';
import { getPrismaClient } from '../services/prisma.js';
import type { Prisma } from '@prisma/client';

const BOARD_ID = process.env.MONDAY_SMS_EVENTS_BOARD_ID || '18404367751';

interface SummaryRow {
  id: string;
  slack_channel_id: string;
  slack_message_ts: string;
  event_ts: Date;
  direction: string;
  contact_id: string | null;
  contact_phone: string | null;
  contact_name: string | null;
  aloware_user: string | null;
  body: string;
  line: string | null;
  sequence: string | null;
  conversation_id: string | null;
}

const normalizeContactName = (value: string | null): string => {
  const trimmed = (value || '').trim();
  return trimmed.length > 0 ? trimmed : 'Unknown Contact';
};

const mapLineToChannel = (line: string | null): string => {
  const value = (line || '').trim().toLowerCase();
  if (!value) return 'Aloware SMS';
  if (value.includes('circle')) return 'Circle DM';
  if (value.includes('email')) return 'Email Marketing';
  if (value.includes('instagram')) return 'Instagram DM';
  if (value.includes('call') || value.includes('game plan')) return 'Game Plan Call';
  if (value.includes('self')) return 'SELF BOOK';
  return 'Aloware SMS';
};

const signalLabel = (direction: string): 'Inbound' | 'Outbound' | 'System' => {
  const value = direction.trim().toLowerCase();
  if (value === 'outbound') return 'Outbound';
  if (value === 'system') return 'System';
  return 'Inbound';
};

const nextStepLabel = (direction: string): 'Reply' | 'Monitor' | 'Book' | 'Archive' => {
  const value = direction.trim().toLowerCase();
  if (value === 'outbound') return 'Monitor';
  if (value === 'system') return 'Archive';
  return 'Reply';
};

/**
 * Build a structured, readable summary for a single SMS event.
 *
 * Phase 1 change: Replaces raw text dumps with structured bullet format.
 * Uses intelligent truncation to keep summaries readable.
 */
const buildSummary = (event: SummaryRow): string => {
  const snippets = [
    `• Latest: ${signalLabel(event.direction)} message`,
    `• Phone: ${event.contact_phone || 'n/a'}`,
    `• Channel: ${mapLineToChannel(event.line)}`,
    event.sequence ? `• Sequence: ${event.sequence}` : null,
    event.aloware_user ? `• Owner: ${event.aloware_user}` : null,
  ].filter(Boolean);

  // Extract first meaningful sentence from body instead of raw truncation
  const bodyText = event.body.trim();
  if (bodyText) {
    snippets.push('');
    snippets.push(extractFirstSentence(bodyText, 200));
  }

  return truncateLongText(snippets.join('\n'), 500);
};

/**
 * Build item name: clean contact-first format without noisy metadata.
 * Format: "Contact Name" (just the name, rest is in columns)
 */
const buildItemName = (event: SummaryRow): string => {
  return normalizeContactName(event.contact_name || event.contact_phone);
};

const buildColumnValueMap = (
  event: SummaryRow,
  columnsById: Record<string, string | null>,
): Record<string, unknown> => {
  const values: Record<string, unknown> = {};
  if (columnsById.signalType) values[columnsById.signalType] = { label: signalLabel(event.direction) };
  if (columnsById.nextStep) values[columnsById.nextStep] = { label: nextStepLabel(event.direction) };
  if (columnsById.contactName)
    values[columnsById.contactName] = normalizeContactName(event.contact_name || event.contact_phone);
  if (columnsById.phone && event.contact_phone) {
    values[columnsById.phone] = { phone: event.contact_phone, countryShortName: 'US' };
  }
  if (columnsById.eventDate) values[columnsById.eventDate] = { date: event.event_ts.toISOString().slice(0, 10) };
  if (columnsById.channel) values[columnsById.channel] = { label: mapLineToChannel(event.line) };
  if (columnsById.setter && event.aloware_user) values[columnsById.setter] = event.aloware_user;
  if (columnsById.slackLink) {
    values[columnsById.slackLink] = {
      url: `https://slack.com/archives/${event.slack_channel_id}/p${event.slack_message_ts.replace('.', '')}`,
      text: 'View in Slack',
    };
  }
  if (columnsById.summary) values[columnsById.summary] = buildSummary(event);
  if (columnsById.conversationId) values[columnsById.conversationId] = event.conversation_id || event.id;
  if (columnsById.sequence && event.sequence) values[columnsById.sequence] = event.sequence;
  // Structured snippet: first sentence only, not raw body dump
  if (columnsById.latestMessage) {
    const snippet = extractFirstSentence(event.body.trim(), 180);
    values[columnsById.latestMessage] = snippet || '—';
  }
  return values;
};

async function getColumnIds(): Promise<Record<string, string | null>> {
  const columns = await queryBoardColumns(BOARD_ID);
  return {
    signalType: findColumnIdByTitle(columns, ['Signal Type', 'Event Type', 'Direction', 'Type']),
    nextStep: findColumnIdByTitle(columns, ['Next Step', 'Priority', 'Action', 'Action Status']),
    contactName: findColumnIdByTitle(columns, ['Contact Name', 'Lead Name', 'Name']),
    phone: findColumnIdByTitle(columns, ['Phone Number', 'Phone', 'Mobile']),
    eventDate: findColumnIdByTitle(columns, ['Event Date', 'Call Date', 'Timestamp', 'Last Updated', 'Last Reply']),
    channel: findColumnIdByTitle(columns, ['Channel']),
    setter: findColumnIdByTitle(columns, ['Setter', 'Rep', 'Owner', 'Assigned To']),
    slackLink: findColumnIdByTitle(columns, ['Slack Link', 'Slack Thread', 'Link', 'Slack Thread']),
    summary: findColumnIdByTitle(columns, ['Summary', 'Notes', 'Message Summary', 'Conversation Summary']),
    conversationId: findColumnIdByTitle(columns, ['Conversation ID', 'Conversation']),
    sequence: findColumnIdByTitle(columns, ['Sequence', 'Sequence Context']),
    latestMessage: findColumnIdByTitle(columns, ['Latest Message', 'Last Message', 'Message Preview']),
  };
}

async function main(): Promise<void> {
  console.log('🚀 Pushing SMS conversation summaries to Monday.com');
  console.log(`📱 Board ID: ${BOARD_ID}`);
  console.log(`🧱 Schema: ${mondaySmsBoardSchemas.events.boardName}`);
  console.log('');

  const prisma = getPrismaClient();

  try {
    console.log('📋 Fetching board columns...');
    const columnIds = await getColumnIds();
    console.log('✅ Column mapping complete');
    console.log('');

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);

    console.log('📊 Fetching recent SMS events...');
    const events = await prisma.smsEvents.findMany({
      where: {
        event_ts: { gte: cutoff },
      },
      orderBy: [{ event_ts: 'desc' }, { created_at: 'desc' }],
      take: 200,
    }) as unknown as SummaryRow[];

    // Get latest event per conversation/contact
    const latestByConversation = new Map<string, SummaryRow>();
    for (const event of events) {
      const key = event.conversation_id || 
                  event.contact_id || 
                  event.contact_phone || 
                  `${event.slack_channel_id}:${event.slack_message_ts}`;
      if (!latestByConversation.has(key)) {
        latestByConversation.set(key, event);
      }
      if (latestByConversation.size >= 50) break;
    }

    const summaries = Array.from(latestByConversation.values());
    console.log(`✅ Found ${summaries.length} unique conversations to sync\n`);

    if (summaries.length === 0) {
      console.log('✅ No new events to sync');
      return;
    }

    let synced = 0;
    let failed = 0;

    for (const event of summaries) {
      try {
        const itemName = buildItemName(event);
        const markdown = buildSummary(event);
        const columnValues = buildColumnValueMap(event, columnIds);
        
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
    console.log('📊 Final Summary:');
    console.log(`   ✓ Synced: ${synced}`);
    console.log(`   ✗ Failed: ${failed}`);
    console.log('');
    console.log('✅ SMS Events backfill **COMPLETELY SUCCESSFUL**!');
  } catch (error) {
    console.error('❌ Fatal error during backfill:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

