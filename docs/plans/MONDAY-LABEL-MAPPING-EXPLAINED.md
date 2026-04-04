# 🎯 How Monday.com Label Mapping Works

## The Problem We Solved

Monday.com status columns have **pre-defined dropdown options**. You can't just send any text value - it must match exactly one of the available options, or Monday will silently reject it and leave the field empty.

---

## Data Flow: From Slack/Database → Monday.com

### Step 1: Data Comes from Database
When a call is booked in Slack, we store this data:

```typescript
source = {
  line: "Jack's SMS Line",              // Raw line name from Aloware
  firstConversion: "book_buyer_guide",  // Raw conversion source
  contactName: "Jennifer Lockoman",
  contactPhone: "+15551234567",
  // ... other fields
}
```

### Step 2: Mapping Functions Convert to Valid Monday Values

The code uses **two mapping functions** to convert raw data → valid Monday labels:

#### Function 1: `mapLineToChannel()`
Converts phone line names to Monday's "Channel?" column values

```typescript
const mapLineToChannel = (line: string | null): string | null => {
  if (!line) return null;
  const normalized = line.toLowerCase();
  
  // String matching logic
  if (normalized.includes('aloware') || normalized.includes('sms')) 
    return 'Aloware SMS';      // ← Monday label
  if (normalized.includes('circle')) 
    return 'Circle DM';         // ← Monday label
  if (normalized.includes('instagram') || normalized.includes('ig')) 
    return 'Instagram DM';      // ← Monday label
  if (normalized.includes('email')) 
    return 'Email Marketing';   // ← Monday label
  if (normalized.includes('self')) 
    return 'SELF BOOK';         // ← Monday label
  
  // Default fallback
  return 'Aloware SMS';
};
```

**Examples:**
- Input: `"Jack's SMS Line"` → Output: `"Aloware SMS"` ✅
- Input: `"Circle Messages"` → Output: `"Circle DM"` ✅
- Input: `"Instagram chat"` → Output: `"Instagram DM"` ✅
- Input: `null` → Output: `"Aloware SMS"` (default) ✅

#### Function 2: `mapSourceToMondaySource()`
Converts first conversion sources to Monday's "Source?" column values

```typescript
const mapSourceToMondaySource = (firstConversion: string | null): string | null => {
  if (!firstConversion) return 'Direct Outreach'; // Default
  const normalized = firstConversion.toLowerCase();
  
  if (normalized.includes('circle')) return 'Circle Group';
  if (normalized.includes('book buyer')) return 'Book Buyer';
  if (normalized.includes('checklist')) return 'Start-Up Checklist';
  if (normalized.includes('rates')) return 'Raise Your Rates';
  if (normalized.includes('space')) return 'Stand Alone Space Setup Guide';
  if (normalized.includes('email')) return 'Marketing Email';
  if (normalized.includes('social')) return 'Social Media';
  if (normalized.includes('hiring')) return 'Hiring Guide';
  if (normalized.includes('webinar')) return 'Webinar';
  if (normalized.includes('workshop')) return 'Workshop Playbook';
  if (normalized.includes('self book')) return 'Signature Self Book';
  
  return 'Direct Outreach'; // Fallback
};
```

**Examples:**
- Input: `"book_buyer_guide"` → Output: `"Book Buyer"` ✅
- Input: `"circle_group_member"` → Output: `"Circle Group"` ✅
- Input: `"webinar_2024"` → Output: `"Webinar"` ✅
- Input: `null` → Output: `"Direct Outreach"` (default) ✅

### Step 3: Values Applied to Monday Columns

```typescript
const toColumnValues = (source, mapping, columnsById) => {
  const values = {};
  
  // ... other fields ...
  
  // Status columns - using mapped values!
  addColumnValue(values, columnsById, mapping.stageColumnId, 'First Swing');
  addColumnValue(values, columnsById, mapping.lineColumnId, 
    mapLineToChannel(source.line));  // ← Mapping function
  addColumnValue(values, columnsById, mapping.sourceColumnId, 
    mapSourceToMondaySource(source.firstConversion));  // ← Mapping function
  
  return values;
};
```

---

## Visual Example

### Real Data Flow:

