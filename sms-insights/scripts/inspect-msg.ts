import { WebClient } from "@slack/web-api";
import "dotenv/config";

const client = new WebClient(process.env.SLACK_BOT_TOKEN);
const CH = process.env.ALOWARE_CHANNEL_ID!;

(async () => {
  const h = await client.conversations.history({ channel: CH, limit: 100 });
  const targets = (h.messages || []).filter((m) => {
    const date = new Date(Number(m.ts) * 1000);
    return (
      date
        .toLocaleDateString("en-US", { timeZone: "America/Chicago" })
        .startsWith("2/15") && date.getHours() === 16
    );
  });

  for (const m of targets) {
    console.log("-----------------------------------------");
    console.log(`TS: ${m.ts} | USER: ${m.user} | BOT: ${m.bot_id}`);
    console.log(`TEXT: ${m.text}`);
    if (m.attachments)
      console.log("ATTACHMENTS:", JSON.stringify(m.attachments, null, 2));
    if (m.blocks) console.log("BLOCKS:", JSON.stringify(m.blocks, null, 2));
  }
})();
