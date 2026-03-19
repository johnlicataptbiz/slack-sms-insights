# Monday.com Auto-Sync: Fixed! ✅

**Date:** 2026-03-17  
**Status:** ✅ Disabled & Fixed

---

## Problem Identified

### Symptom
Auto-synced booked calls from Slack to Monday.com were creating entries with **empty status columns**:
- ❌ Source? (empty)
- ❌ Channel? (empty)  
- ❌ Swing? (empty)
- ❌ Call Type? (empty)

### Root Cause
The sync code was trying to set **invalid values** that don't exist in Monday.com's dropdown options:

| Column | Code Tried to Set | Valid Options in Monday |
|--------|-------------------|------------------------|
| Swing? | `"Booked"` | "First Swing", "Second Swing", "Third Swing" |
| Source? | `"Slack booked call"` | "Circle Group", "Book Buyer", "Marketing Email", etc. |
| Channel? | `<raw line data>` | "Aloware SMS", "Circle DM", "Instagram DM", etc. |

When Monday.com receives an invalid status value, it **silently rejects it** and leaves the field empty!

---

## Actions Taken

### 1. ✅ Auto-Sync Disabled
Disabled via Railway CLI to prevent more incomplete entries:

```bash
MONDAY_PERSONAL_SYNC_ENABLED=false
MONDAY_AUTO_WRITE_ENABLED=false
MONDAY_OUTBOUND_ENABLED=false
```

### 2. ✅ Code Fixed & Deployed

**File:** `sms-insights/services/monday-personal-writeback.ts`

**Changes:**
1. **Swing? column:** Changed from `"Booked"` → `"First Swing"`
2. **Channel? column:** Added `mapLineToChannel()` function to map line names:
   ```typescript
   'aloware' or 'sms' → 'Aloware SMS'
   'circle' → 'Circle DM'
   'instagram' or 'ig' → 'Instagram DM'
   'email' → 'Email Marketing'
   'self' → 'SELF BOOK'
   ```

3. **Source? column:** Added `mapSourceToMondaySource()` function to map first conversion:
   ```typescript
   'circle' → 'Circle Group'
   'book buyer' → 'Book Buyer'
   'email' → 'Marketing Email'
   'social' → 'Social Media'
   'webinar' → 'Webinar'
   // ... and more mappings with 'Direct Outreach' as fallback
   ```

**Git Commit:** `da7663e`  
**Pushed to:** `origin/main`  
**Railway:** Will auto-deploy from main branch

---

## Verification Steps

### Before Re-enabling Sync:

1. **Wait for Railway deployment**
   - Check Railway dashboard for successful deploy
   - Look for commit `da7663e` in deployment logs

2. **Test with ONE call manually**
   ```bash
   cd sms-insights
   railway run node --import tsx monday-sync-manager.mjs sync
   ```
   - This will sync ONE recent call as a test
   - Check Monday board to verify all columns populate correctly

3. **If test successful, re-enable auto-sync:**
   ```bash
   railway variables set MONDAY_PERSONAL_SYNC_ENABLED=true
   railway variables set MONDAY_AUTO_WRITE_ENABLED=true
   railway variables set MONDAY_OUTBOUND_ENABLED=true
   ```

---

## Technical Details

### Diagnostic Tools Created

Located in `sms-insights/`:

1. **`inspect-board-items.mjs`**
   - Shows all status columns and their valid values
   - Displays recent items with their current status values
   - Usage: `railway run node --import tsx inspect-board-items.mjs`

2. **`check-status-columns.mjs`**
   - Shows status column configuration
   - Validates column mapping
   - Usage: `railway run node --import tsx check-status-columns.mjs`

3. **`monday-sync-manager.mjs`**
   - Complete Monday sync management tool
   - Commands: `config`, `pending`, `sync`, `activity`, `all`
   - Usage: `railway run node --import tsx monday-sync-manager.mjs <command>`

### Monday.com API Behavior

**Key Learning:** Monday.com's GraphQL API for status columns:
- Requires exact label match (case-sensitive)
- Silently rejects invalid values (no error thrown)
- Uses format: `{ label: "Value" }` for status columns
- If label doesn't exist in column settings, field stays empty

---

## What Changed in Synced Data

### Before Fix:
```
Name: Jennifer Lockoman - 2026-03-17 ✓
Date Set: 2026-03-17 ✓
Source?: (empty) ❌
Channel?: (empty) ❌
Swing?: (empty) ❌
Call Type?: (empty) ❌
```

### After Fix:
```
Name: Jennifer Lockoman - 2026-03-17 ✓
Date Set: 2026-03-17 ✓
Source?: Direct Outreach ✓ (or mapped from first conversion)
Channel?: Aloware SMS ✓ (or mapped from line)
Swing?: First Swing ✓
Call Type?: (empty - this column not in mapping)
```

---

## Duplicate Cleanup Completed

**Previous Session:** Successfully deleted 7 duplicate manual entries that were also auto-synced:
- Jennifer Lockoman
- Joshua Costello
- Laura Myers
- Beth Pavelka
- Gabe Punke
- Nivedita Sinnarkar
- Dominick Dauria

---

## Next Steps

1. ✅ **DONE:** Disable auto-sync
2. ✅ **DONE:** Fix column value mapping in code
3. ✅ **DONE:** Deploy fix to Railway
4. ⏳ **PENDING:** Wait for Railway deployment
5. ⏳ **PENDING:** Test with one call
6. ⏳ **PENDING:** Verify status columns populate correctly
7. ⏳ **PENDING:** Re-enable auto-sync if test passes

---

## Configuration Reference

### Current Environment Variables (Railway)

```bash
# Board Configuration
MONDAY_PERSONAL_BOARD_ID=10029059942
MONDAY_PERSONAL_SETTER_BUCKET=jack

# Sync Control (CURRENTLY DISABLED)
MONDAY_PERSONAL_SYNC_ENABLED=false
MONDAY_AUTO_WRITE_ENABLED=false
MONDAY_OUTBOUND_ENABLED=false

# Column Mapping
MONDAY_PERSONAL_COLUMN_MAP_JSON={"callDateColumnId":"date_mkznycfs","contactNameColumnId":"name","lineColumnId":"color_mkznwqh0","sourceColumnId":"color_mkznd6kp","stageColumnId":"color_mm089dk3",...}

# Sync Settings
MONDAY_PERSONAL_PUSH_LOOKBACK_DAYS=14
```

### Monday Board Column IDs

| Field | Monday Column | Column ID |
|-------|--------------|-----------|
| Date Set | Date Set | `date_mkznycfs` |
| Contact Name | Name | `name` (item name) |
| Source | Source? | `color_mkznd6kp` (status) |
| Channel | Channel? | `color_mkznwqh0` (status) |
| Swing | Swing? | `color_mm089dk3` (status) |
| Call Type | Call Type? | `color_mkznsang` (status) |

---

## Contact

For questions or issues:
- Check Railway deployment logs
- Run diagnostic tools in `sms-insights/`
- Review this document for troubleshooting steps

**Last Updated:** 2026-03-17 21:40 PST
