# Disable Monday.com Auto-Sync

## Current Status
Based on your summary, these variables are currently set in Railway:

```
MONDAY_PERSONAL_SYNC_ENABLED=true
MONDAY_AUTO_WRITE_ENABLED=true
MONDAY_OUTBOUND_ENABLED=true
```

## ⚠️ IMMEDIATE ACTION NEEDED

### Option 1: Disable via Railway Dashboard (RECOMMENDED)
1. Go to Railway dashboard: https://railway.app
2. Select your project
3. Go to **Variables** tab
4. Change these variables:
   - `MONDAY_PERSONAL_SYNC_ENABLED` → **false**
   - `MONDAY_AUTO_WRITE_ENABLED` → **false**
   - `MONDAY_OUTBOUND_ENABLED` → **false**
5. Redeploy the service

### Option 2: Disable via Railway CLI
```bash
railway variables set MONDAY_PERSONAL_SYNC_ENABLED=false
railway variables set MONDAY_AUTO_WRITE_ENABLED=false
railway variables set MONDAY_OUTBOUND_ENABLED=false
```

## What This Does
- **Stops** automatic syncing of booked calls to Monday.com
- **Prevents** new incomplete entries from being created
- **Preserves** existing data (doesn't delete anything)

## After Disabling
Once disabled, we can:
1. Fix the column mapping configuration
2. Test with a single call
3. Re-enable sync once working properly

---

**Created:** 2026-03-17 21:37
