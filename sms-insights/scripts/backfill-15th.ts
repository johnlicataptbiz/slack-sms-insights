import { WebClient } from "@slack/web-api";
import "dotenv/config";
import { buildDailyReportBlocks } from "../services/daily-report-summary.js";

const client = new WebClient(process.env.SLACK_BOT_TOKEN);
const CH = process.env.ALOWARE_CHANNEL_ID!;
const TARGET_TS = "1771192811.867829";

(async () => {
  console.log(`Fetching specific snapshot reply at ${TARGET_TS}...`);

  const h = await client.conversations.replies({
    channel: CH,
    ts: "1771192805.584309", // The thread parent
    limit: 100,
  });

  const msg = (h.messages || []).find((m) => m.ts === TARGET_TS);

  if (msg && msg.text) {
    console.log(`Found Snapshot Text (Length: ${msg.text.length})`);
    const blocks = buildDailyReportBlocks(msg.text);

    try {
      await client.chat.postMessage({
        channel: CH,
        thread_ts: msg.thread_ts || msg.ts,
        text: "Backfilled Summary Statistics (Feb 15)",
        blocks: blocks,
      });
      console.log(`✅ successfully backfilled summary for Feb 15!`);
    } catch (err) {
      console.error(`❌ Failed to post backfill:`, err);
    }
  } else {
    console.log("Could not find the specific snapshot message text.");
  }
  process.exit(0);
})();
