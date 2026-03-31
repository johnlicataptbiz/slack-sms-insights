# Disable Monday.com Auto-Sync

Use this runbook whenever you need to immediately stop automatic writes to Monday.com boards without changing code. This is useful when bad entries are being created, column mappings are incorrect, or you need to pause sync while investigating an issue.

## How the Safety Gates Work

There are three separate automatic write paths, each controlled by its own set of feature flags:

### Path 1 — Weekly summary writeback

Writes the weekly manager report to a Monday.com board row.

| Variable | Purpose |
|----------|---------|
| `MONDAY_AUTO_WRITE_ENABLED` | Master safety gate — must be `true` for this job to run |
| `MONDAY_OUTBOUND_ENABLED` | Allows outbound writes to Monday.com |
| `MONDAY_WRITEBACK_ENABLED` | Enables the weekly summary writeback specifically |

> **Code reference:** `sms-insights/services/weekly-manager-summary.ts` — `syncWeeklySummaryToMonday` returns `{ status: 'skipped' }` immediately if any of the three flags is falsy.

### Path 2 — Personal board booked-call sync

Pushes recently booked calls to the setter's personal Monday.com board.

| Variable | Purpose |
|----------|---------|
| `MONDAY_AUTO_WRITE_ENABLED` | Master safety gate — must be `true` for this job to run |
| `MONDAY_OUTBOUND_ENABLED` | Allows outbound writes to Monday.com |
| `MONDAY_PERSONAL_SYNC_ENABLED` | Enables the personal board booked-call sync specifically |

> **Code reference:** `sms-insights/services/monday-personal-writeback.ts` — `syncRecentSetterBookedCallsToMonday` returns `{ status: 'skipped' }` immediately if any of the three flags is falsy.

### Path 3 — SMS board sync

Syncs SMS events to a dedicated Monday.com SMS board. This path uses a **completely separate** set of flags and is not affected by `MONDAY_AUTO_WRITE_ENABLED`.

| Variable | Purpose |
|----------|---------|
| `MONDAY_SMS_SYNC_ENABLED` | Enables SMS board sync |
| `MONDAY_SMS_WRITEBACK_ENABLED` | Enables writing back SMS event data |
| `MONDAY_SMS_OUTBOUND_ENABLED` | Allows outbound writes for the SMS path |
| `MONDAY_SMS_AUTO_WRITE_ENABLED` | Auto-write safety gate for the SMS path |

> **Code reference:** `sms-insights/services/monday-sms-sync.ts` — `syncMondaySmsBoard` checks `MONDAY_SMS_SYNC_ENABLED` as its primary gate.

---

### Quick kill-switch

`MONDAY_AUTO_WRITE_ENABLED=false` stops **Paths 1 and 2** immediately. To also stop the SMS path, set `MONDAY_SMS_AUTO_WRITE_ENABLED=false` (or `MONDAY_SMS_SYNC_ENABLED=false`).

---

## Disabling Auto-Sync

### Option 1: Railway Dashboard (Recommended)

1. Go to [Railway dashboard](https://railway.app) and select your project.
2. Select the **sms-insights** service.
3. Open the **Variables** tab.
4. To stop **Paths 1 and 2** (weekly summary + personal sync), set:
   - `MONDAY_AUTO_WRITE_ENABLED` → `false`
5. To also stop **Path 3** (SMS sync), additionally set:
   - `MONDAY_SMS_AUTO_WRITE_ENABLED` → `false`
   - `MONDAY_SMS_SYNC_ENABLED` → `false`
6. Click **Deploy** to apply the changes.

### Option 2: Railway CLI

Stop Paths 1 and 2 (weekly summary + personal sync):
```bash
railway variables set MONDAY_AUTO_WRITE_ENABLED=false
```

Stop Path 3 (SMS sync) as well:
```bash
railway variables set MONDAY_SMS_AUTO_WRITE_ENABLED=false
railway variables set MONDAY_SMS_SYNC_ENABLED=false
```

Then redeploy:

```bash
railway redeploy
```

---

## What Disabling Does

- **Stops** all automatic writes to Monday.com boards (weekly summary, personal booked-call sync, and/or SMS sync depending on which flags you set).
- **Prevents** new entries (complete or incomplete) from being created.
- **Preserves** all existing data — no rows are modified or deleted.
- The service continues to run normally for all other features (Slack bot, SMS tracking, etc.).

---

## Re-enabling Auto-Sync

Once you have resolved the underlying issue (e.g., corrected column mappings, verified board configuration):

1. Test a **single call** manually using the sync manager script before scaling back up:
   ```bash
   cd sms-insights
   railway run node --import tsx monday-sync-manager.mjs sync
   ```
2. Confirm the entry in Monday.com looks correct (all columns populated).
3. Re-enable the flags in Railway for the paths you disabled:
   ```bash
   # Paths 1 and 2 (weekly summary + personal sync)
   railway variables set MONDAY_AUTO_WRITE_ENABLED=true

   # Path 3 (SMS sync) — only if you also disabled it
   railway variables set MONDAY_SMS_AUTO_WRITE_ENABLED=true
   railway variables set MONDAY_SMS_SYNC_ENABLED=true

   railway redeploy
   ```

---

## Troubleshooting Common Issues

### Entries created with empty status columns

The sync code mapped invalid values that Monday.com silently rejected. Common culprits:

| Column | Invalid value | Valid examples |
|--------|--------------|----------------|
| Swing? | `"Booked"` | `"First Swing"`, `"Second Swing"`, `"Third Swing"` |
| Source? | `"Slack booked call"` | `"Circle Group"`, `"Book Buyer"`, `"Marketing Email"` |
| Channel? | raw line data | `"Aloware SMS"`, `"Circle DM"`, `"Instagram DM"` |

Fix: review `mapLineToChannel()` and `mapSourceToMondaySource()` in `sms-insights/services/monday-personal-writeback.ts` and ensure all mapped values match a valid dropdown option in your Monday.com board.

### Sync runs but nothing appears in Monday.com

- Verify `MONDAY_PERSONAL_BOARD_ID` is set to the correct board ID.
- Check that `MONDAY_PERSONAL_SETTER_BUCKET` matches the setter name (`jack`, `brandon`, or `selfBooked`).
- Review Railway logs for `Monday personal booked-call sync` log lines.

