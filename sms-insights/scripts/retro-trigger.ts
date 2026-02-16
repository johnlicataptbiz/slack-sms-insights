import { WebClient } from "@slack/web-api";
import "dotenv/config";
import { isAlowareChannel } from "../services/aloware-policy.js";
import { parseAlowareMessage } from "../services/aloware-parser.js";
import {
  buildLeadWatcherAlert,
  shouldBroadcastLeadWatcherAlerts,
  getHubSpotSyncData,
} from "../services/lead-watcher.js";
import { syncLeadNoteToHubSpot } from "../services/hubspot-sync.js";
import { requestInboundCoaching } from "../services/inbound-coaching.js";
import { requestSetterFeedback } from "../services/setter-feedback.js";

const CHANNEL_ID = process.env.ALOWARE_CHANNEL_ID || "C09ULGH1BEC";
const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;

async function retroTrigger() {
  console.log(
    `🔑 Token check: ${process.env.HUBSPOT_ACCESS_TOKEN?.slice(0, 10)}...`,
  );
  const client = new WebClient(BOT_TOKEN);
  const logger: any = {
    info: console.log,
    error: console.error,
    warn: console.warn,
    debug: console.log,
  };

  console.log(`🔍 Fetching recent history for channel ${CHANNEL_ID}...`);
  const history = await client.conversations.history({
    channel: CHANNEL_ID,
    limit: 200,
  });

  if (!history.messages || history.messages.length === 0) {
    console.log("No messages found.");
    return;
  }

  // Filter for Aloware messages (matching patterns)
  // We want to process the last 3 actionable ones.
  let processedCount = 0;
  const targetLimit = 10;

  // Reverse to process chronologically if we want, but usually user wants "the most recent 3"
  // Let's just iterate and stop at 3 actionable.
  for (const message of history.messages) {
    if (processedCount >= targetLimit) break;

    const text = message.text || "";
    const attachments = message.attachments as any;

    // Check if it looks like Aloware
    const fields = parseAlowareMessage(text, attachments);
    const isAlowareMsg = fields.direction !== "unknown";

    if (!isAlowareMsg) continue;

    console.log(
      `\n📦 Processing Aloware message: ${fields.direction} | ${fields.contactName}`,
    );

    if (fields.direction === "outbound") {
      // 🚀 SETTER FEEDBACK
      await requestSetterFeedback({
        client,
        fields,
        logger,
        ts: message.ts!,
        channelId: CHANNEL_ID,
      });
      processedCount++;
      console.log("✅ Outbound coaching triggered");
    } else if (fields.direction === "inbound") {
      // 🚀 LEAD WATCHER ALERT
      const alert = buildLeadWatcherAlert({
        attachments,
        channelId: CHANNEL_ID,
        text,
        ts: message.ts,
      });

      if (alert) {
        await client.chat.postMessage({
          channel: CHANNEL_ID,
          text: alert.text,
          blocks: alert.blocks,
          thread_ts: message.ts, // Post in thread for the retro trigger
        });
        console.log("✅ Lead Watcher alert triggered");

        // 🚀 SYNC & COACHING
        const syncData = getHubSpotSyncData({
          attachments,
          text,
        });

        if (syncData?.phoneNumber) {
          const contactId = await syncLeadNoteToHubSpot({
            phoneNumber: syncData.phoneNumber,
            contactName: syncData.contactLabel,
            noteContent: syncData.messageBody,
            tags: syncData.tags,
            logger,
          });

          if (contactId) {
            const hsPortalId = process.env.HUBSPOT_PORTAL_ID || "22001532";
            await client.chat.postMessage({
              channel: CHANNEL_ID,
              thread_ts: message.ts,
              text: `🔗 *HubSpot Contact:* https://app.hubspot.com/contacts/${hsPortalId}/record/0-1/${contactId}`,
            });
            console.log("✅ HubSpot sync triggered");
          }

          await requestInboundCoaching({
            client,
            fields,
            logger,
            ts: message.ts!,
            channelId: CHANNEL_ID,
          });
          console.log("✅ Inbound coaching triggered");
        }
        processedCount++;
      } else {
        console.log(
          "⏭️ Inbound message didn't meet signal threshold (Low Signal)",
        );
      }
    }

    // Small delay to avoid rate limits
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(
    `\n🏁 Retro-trigger complete. Processed ${processedCount} actionable messages.`,
  );
}

retroTrigger().catch(console.error);
