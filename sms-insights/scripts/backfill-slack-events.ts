import 'dotenv/config';
import { WebClient } from '@slack/web-api';
import { parseAlowareMessage } from '../services/aloware-parser.js';
import { upsertConversationFromEvent } from '../services/conversation-projector.js';
import { closeDatabase, initDatabase } from '../services/db.js';
import { insertSmsEvent } from '../services/sms-event-store.js';
import { resolveNeedsReplyOnOutbound, upsertNeedsReplyWorkItem } from '../services/work-item-engine.js';

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;
const CHANNEL_ID = process.env.ALOWARE_CHANNEL_ID || 'C09ULGH1BEC';

const slackTsToDate = (ts: string | undefined): Date => {
  const raw = ts || `${Date.now() / 1000}`;
  const seconds = Number.parseFloat(raw);
  if (Number.isFinite(seconds)) return new Date(seconds * 1000);
  return new Date();
};

async function backfill() {
  if (!SLACK_TOKEN) {
    console.error('SLACK_BOT_TOKEN is not set');
    process.exit(1);
  }

  console.log('🚀 Starting Slack backfill...');
  console.log(`Channel: ${CHANNEL_ID}`);

  await initDatabase(console);
  const client = new WebClient(SLACK_TOKEN);

  let cursor: string | undefined;
  let totalProcessed = 0;
  let totalIngested = 0;

  try {
    do {
      console.log(`Fetching messages... ${cursor ? `(cursor: ${cursor})` : ''}`);
      const result = await client.conversations.history({
        channel: CHANNEL_ID,
        cursor,
        limit: 100,
      });

      if (!result.ok) {
        throw new Error(`Slack API error: ${result.error}`);
      }

      const messages = result.messages || [];
      console.log(`Received ${messages.length} messages`);

      for (const message of messages) {
        totalProcessed++;

        const text = message.text || '';
        const attachments = message.attachments as unknown as Parameters<typeof parseAlowareMessage>[1];
        const slackMessageTs = message.ts;

        if (!slackMessageTs) continue;

        const parsed = parseAlowareMessage(text, attachments);

        // Only ingest messages that look like SMS events.
        if (parsed.direction === 'unknown') continue;
        if (!parsed.contactId && !parsed.contactPhone) continue;

        const eventRow = await insertSmsEvent({
          slackTeamId: (message as { team?: string }).team || 'unknown',
          slackChannelId: CHANNEL_ID,
          slackMessageTs,
          eventTs: slackTsToDate(slackMessageTs),
          direction: parsed.direction,
          contactId: parsed.contactId || null,
          contactPhone: parsed.contactPhone || null,
          contactName: parsed.contactName || null,
          alowareUser: parsed.user || null,
          body: parsed.body || null,
          line: parsed.line || null,
          sequence: parsed.sequence || null,
          raw: { text, attachments },
        });

        if (eventRow) {
          totalIngested++;
          const conversation = await upsertConversationFromEvent(eventRow);
          if (conversation) {
            if (eventRow.direction === 'inbound') {
              await upsertNeedsReplyWorkItem(conversation, eventRow);
            } else if (eventRow.direction === 'outbound') {
              await resolveNeedsReplyOnOutbound(conversation.id, eventRow);
            }
          }
        }
      }

      cursor = result.response_metadata?.next_cursor;
      console.log(`Progress: ${totalProcessed} processed, ${totalIngested} ingested`);
    } while (cursor);

    console.log('✅ Backfill complete!');
    console.log(`Total messages processed: ${totalProcessed}`);
    console.log(`Total SMS events ingested: ${totalIngested}`);
  } catch (error) {
    console.error('❌ Backfill failed:', error);
  } finally {
    await closeDatabase();
  }
}

backfill().catch(console.error);
