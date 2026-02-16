import { WebClient } from "@slack/web-api";
import "dotenv/config";

const client = new WebClient(process.env.SLACK_BOT_TOKEN);
const CH = process.env.ALOWARE_CHANNEL_ID!;

(async () => {
  const h = await client.conversations.history({ channel: CH, limit: 200 });
  for (const m of h.messages || []) {
    const date = new Date(Number(m.ts) * 1000);
    const dateStr = date.toLocaleDateString("en-US", {
      timeZone: "America/Chicago",
    });
    const timeStr = date.toLocaleTimeString("en-US", {
      timeZone: "America/Chicago",
    });

    let content = m.text || "";
    if (m.attachments) {
      content +=
        " " + m.attachments.map((a) => a.text || a.fallback || "").join(" ");
    }
    if (m.blocks) {
      const blockText = JSON.stringify(m.blocks);
      content += " " + blockText;
    }

    const snippet = (m.text || content.slice(0, 100)).replace(/\n/g, " ");
    console.log(`[${dateStr} ${timeStr}] ${snippet.slice(0, 80)}...`);

    if (/DAILY SMS SNAPSHOT|Core KPI|OUTBOUND CONVERSATIONS/i.test(content)) {
      console.log("  >>> FOUND SNAPSHOT TEXT! <<<");
      console.log(`  TS: ${m.ts}`);
      console.log(`  Preview: ${content.slice(0, 300)}...`);
    }
  }
  process.exit(0);
})();
