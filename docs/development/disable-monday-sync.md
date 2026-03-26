# Disable Monday.com Auto-Sync

Use this runbook whenever you need to immediately stop automatic writes to Monday.com boards without changing code. This is useful when bad entries are being created, column mappings are incorrect, or you need to pause sync while investigating an issue.

## How the Safety Gates Work

Automatic Monday.com writes require **all three** of the following variables to be `true`:

| Variable | Purpose |
|----------|---------|
| `MONDAY_AUTO_WRITE_ENABLED` | Master safety gate — must be `true` for any write job to run |
| `MONDAY_OUTBOUND_ENABLED` | Allows outbound writes to Monday.com |
| `MONDAY_PERSONAL_SYNC_ENABLED` | Enables the personal board booked-call sync specifically |

Setting any one of these to `false` is enough to halt automatic syncs. Setting `MONDAY_AUTO_WRITE_ENABLED=false` is the single most effective kill-switch.

> **Code reference:** `sms-insights/services/monday-personal-writeback.ts` — `syncRecentSetterBookedCallsToMonday` returns `{ status: 'skipped' }` immediately if any of the three flags is falsy.

---

## Disabling Auto-Sync

### Option 1: Railway Dashboard (Recommended)

1. Go to [Railway dashboard](https://railway.app) and select your project.
2. Select the **sms-insights** service.
3. Open the **Variables** tab.
4. Set the following variables to `false`:
   - `MONDAY_AUTO_WRITE_ENABLED` → `false`
   - `MONDAY_PERSONAL_SYNC_ENABLED` → `false`
   - `MONDAY_OUTBOUND_ENABLED` → `false`
5. Click **Deploy** to apply the changes.

### Option 2: Railway CLI

```bash
railway variables set MONDAY_AUTO_WRITE_ENABLED=false
railway variables set MONDAY_PERSONAL_SYNC_ENABLED=false
railway variables set MONDAY_OUTBOUND_ENABLED=false
```

Then redeploy:

```bash
railway redeploy
```

---

## What Disabling Does

- **Stops** all automatic syncing of booked calls to Monday.com boards.
- **Prevents** new entries (complete or incomplete) from being created.
- **Preserves** all existing data — no rows are modified or deleted.
- The service continues to run normally for all other features (Slack bot, SMS tracking, etc.).

---

## Re-enabling Auto-Sync

Once you have resolved the underlying issue (e.g., corrected column mappings, verified board configuration):

1. Test a **single call** manually using the sync manager script before scaling back up:
   ```bash
   cd sms-insights
   npx tsx monday-sync-manager.mjs
   ```
2. Confirm the entry in Monday.com looks correct (all columns populated).
3. Re-enable the flags in Railway:
   ```bash
   railway variables set MONDAY_AUTO_WRITE_ENABLED=true
   railway variables set MONDAY_PERSONAL_SYNC_ENABLED=true
   railway variables set MONDAY_OUTBOUND_ENABLED=true
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

