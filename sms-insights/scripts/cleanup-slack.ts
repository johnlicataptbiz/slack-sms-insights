/**
 * Aggressive cleanup: delete ALL bot replies and user-impersonated replies
 * from lead threads. Leaves only the original Aloware message and the
 * Lead Watcher alert.
 */
import { WebClient } from "@slack/web-api";
import "dotenv/config";

const CHANNEL_ID = process.env.ALOWARE_CHANNEL_ID || "";
const BOT_TOKEN = process.env.SLACK_BOT_TOKEN!;
const USER_TOKEN = process.env.SLACK_USER_TOKEN!;
const botClient = new WebClient(BOT_TOKEN);
const userClient = new WebClient(USER_TOKEN);

// Get our bot's user ID
async function getBotUserId(): Promise<string> {
  const auth = await botClient.auth.test();
  return auth.user_id as string;
}

// Get the impersonated user ID
async function getUserId(): Promise<string> {
  const auth = await userClient.auth.test();
  return auth.user_id as string;
}

async function cleanup() {
  console.log("🧹 Aggressive cleanup of dev iterations...\n");

  const botUserId = await getBotUserId();
  const userId = await getUserId();
  console.log(`Bot ID: ${botUserId} | User ID: ${userId}\n`);

  const history = await botClient.conversations.history({
    channel: CHANNEL_ID,
    limit: 50,
  });

  let deleted = 0;

  for (const msg of history.messages || []) {
    const thread = await botClient.conversations.replies({
      channel: CHANNEL_ID,
      ts: msg.ts!,
      limit: 200,
    });

    if (!thread.messages || thread.messages.length <= 1) continue;

    for (const reply of thread.messages!) {
      if (reply.ts === msg.ts) continue; // skip parent

      const text = reply.text || "";
      const isLeadAlert = text.includes("[Lead Watcher]");

      // Skip the Lead Watcher alerts — those are legit
      if (isLeadAlert) continue;

      // Delete: Claude handoffs, Claude responses, note cards, HubSpot mentions
      const shouldDelete =
        text.includes("@Claude") ||
        text.includes("Claude routed") ||
        text.includes("HubSpot tools") ||
        text.includes("HubSpot Note") ||
        text.includes("manage_crm_objects") ||
        text.includes("MCP") ||
        text.includes("note creation") ||
        text.includes("HubSpot MCP") ||
        text.includes("Lead Insight") ||
        text.includes("validation error") ||
        text.includes("log a note") ||
        text.includes("contact ID:");

      if (!shouldDelete) continue;

      const preview = text.substring(0, 50).replace(/\n/g, " ");

      // Try bot token
      try {
        await botClient.chat.delete({ channel: CHANNEL_ID, ts: reply.ts! });
        deleted++;
        console.log(`  🗑️  "${preview}..."`);
      } catch {
        // Try user token
        try {
          await userClient.chat.delete({ channel: CHANNEL_ID, ts: reply.ts! });
          deleted++;
          console.log(`  🗑️  "${preview}..." (user)`);
        } catch (e: any) {
          console.log(`  ⚠️  Can't: "${preview}..." (${e.data?.error})`);
        }
      }

      await new Promise((r) => setTimeout(r, 1200));
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\n✅ Deleted ${deleted} messages.`);
}

cleanup();