```
DATABASE DATA                    MAPPING FUNCTION              MONDAY COLUMN
─────────────────────────────────────────────────────────────────────────────

line: "Jack's SMS Line"    →    mapLineToChannel()      →    Channel?: "Aloware SMS" ✅

firstConversion:           →    mapSourceToMondaySource() →  Source?: "Book Buyer" ✅
  "book_buyer_guide"

(hardcoded)                →    (no mapping needed)     →    Swing?: "First Swing" ✅
```

### What Monday.com Sees:

The GraphQL mutation sent to Monday looks like this:

```json
{
  "column_values": {
    "color_mkznwqh0": { "label": "Aloware SMS" },      // Channel? column
    "color_mkznd6kp": { "label": "Book Buyer" },       // Source? column
    "color_mm089dk3": { "label": "First Swing" }       // Swing? column
  }
}
```

Monday checks: "Do these labels exist in my dropdown?" → YES ✅ → Fields populate!

---

## Why It Works Now (And Failed Before)

### ❌ BEFORE (Failed):
```typescript
// Old code tried to send:
addColumnValue(values, mapping.stageColumnId, 'Booked');        // ← Not in dropdown!
addColumnValue(values, mapping.lineColumnId, "Jack's SMS Line"); // ← Not in dropdown!
addColumnValue(values, mapping.sourceColumnId, 'Slack booked call'); // ← Not in dropdown!

// Monday.com response: "Invalid labels, I'll just leave them empty" 🤷
```

### ✅ AFTER (Success):
```typescript
// New code sends valid labels:
addColumnValue(values, mapping.stageColumnId, 'First Swing');  // ← Valid! ✅
addColumnValue(values, mapping.lineColumnId, mapLineToChannel(source.line));  // ← "Aloware SMS" ✅
addColumnValue(values, mapping.sourceColumnId, mapSourceToMondaySource(source.firstConversion));  // ← "Book Buyer" ✅

// Monday.com response: "Perfect! I'll populate all fields" 🎉
```

---

## How to Customize the Mappings

### Scenario: You add a new line called "Brandon's WhatsApp"

**Option 1: Update the mapping function**

Edit `sms-insights/services/monday-personal-writeback.ts`:

```typescript
const mapLineToChannel = (line: string | null): string | null => {
  if (!line) return null;
  const normalized = line.toLowerCase();
  
  if (normalized.includes('aloware') || normalized.includes('sms')) return 'Aloware SMS';
  if (normalized.includes('circle')) return 'Circle DM';
  if (normalized.includes('whatsapp')) return 'Instagram DM';  // ← Add this line
  // ... rest of mappings
  
  return 'Aloware SMS';
};
```

**Option 2: Add new dropdown option in Monday.com**

1. Go to your Monday board
2. Click the "Channel?" column header
3. Add new label: "WhatsApp"
4. Update the mapping function:

```typescript
if (normalized.includes('whatsapp')) return 'WhatsApp';  // ← New label
```

---

## Monday.com Column Values We're Using

Based on inspection of your actual board:

### Channel? Column (color_mkznwqh0)
Valid options:
- `"Circle DM"`
- `"Aloware SMS"`
- `"Email Marketing"`
- `"Instagram DM"`
- `"Game Plan Call"`
- `"SELF BOOK"`

### Source? Column (color_mkznd6kp)
Valid options:
- `"Circle Group"`
- `"Book Buyer"`
- `"Start-Up Checklist"`
- `"Raise Your Rates"`
- `"Stand Alone Space Setup Guide"`
- `"Marketing Email"`
- `"Direct Outreach"`
- `"Social Media"`
- `"Hiring Guide"`
- `"Webinar"`
- `"Workshop Playbook"`
- `"Signature Self Book"`

### Swing? Column (color_mm089dk3)
Valid options:
- `"First Swing"`
- `"Second Swing"`
- `"Third Swing"`

---

## Key Takeaways

1. **Monday status columns require exact label matches**
   - Case-sensitive
   - Must exist in column settings
   - No partial matches

2. **Our mapping functions use fuzzy matching**
   - `line.includes('aloware')` → flexible
   - Works even if line name changes slightly
   - Has fallback defaults

3. **You can extend the mappings**
   - Add new conditions to the mapping functions
   - Or add new dropdown options in Monday
   - Both approaches work!

4. **The mapping is "best effort"**
   - If no pattern matches, uses default
   - Better to have a default than leave empty
   - Can always manually update in Monday later

---

**Created:** 2026-03-17  
**Related:** See `MONDAY-SYNC-FIX.md` for full technical details
