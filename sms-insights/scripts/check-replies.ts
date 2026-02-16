import { WebClient } from "@slack/web-api";
import "dotenv/config";

const client = new WebClient(process.env.SLACK_BOT_TOKEN);
const CH = process.env.ALOWARE_CHANNEL_ID!;

(async () => {
  const h = await client.conversations.history({ channel: CH, limit: 300 });
  const trigger = (h.messages || []).find((m) => {
    const date = new Date(Number(m.ts) * 1000);
    return (
      date
        .toLocaleDateString("en-US", { timeZone: "America/Chicago" })
        .startsWith("2/15") &&
      date.getHours() === 16 &&
      (m.text || "").includes("daily report")
    );
  });

  if (trigger && trigger.ts) {
    console.log(`Found trigger: ${trigger.ts}`);
    const r = await client.conversations.replies({
      channel: CH,
      ts: trigger.ts,
    });
    for (const reply of r.messages || []) {
      const text = reply.text || "";
      console.log(`REPLY [${reply.ts}]: ${text.slice(0, 100)}`);
      if (text.includes("OUTBOUND CONVERSATIONS")) {
        console.log(">>> THIS IS THE SNAPSHOT! <<<");
        console.log(text);
      }
    }
  } else {
    console.log("Trigger not found around 4 PM on Feb 15th");
  }
})();
