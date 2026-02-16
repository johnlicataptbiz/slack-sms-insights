import { WebClient } from "@slack/web-api";
import "dotenv/config";

const client = new WebClient(process.env.SLACK_BOT_TOKEN);
const CH = process.env.ALOWARE_CHANNEL_ID!;

(async () => {
  const h = await client.conversations.history({ channel: CH, limit: 15 });
  for (const m of (h.messages || []).reverse()) {
    const t = new Date(Number(m.ts) * 1000).toLocaleTimeString("en-US", {
      timeZone: "America/Chicago",
    });
    const p = (m.text || "").slice(0, 100).replace(/\n/g, " ");
    console.log(`[${t}] ${p}`);
    if (m.text && /DAILY SMS SNAPSHOT|Core KPI/i.test(m.text)) {
      console.log("  >>> DAILY SNAPSHOT <<<");
      const r = await client.conversations.replies({
        channel: CH,
        ts: m.ts!,
        limit: 30,
      });
      for (const reply of (r.messages || []).slice(1)) {
        const rt = new Date(Number(reply.ts) * 1000).toLocaleTimeString(
          "en-US",
          { timeZone: "America/Chicago" },
        );
        console.log(
          `    [${rt}] (${reply.user || reply.bot_id}) ${(reply.text || "").slice(0, 180).replace(/\n/g, " ")}`,
        );
      }
    }
  }
  process.exit(0);
})();
