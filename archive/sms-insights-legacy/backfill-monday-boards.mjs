#!/usr/bin/env node
/**
 * backfill-monday-boards.mjs
 *
 * Patches all existing Monday.com booked call items with corrected column values.
 *
 * Strategy: Directly query monday_booked_call_pushes for synced items, extract
 * BookedCallAttributionSource from payload_json, rebuild column values using the
 * same mapping logic as the live sync, then call upsertBookedCallItem() with
 * existingItemId — bypassing pushOne() skip logic and the 14-day lookback entirely.
 *
 * Usage:
 *   cd sms-insights
 *   railway run -- node --import tsx backfill-monday-boards.mjs [--dry-run] [--limit=N]
 */

import { getPrismaClient } from "./services/prisma.ts";
import {
  loadBoardMapping,
  toColumnValues,
  buildItemName,
  buildUpdateMarkdown,
} from "./services/monday-personal-writeback.ts";
import { upsertBookedCallItem } from "./services/monday-client.ts";

const prisma = getPrismaClient();

// ── Terminal colours ──────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

const log = {
  title: (t) => console.log(`\n${c.bright}${c.cyan}${t}${c.reset}`),
  success: (t) => console.log(`${c.green}✓${c.reset} ${t}`),
  error: (t) => console.log(`${c.red}✗${c.reset} ${t}`),
  info: (t) => console.log(`${c.blue}ℹ${c.reset} ${t}`),
  warn: (t) => console.log(`${c.yellow}⚠${c.reset} ${t}`),
  data: (t) => console.log(`  ${c.dim}${t}${c.reset}`),
  step: (n, total, t) => console.log(`  [${n}/${total}] ${t}`),
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Monday API rate-limit buffer between item patches */
const RATE_LIMIT_DELAY_MS = 350;

// ── Minimal logger shim compatible with @slack/bolt Logger ───────────────────
// Includes meta argument so actual Monday API error messages are visible.
const makeLogger = () => ({
  info: (msg, meta) =>
    log.info(typeof msg === "string" ? msg : JSON.stringify(msg)),
  debug: () => {},
  warn: (msg, meta) => {
    log.warn(typeof msg === "string" ? msg : JSON.stringify(msg));
    if (meta !== undefined) log.data(`    detail: ${JSON.stringify(meta)}`);
  },
  error: (msg, meta) => {
    log.error(typeof msg === "string" ? msg : JSON.stringify(msg));
    if (meta !== undefined) log.data(`    detail: ${JSON.stringify(meta)}`);
  },
});

// ── Main ──────────────────────────────────────────────────────────────────────
async function backfillMondayBoards() {
  const dryRun = process.argv.includes("--dry-run");
  const limitArg = process.argv.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? parseInt(limitArg.split("=")[1], 10) : null;

  log.title(
    "╔═══════════════════════════════════════════════════════════════╗",
  );
  log.title(
    "║     MONDAY.COM BOARD BACKFILL — CORRECTED COLUMN VALUES       ║",
  );
  log.title(
    "╚═══════════════════════════════════════════════════════════════╝",
  );

  if (dryRun) log.warn("DRY RUN mode — no Monday API calls will be made");
  if (limit) log.info(`Limit: ${limit} items`);

  // ── Resolve board ID ────────────────────────────────────────────────────────
  const boardId = (process.env.MONDAY_PERSONAL_BOARD_ID || "").trim();
  if (!boardId) {
    log.error("MONDAY_PERSONAL_BOARD_ID is not configured — aborting");
    process.exit(1);
  }
  log.info(`Board ID: ${boardId}`);

  // ── Step 1: Query synced pushes ─────────────────────────────────────────────
  log.title("STEP 1: Querying synced pushes from DB...");

  const allPushes = await prisma.monday_booked_call_pushes.findMany({
    where: {
      board_id: boardId,
      status: "synced",
      monday_item_id: { not: null },
    },
    orderBy: { updated_at: "desc" },
  });

  const pushes = limit ? allPushes.slice(0, limit) : allPushes;

  log.info(
    `Found ${allPushes.length} synced items total — processing ${pushes.length}`,
  );

  if (pushes.length === 0) {
    log.warn("No items to backfill — exiting");
    return;
  }

  // Show a sample
  log.data("Sample (first 5):");
  pushes.slice(0, 5).forEach((p) => {
    const src = p.payload_json?.source;
    log.data(
      `  monday_item_id=${p.monday_item_id} | setter=${p.setter_bucket}` +
        ` | contact=${src?.contactName ?? "?"} | updated=${p.updated_at.toISOString().slice(0, 10)}`,
    );
  });

  if (dryRun) {
    log.warn("DRY RUN — stopping before any API calls");
    log.info("Full list of items that would be patched:");
    pushes.forEach((p, i) => {
      const src = p.payload_json?.source;
      log.data(
        `  ${String(i + 1).padStart(3)}. item=${p.monday_item_id}` +
          ` | contact=${src?.contactName ?? "?"} | bucket=${p.setter_bucket}`,
      );
    });
    return;
  }

  // ── Step 2: Load board column mapping (once) ────────────────────────────────
  log.title("STEP 2: Loading board column mapping from Monday API...");

  const logger = makeLogger();
  const { mapping, columnsById } = await loadBoardMapping(boardId, logger);

  log.success(`Loaded mapping — ${columnsById.size} columns on board`);

  // Log resolved column IDs so we can verify in Monday UI
  const resolvedCols = Object.entries(mapping)
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  log.data(`Resolved: ${resolvedCols || "(none)"}`);

  const unresolvedCols = Object.entries(mapping)
    .filter(([, v]) => v === null)
    .map(([k]) => k);
  if (unresolvedCols.length > 0) {
    log.warn(
      `Unresolved columns (will be skipped): ${unresolvedCols.join(", ")}`,
    );
  }

  // ── Step 3: Patch each item ─────────────────────────────────────────────────
  log.title(`STEP 3: Patching ${pushes.length} Monday items...`);

  let patched = 0;
  let skipped = 0;
  let errors = 0;
  const errorDetails = [];

  for (let i = 0; i < pushes.length; i++) {
    const push = pushes[i];
    const mondayItemId = push.monday_item_id;

    // Extract BookedCallAttributionSource from payload_json
    // Stored as: { source: BookedCallAttributionSource, boardId: string }
    const payloadJson = push.payload_json;
    const source = payloadJson?.source;

    if (!source || !source.slackChannelId || !source.slackMessageTs) {
      log.step(
        i + 1,
        pushes.length,
        `SKIP item=${mondayItemId} — missing source in payload_json`,
      );
      skipped++;
      continue;
    }

    try {
      const columnValues = toColumnValues(source, mapping, columnsById);
      const colCount = Object.keys(columnValues).length;
      const itemName = buildItemName(source);
      const updateMarkdown = buildUpdateMarkdown(source);

      log.step(
        i + 1,
        pushes.length,
        `Patching item=${mondayItemId} | "${itemName}" | ${colCount} column(s)`,
      );
      // Print the exact column values JSON so we can diagnose format issues
      log.data(`    columnValues: ${JSON.stringify(columnValues)}`);

      await upsertBookedCallItem(
        boardId,
        {
          itemName,
          updateMarkdown,
          columnValues,
          existingItemId: mondayItemId,
        },
        logger,
      );

      patched++;
      log.success(`    → Done (${itemName})`);
    } catch (err) {
      errors++;
      const errMsg = err instanceof Error ? err.message : String(err);
      log.error(`    → Failed item=${mondayItemId}: ${errMsg}`);
      errorDetails.push({
        mondayItemId,
        contact: source?.contactName ?? "?",
        error: errMsg,
      });
    }

    // Rate-limit buffer — be gentle with Monday API
    if (i < pushes.length - 1) {
      await sleep(RATE_LIMIT_DELAY_MS);
    }
  }

  // ── Step 4: Summary ─────────────────────────────────────────────────────────
  log.title("STEP 4: Summary");
  log.success(`Patched:  ${patched} / ${pushes.length}`);
  if (skipped > 0)
    log.warn(`Skipped:  ${skipped} (missing payload_json.source)`);
  if (errors > 0) {
    log.error(`Errors:   ${errors}`);
    log.warn("Error details:");
    errorDetails.forEach((e) =>
      log.data(`  item=${e.mondayItemId} | contact=${e.contact} | ${e.error}`),
    );
  } else {
    log.success("No errors!");
  }

  log.title("Done. Verify corrected column values in Monday.com UI.");
}

backfillMondayBoards()
  .catch((err) => {
    log.error(`Fatal: ${err instanceof Error ? err.message : String(err)}`);
    console.error(err instanceof Error ? err.stack : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
