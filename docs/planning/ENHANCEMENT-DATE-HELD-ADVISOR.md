# Enhancement: Date Held & Advisor Field Parsing

## Overview
This enhancement adds parsing of **Date Held** (appointment date) and **Advisor** (contact owner) fields from HubSpot data embedded in Slack message attachments, and populates these fields in Monday.com board items when syncing booked calls.

## Changes Made

### 1. Type Definition Updates

#### `sms-insights/services/booked-calls.ts`
- **Modified `BookedCallAttributionSource` type**: Added `raw: unknown` field to store the complete Slack message payload
- **Updated `getBookedCallAttributionSources` function**: Now includes `raw: c.raw` when building attribution source objects

**Why**: The `raw` field contains the Slack message attachments with HubSpot data, which we need to extract Date Held and Advisor information.

### 2. Monday.com Column Mapping

#### `sms-insights/services/monday-personal-writeback.ts`
- **Modified `PersonalBoardColumnMapping` type**: Added two new fields:
  - `dateHeldColumnId: string | null` - Maps to "Date Held" column (appointment date)
  - `advisorColumnId: string | null` - Maps to "Advisor" column (contact owner)

- **Updated `inferPersonalMapping` function**: Added column detection logic:
  ```typescript
  dateHeldColumnId: findColumnBySignals(columns, ['date held', 'appointment date']),
  advisorColumnId: findColumnBySignals(columns, ['advisor', 'contact owner']),
  ```

- **Updated `coercePersonalMapping`, `mergeMappings`, and `mergePersonalOverrides` functions**: All now handle the new `dateHeldColumnId` and `advisorColumnId` fields

### 3. Data Parsing Logic

#### New Helper Functions in `monday-personal-writeback.ts`

**`parseMDYDate(dateStr: string): string | null`**
- Converts M/D/YY or M/D/YYYY format to YYYY-MM-DD
- Handles 2-digit years (00-50 → 20xx, 51-99 → 19xx)
- Example: "3/17/26" → "2026-03-17"

**`parseDateHeldFromSlackRaw(raw: unknown): string | null`**
- Extracts appointment date from Slack attachment text
- Searches for patterns:
  - `*Next Activity Date*: M/D/YY`
  - `*Date of last meeting booked*: M/D/YY`
- Returns null if no match found

**`parseAdvisorFromSlackRaw(raw: unknown): string | null`**
- Extracts contact owner from Slack attachment text
- Searches for patterns:
  - `*Contact owner*: Name`
  - `*Owner*: Name`
- Handles `<mailto:email|Name>` link format by extracting the display name
- Returns null if no match found

### 4. Column Value Population

#### Updated `toColumnValues` function
Added two new lines at the end of the function:
```typescript
// NEW: Add Date Held and Advisor
const dateHeld = parseDateHeldFromSlackRaw(source.raw);
addColumnValue(values, columnsById, mapping.dateHeldColumnId, dateHeld, { isDate: true });

const advisor = parseAdvisorFromSlackRaw(source.raw);
addColumnValue(values, columnsById, mapping.advisorColumnId, advisor);
```

#### Updated `buildManualSource` function
Added a minimal `raw` structure for manual entries:
```typescript
raw: { attachments: [{ text: params.notes }]},
```

This ensures manual call entries work with the new parsing logic (though they typically won't have Date Held/Advisor data).

## Data Flow

```
Slack Message (with HubSpot attachment)
  ↓
booked_calls table (raw field stores full payload)
  ↓
BookedCallAttributionSource (includes raw field)
  ↓
parseDateHeldFromSlackRaw() & parseAdvisorFromSlackRaw()
  ↓
toColumnValues() (builds Monday.com column data)
  ↓
upsertBookedCallItem() (creates/updates Monday item)
  ↓
Monday.com board (Date Held & Advisor columns populated)
```

## Example HubSpot Slack Attachment Format

```json
{
  "attachments": [
    {
      "text": "...",
      "fallback": "*Name*: John Doe\n*Phone*: +1234567890\n*Email*: john@example.com\n*Contact owner*: <mailto:advisor@example.com|Jane Smith>\n*Next Activity Date*: 3/17/26\n*Date of last meeting booked in meetings tool*: 3/16/26\n..."
    }
  ]
}
```

## Testing

### Manual Testing Steps

1. **Deploy the code to Railway**:
   ```bash
   cd sms-insights
   npm run build
   git add .
   git commit -m "feat: parse Date Held and Advisor from HubSpot Slack attachments"
   git push
   ```

2. **Test with existing data**:
   - Trigger a re-sync of a recent booked call that has HubSpot data
   - Verify Date Held and Advisor fields are populated

3. **Test with new data**:
   - Add a 🏴 reaction to a new booking message in Slack
   - Check Monday.com board to confirm Date Held and Advisor are set

4. **Check logs for parsing errors**:
   ```bash
   railway logs
   ```

### Expected Column Values

| Field | Monday Column Type | Example Value |
|-------|-------------------|---------------|
| Date Held | `date` | `{ date: "2026-03-17" }` |
| Advisor | `text` or `status` | `"Jane Smith"` |

## Rollback Plan

If issues arise, revert the changes:
```bash
git revert HEAD
git push
```

The system will continue to work without these fields; they will simply remain empty on new items.

## Future Enhancements

1. **Add validation**: Ensure parsed dates are in the future (for appointment dates)
2. **Support multiple date formats**: Handle ISO dates, full month names, etc.
3. **Advisor validation**: Cross-reference with a list of known advisors
4. **Error logging**: Add specific logging when parsing fails to help debug data issues

## Monday.com Column IDs

Based on your environment variables:
- **Date Set**: `date_mkznycfs` (when call was booked)
- **Date Held**: `date_mm0g22wa` (appointment date)
- **Advisor**: Column ID will be auto-detected by `inferPersonalMapping()`

If auto-detection fails, you can set explicit column IDs via environment variable:
```bash
MONDAY_PERSONAL_COLUMN_MAP_JSON='{"dateHeldColumnId":"date_mm0g22wa","advisorColumnId":"text_abc123"}'
```

## Related Files

- `sms-insights/services/booked-calls.ts` - Type definition and data retrieval
- `sms-insights/services/booked-calls-store.ts` - Database storage (raw field)
- `sms-insights/services/monday-personal-writeback.ts` - Monday.com sync logic
- `sms-insights/services/monday-client.ts` - Monday.com API client
- `sms-insights/listeners/events/reactions.ts` - Reaction event handler

## Deployment Status

- ✅ Code changes complete
- ⏳ Build and deploy to Railway
- ⏳ Test with real data
- ⏳ Verify Monday.com board updates

---

**Author**: Blackbox AI  
**Date**: 2026-03-17  
**Status**: Ready for Testing
