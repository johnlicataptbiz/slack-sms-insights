#!/usr/bin/env node
/**
 * Slack SMS Backfill Script
 * 
 * Fetches historical SMS messages from the Aloware Slack channel and ingests
 * them into the database. This backfills the gap caused by the bot filter
 * that was blocking Aloware bot messages.
 * 
 * Usage: npx tsx scripts/backfill-slack-sms.ts
 * 
 * Environment:
 *   SLACK_BOT_TOKEN - Slack bot token with channels:history scope
 *   ALOWARE_CHANNEL_ID - Slack channel ID where Aloware posts SMS logs
 *   BACKFILL_DAYS - Number of days to look back (default: 90)
 */

import 'dotenv/config';
import { WebClient } from '@slack/web-api';
import { parseAlowareMessage, extractAttachmentField } from '../services/aloware-parser.js';
import { insertSmsEvent } from '../services/sms-event-store.js';
import { upsertConversationFromEvent } from '../services/conversation-projector.js';
import { upsertInboxContactProfile } from '../services/inbox-contact-profiles.js';

const getSlackToken = (): string => {
  return (process.env.SLACK_BOT_TOKEN || '').trim();
};

const getChannelId = (): string => {
  return (process.env.ALOWARE_CHANNEL_ID || 'C09ULGH1BEC').trim();
};

const getBackfillDays = (): number => {
  return Number.parseInt(process.env.BACKFILL_DAYS || '90', 10);
};

const slack = new WebClient(getSlackToken());

type BackfillStats = {
  total: number;
  ingested: number;
  skipped: number;
  errors: number;
  oldestProcessed: string | null;
};

const fetchChannelMessages = async (
  channelId: string,
  oldest: string,
  latest: string,
  cursor?: string,
): Promise<{ messages: any[]; nextCursor?: string }> => {
  const result = await slack.conversations.history({
    channel: channelId,
    oldest,
    latest,
    limit: 100,
    cursor,
  });

  return {
    messages: result.messages || [],
    nextCursor: (result.response_metadata?.next_cursor) || undefined,
  };
};

const processMessage = async (
  message: any,
  stats: BackfillStats,
): Promise<void> => {
  stats.total += 1;

  // Only skip non-Aloware bot messages. All other messages from the channel
  // are processed — the parser handles direction/contact validation.
  const botId = message.bot_id;
  if (botId && botId !== 'B09U5588XU1') {
    stats.skipped += 1;
    return;
  }

  const text = message.text || '';
  const attachments = message.attachments as any[] | undefined;

  // Parse the message
  const parsed = parseAlowareMessage(text, attachments);

  // If parser can't determine direction, try to infer from context
  let direction = parsed.direction;
  if (direction === 'unknown') {
    // Aloware messages in Slack always have attachments with titles like
    // "X has sent an SMS" or "X has received an SMS" — check attachment titles
    const title = attachments?.[0]?.title || '';
    if (/\bsent\b/i.test(title)) direction = 'outbound';
    else if (/\breceived\b/i.test(title)) direction = 'inbound';
  }

  // Skip only if we truly can't determine direction AND have no contact info
  if (direction === 'unknown' && !parsed.contactId && !parsed.contactPhone) {
    stats.skipped += 1;
    return;
  }

  const messageTs = message.ts || '';
  if (!messageTs) {
    stats.skipped += 1;
    return;
  }

  const eventTs = new Date(Number.parseFloat(messageTs) * 1000);

  try {
    const eventRow = await insertSmsEvent(
      {
        slackTeamId: message.team || 'unknown',
        slackChannelId: getChannelId(),
        slackMessageTs: messageTs,
        eventTs,
        direction: direction || 'unknown',
        contactId: parsed.contactId || null,
        contactPhone: parsed.contactPhone || null,
        contactName: parsed.contactName || null,
        alowareUser: parsed.user || null,
        body: parsed.body || null,
        line: parsed.line || null,
        sequence: parsed.sequence || null,
        raw: { text, attachments },
      },
      console,
    );

    if (!eventRow) {
      stats.skipped += 1;
      return;
    }

    stats.ingested += 1;

    // Project conversation
    const conversation = await upsertConversationFromEvent(eventRow, console);
    if (!conversation) return;

    // Upsert contact profile
    await upsertInboxContactProfile(
      {
        contactKey: conversation.contact_key,
        conversationId: conversation.id,
        contactId: eventRow.contact_id,
        name: eventRow.contact_name,
        phone: eventRow.contact_phone,
      },
      console,
    );
  } catch (error) {
    stats.errors += 1;
    console.error(`Error processing message ${messageTs}:`, error);
  }
};

const backfill = async (): Promise<BackfillStats> => {
  const token = getSlackToken();
  if (!token) {
    console.error('SLACK_BOT_TOKEN not set');
    process.exit(1);
  }

  const channelId = getChannelId();
  const days = getBackfillDays();
  const now = Date.now();
  const oldestTs = String((now - days * 24 * 60 * 60 * 1000) / 1000);
  const latestTs = String(now / 1000);

  console.log(`Starting backfill: channel=${channelId}, days=${days}`);
  console.log(`Time range: ${oldestTs} to ${latestTs}`);

  const stats: BackfillStats = {
    total: 0,
    ingested: 0,
    skipped: 0,
    errors: 0,
    oldestProcessed: null,
  };

  let cursor: string | undefined;
  let pageCount = 0;

  do {
    const { messages, nextCursor } = await fetchChannelMessages(
      channelId,
      oldestTs,
      latestTs,
      cursor,
    );

    pageCount += 1;

    for (const message of messages) {
      await processMessage(message, stats);
      if (message.ts) {
        stats.oldestProcessed = message.ts;
      }
    }

    cursor = nextCursor;

    if (pageCount % 10 === 0) {
      console.log(`Progress: page ${pageCount}, ingested=${stats.ingested}, skipped=${stats.skipped}, errors=${stats.errors}`);
    }

    // Small delay to avoid rate limiting
    await new Promise((resolve) => setTimeout(resolve, 500));
  } while (cursor);

  return stats;
};

// Run
backfill()
  .then((stats) => {
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  Backfill Complete');
    console.log('═══════════════════════════════════════════════════════\n');
    console.log(`Total messages scanned: ${stats.total}`);
    console.log(`Ingested: ${stats.ingested}`);
    console.log(`Skipped: ${stats.skipped}`);
    console.log(`Errors: ${stats.errors}`);
    console.log(`Pages fetched: ${stats.total > 0 ? 'multiple' : 0}`);
    console.log('\n');
  })
  .catch((error) => {
    console.error('Backfill failed:', error);
    process.exit(1);
  });
