import { WebClient } from "@slack/web-api";
import "dotenv/config";
import { appendDailyReportToCanvas } from "../services/canvas-log.js";

const client = new WebClient(process.env.SLACK_BOT_TOKEN);
const CH = process.env.ALOWARE_CHANNEL_ID!;
// The thread parent (trigger)
const TRIGGER_TS = "1771192805.584309";
// The actual snapshot reply
const SNAPSHOT_TS = "1771192811.867829";

const dummyLogger: any = {
  info: console.log,
  warn: console.warn,
  error: console.error,
  debug: console.log,
};

(async () => {
  console.log("Fetching snapshot text for backfilling to canvas...");

  const r = await client.conversations.replies({
    channel: CH,
    ts: TRIGGER_TS,
    limit: 100,
  });

  const triggerMsg = (r.messages || []).find((m) => m.ts === TRIGGER_TS);
  const snapshotMsg = (r.messages || []).find((m) => m.ts === SNAPSHOT_TS);

  if (!triggerMsg || !snapshotMsg || !snapshotMsg.text) {
    console.error("Could not find trigger or snapshot message text.");
    process.exit(1);
  }

  console.log(`Found snapshot text. Trigger prompt: ${triggerMsg.text}`);
  console.log("Updating canvas logs...");

  await appendDailyReportToCanvas({
    client,
    logger: dummyLogger,
    channelId: CH,
    prompt: triggerMsg.text || "daily report",
    report: snapshotMsg.text,
    reportMessageTs: snapshotMsg.ts,
  });

  console.log("✅ Canvas log update triggered for Feb 15th!");
  process.exit(0);
})();
