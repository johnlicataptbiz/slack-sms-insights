import 'dotenv/config';
import { WebClient } from '@slack/web-api';
import { closeDatabase, initDatabase, initializeSchema } from '../services/db.js';
import { upsertBookedCall, upsertBookedCallReaction } from '../services/booked-calls-store.js';

const SLACK_TOKEN = process.env.SLACK_BOT_TOKEN;
const CHANNEL_ID = process.env.BOOKED_CALLS_CHANNEL_ID;
const BACKFILL_DAYS = Math.max(1, Number.parseInt(process.env.BACKFILL_DAYS || '90', 10));

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
  if (!CHANNEL_ID) {
    console.error('BOOKED_CALLS_CHANNEL_ID is not set');
    process.exit(1);
  }

  console.log('🚀 Starting booked calls backfill...');
  console.log(`Channel: ${CHANNEL_ID}`);
  console.log(`Lookback window: ${BACKFILL_DAYS} days`);

  await initDatabase(console);
  await initializeSchema();

  const client = new WebClient(SLACK_TOKEN);

  let cursor: string | undefined;
  let totalProcessed = 0;
  let totalIngested = 0;
  const oldest = Math.floor(Date.now() / 1000 - BACKFILL_DAYS * 24 * 60 * 60).toString();

  try {
    do {
      console.log(`Fetching messages... ${cursor ? `(cursor: ${cursor})` : ''}`);
      const result = await client.conversations.history({
        channel: CHANNEL_ID,
        cursor,
        limit: 100,
        oldest,
      });

      if (!result.ok) {
        throw new Error(`Slack API error: ${result.error}`);
      }

      const messages = result.messages || [];
      console.log(`Received ${messages.length} messages`);

      for (const message of messages) {
        totalProcessed++;

        const slackMessageTs = message.ts;
        if (!slackMessageTs) continue;

        const text = message.text || '';
        const reactions = (message.reactions || []) as Array<{
          name?: string;
          count?: number;
          users?: string[];
        }>;

        const row = await upsertBookedCall(
          {
            slackTeamId: (message as { team?: string }).team || 'unknown',
            slackChannelId: CHANNEL_ID,
            slackMessageTs,
            eventTs: slackTsToDate(slackMessageTs),
            text,
            raw: message,
          },
          console,
        );

        if (!row) continue;
        totalIngested++;

        for (const r of reactions) {
          const name = (r.name || '').trim();
          if (!name) continue;
          await upsertBookedCallReaction(
            {
              bookedCallId: row.id,
              reactionName: name,
              reactionCount: r.count || 0,
              users: r.users || null,
            },
            console,
          );
        }
      }

      cursor = result.response_metadata?.next_cursor;
      console.log(`Progress: ${totalProcessed} processed, ${totalIngested} ingested`);
    } while (cursor);

    console.log('✅ Backfill complete!');
    console.log(`Total messages processed: ${totalProcessed}`);
    console.log(`Total booked calls ingested: ${totalIngested}`);
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exitCode = 1;
  } finally {
    await closeDatabase();
  }
}

backfill().catch((err) => {
  console.error(err);
  process.exit(1);
});
