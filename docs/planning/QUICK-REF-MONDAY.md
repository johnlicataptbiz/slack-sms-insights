# ⚡ Quick Reference: Monday.com Sync

## Current Status
- **Auto-Sync:** 🔴 DISABLED (preventing incomplete entries)
- **Code Fix:** ✅ DEPLOYED to Railway (commit `da7663e`)
- **Issue:** Status columns were empty because code used invalid dropdown values

---

## Re-enable Sync (After Testing!)

### 1. Test First
```bash
cd sms-insights
railway run node --import tsx monday-sync-manager.mjs sync
```
Check Monday board - verify all columns filled correctly!

### 2. Re-enable if Test Passes
```bash
railway variables set MONDAY_PERSONAL_SYNC_ENABLED=true
railway variables set MONDAY_AUTO_WRITE_ENABLED=true
railway variables set MONDAY_OUTBOUND_ENABLED=true
```

---

## Useful Commands

### Check Sync Status
```bash
railway variables | grep -E "MONDAY.*(SYNC|WRITE|OUTBOUND)"
```

### Inspect Board & Columns
```bash
railway run node --import tsx inspect-board-items.mjs
```

### View Pending Calls
```bash
railway run node --import tsx monday-sync-manager.mjs pending
```

### Check Recent Sync Activity
```bash
railway run node --import tsx monday-sync-manager.mjs activity
```

### Full Overview
```bash
railway run node --import tsx monday-sync-manager.mjs all
```

---

## What Was Fixed

| Column | ❌ Before | ✅ After |
|--------|----------|---------|
| Swing? | "Booked" (invalid) → empty | "First Swing" ✓ |
| Source? | "Slack booked call" (invalid) → empty | "Direct Outreach" or mapped ✓ |
| Channel? | raw line data (invalid) → empty | "Aloware SMS" or mapped ✓ |

---

## Emergency: Disable Sync Again
```bash
railway variables set MONDAY_PERSONAL_SYNC_ENABLED=false \
  MONDAY_AUTO_WRITE_ENABLED=false \
  MONDAY_OUTBOUND_ENABLED=false
```

---

**Full Details:** See `MONDAY-SYNC-FIX.md`
