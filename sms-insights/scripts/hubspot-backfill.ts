/**
 * HubSpot Backfill — Block Kit Note Cards
 *
 * Scans recent channel history for lead messages and posts a
 * Block Kit card with a pre-formatted note + HubSpot deep link.
 *
 * Usage:  npx tsx scripts/hubspot-backfill.ts [limit]
 *   limit defaults to 5
 */
import { WebClient } from "@slack/web-api";
import "dotenv/config";
import { getHubSpotSyncData } from "../services/lead-watcher.js";

const CHANNEL_ID = process.env.ALOWARE_CHANNEL_ID || "";
const BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const USER_TOKEN = process.env.SLACK_USER_TOKEN;
const CLAUDE_USER_ID = process.env.CLAUDE_ASSISTANT_USER_ID || "U0AC78PBV9Q";
const HUBSPOT_PORTAL = "22001532";
const LIMIT = Number(process.argv[2]) || 5;

async function backfill() {
  if (!CHANNEL_ID) {
    console.error("❌ ALOWARE_CHANNEL_ID not set");
    process.exit(1);
  }

  const client = new WebClient(BOT_TOKEN);

  console.log(`🔍 Scanning for leads (targeting ${LIMIT} note cards)...`);

  const history = await client.conversations.history({
    channel: CHANNEL_ID,
    limit: LIMIT * 10,
  });

  if (!history.messages || history.messages.length === 0) {
    console.log("No messages found.");
    return;
  }

  let count = 0;

  for (const message of history.messages) {
    if (count >= LIMIT) break;

    const syncData = getHubSpotSyncData({
      attachments: message.attachments as any,
      channelId: CHANNEL_ID,
      text: message.text,
      threadTs: message.thread_ts,
      ts: message.ts,
    });

    if (syncData && syncData.phoneNumber) {
      count++;

      const contactPhoneMatch = syncData.contactLabel.match(/\(([^)]+)\)/);
      const contactPhone = contactPhoneMatch
        ? contactPhoneMatch[1].trim()
        : syncData.phoneNumber;
      const contactPhoneDigits = contactPhone.replace(/\D/g, "");
      const contactName = syncData.contactLabel
        .replace(/\s*\([^)]*\)\s*$/, "")
        .trim();

      const today = new Date().toLocaleDateString("en-US", {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
      });
      const smsBody = syncData.messageBody || "(no message body)";
      const noteText = `Lead Insight — Inbound SMS via Aloware | ${today}\n\n${smsBody}`;
      const hubspotSearchUrl = `https://app.hubspot.com/contacts/${HUBSPOT_PORTAL}/objects/0-1/views/all/list?query=${encodeURIComponent(contactPhoneDigits)}`;

      console.log(`\n📤 [${count}/${LIMIT}] ${contactName} (${contactPhone})`);

      try {
        await client.chat.postMessage({
          channel: CHANNEL_ID,
          thread_ts: message.ts!,
          text: `📋 HubSpot Note ready for ${contactName}`,
          blocks: [
            {
              type: "header",
              text: {
                type: "plain_text",
                text: `📋 HubSpot Note — ${contactName}`,
                emoji: true,
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Phone:* ${contactPhone}\n*Date:* ${today}`,
              },
            },
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: `*Copy this note:*\n\`\`\`${noteText}\`\`\``,
              },
            },
            {
              type: "actions",
              elements: [
                {
                  type: "button",
                  text: {
                    type: "plain_text",
                    text: "🔗 Open Contact in HubSpot",
                    emoji: true,
                  },
                  url: hubspotSearchUrl,
                  style: "primary",
                  action_id: "hubspot_open_contact",
                },
              ],
            },
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: "Click the button → open the contact → click *Note* → paste the text above.",
                },
              ],
            },
          ],
        });
        console.log(`   ✅ Note card posted`);
      } catch (err) {
        console.error(`   ❌ Failed:`, err);
      }

      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  console.log(`\n🏁 Done. Posted ${count} note cards.`);
}

backfill();
