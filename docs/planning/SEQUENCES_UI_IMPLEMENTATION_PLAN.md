# SequencesV2 UI Improvements - Implementation Plan

## Overview
This plan implements the 6 prioritized UI improvements from the assessment document to transform the SequencesV2 page from information overload to an executive-friendly, navigable dashboard.

## Implementation Priority

| Priority | Feature | Effort | Impact | Status |
|----------|---------|--------|--------|--------|
| 🔴 High | Hero Summary Section | 2h | High | ⏳ Planned |
| 🔴 High | Tabbed Navigation | 3h | High | ⏳ Planned |
| 🟡 Medium | Table Improvements | 4h | Medium | ⏳ Planned |
| 🟡 Medium | Export Functionality | 2h | Medium | ⏳ Planned |
| 🟢 Low | Mobile Responsiveness | 3h | Medium | ⏳ Planned |
| 🟢 Low | Per-Section Loading | 2h | Low | ⏳ Planned |

---

## 1. Hero Summary Section (Priority: High)

### Goal
Create a top-level executive summary that shows the 3 most important metrics prominently.

### Implementation Details

**New Component: `V2HeroSummary`**
- Location: Add to `frontend/src/v2/components/V2Primitives.tsx`
- Features:
  - Large primary metric (Booked Calls) with change indicator
  - Two secondary metrics (Reply Rate, Active Sequences)
  - Gradient background with accent border
  - Responsive grid layout

**CSS Additions to `frontend/src/v2/v2.css`:**
```css
.hero-panel {
  background: linear-gradient(135deg, var(--v2-surface) 0%, var(--v2-surface-elevated) 100%);
  border-left: 4px solid var(--v2-accent);
}

.hero-metrics {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr;
  gap: 2rem;
  padding: 1.5rem;
}

.hero-metric.primary .hero-value {
  font-size: 3rem;
  font-weight: 700;
  color: var(--v2-accent);
}
```

**Integration in `SequencesV2.tsx`:**
- Add after the header, before the existing KPI grid
- Use existing `kpis` data from useMemo hook
- Calculate period-over-period change (mock for now, can be enhanced later)

---

## 2. Tabbed Navigation (Priority: High)

### Goal
Replace the current flat layout with tabbed sections to reduce scroll fatigue.

### Implementation Details

**Tab Structure:**
1. **Overview** - Hero summary + KPI cards + Trend sparklines
2. **Sequences** - Performance table with all filtering/sorting
3. **Qualification** - Lead qualification breakdown + Reply timing
4. **Attribution** - Booking attribution + Compliance + Timing panels

**State Management:**
```tsx
type TabKey = 'overview' | 'sequences' | 'qualification' | 'attribution';
const [activeTab, setActiveTab] = useState<TabKey>('overview');
```

**New Component: `V2TabNav`**
- Location: Add to `frontend/src/v2/components/V2Primitives.tsx`
- Sticky positioning below header
- Active tab indicator with animation
- Responsive: horizontal scroll on mobile

**CSS Additions:**
```css
.V2TabNav {
  display: flex;
  gap: 0.5rem;
  padding: 0.5rem;
  background: rgba(255, 255, 255, 0.8);
  border-radius: 999px;
  border: 1px solid rgba(7, 19, 36, 0.1);
  position: sticky;
  top: var(--v2-topbar-height);
  z-index: 20;
  backdrop-filter: blur(10px);
}

.V2TabNav__btn {
  padding: 0.5rem 1rem;
  border-radius: 999px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-weight: 600;
  transition: all 150ms ease;
}

.V2TabNav__btn.is-active {
  background: var(--v2-accent);
  color: white;
}
```

**Content Organization per Tab:**

| Tab | Content Sections |
|-----|-----------------|
| Overview | Hero Summary, KPI Grid, Channel Split, Trend Sparklines |
| Sequences | Performance Table with all controls |
| Qualification | Lead Qualification Breakdown, Reply Timing Panel |
| Attribution | Booking Attribution Panel, Compliance Panel, Timing Panel |

---

## 3. Table Improvements (Priority: Medium)

### Goal
Add column visibility toggle, sorting, and search filtering to the Sequence Performance Table.

### Implementation Details

**Enhancements to `SequencePerformanceTable.tsx`:**

**Column Visibility Toggle:**
```tsx
const [visibleColumns, setVisibleColumns] = useState({
  messages: true,
  replyRate: true,
  bookings: true,
  bookingRate: true,
  optOuts: false,    // hidden by default
  audit: false,      // hidden by default
  repSplit: true,
});
```

**Sorting:**
```tsx
type SortKey = 'replyRate' | 'bookings' | 'messages' | 'bookingRate' | 'optOutRate';
const [sortBy, setSortBy] = useState<SortKey>('bookings');
const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

const sortedRows = useMemo(() => {
  const sorted = [...mergedRows].sort((a, b) => {
    const aVal = a[sortBy] ?? 0;
    const bVal = b[sortBy] ?? 0;
    return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
  });
  return sorted;
}, [mergedRows, sortBy, sortOrder]);
```

**Search/Filter:**
```tsx
const [searchQuery, setSearchQuery] = useState('');
const filteredRows = sortedRows.filter(r => 
  r.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
  r.leadMagnet.toLowerCase().includes(searchQuery.toLowerCase())
);
```

**UI Controls:**
- Search input with debounce
- Column visibility chips (toggle buttons)
- Sort dropdown (column + direction)
- Results count indicator

---

## 4. Export Functionality (Priority: Medium)

### Goal
Add CSV export capability for sequence data.

### Implementation Details

**New Utility: `frontend/src/utils/export.ts`**
```typescript
export function exportToCSV(
  data: MergedSeqRow[],
  filename: string
) {
  const headers = [
    'Sequence',
    'Lead Magnet',
    'Version',
    'Messages Sent',
    'Reply Rate %',
    'Booked Calls',
    'Booking Rate %',
    'Opt-outs',
    'Opt-out Rate %'
  ];
  
  const rows = data.map(r => [
    r.label,
    r.leadMagnet,
    r.version,
    r.messagesSent,
    r.replyRatePct.toFixed(1),
    r.canonicalBookedCalls,
    r.bookingRatePct.toFixed(1),
    r.optOuts,
    r.optOutRatePct.toFixed(1)
  ]);
  
  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${cell}"`).join(','))
    .join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
```

**Integration:**
- Add "Export CSV" button to table header controls
- Filename format: `sequences-{mode}-${date}.csv`
- Only exports currently filtered/sorted rows

---

## 5. Mobile Responsiveness (Priority: Medium)

### Goal
Improve mobile experience with better stacking and touch targets.

### Implementation Details

**CSS Media Queries (add to v2.css):**

```css
@media (max-width: 768px) {
  /* Hero metrics stack vertically */
  .hero-metrics {
    grid-template-columns: 1fr;
    text-align: center;
    gap: 1rem;
    padding: 1rem;
  }
  
  .hero-metric.primary .hero-value {
    font-size: 2.5rem;
  }
  
  /* Tab nav becomes horizontally scrollable */
  .V2TabNav {
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
  }
  
  .V2TabNav::-webkit-scrollbar {
    display: none;
  }
  
  /* KPI cards 2-column grid */
  .V2MetricsGrid {
    grid-template-columns: 1fr 1fr;
  }
  
  /* Table becomes card-based on small screens */
  .V2Table--sequences {
    display: block;
  }
  
  .V2Table--sequences thead {
    display: none;
  }
  
  .V2Table--sequences tbody tr {
    display: block;
    margin-bottom: 1rem;
    border: 1px solid rgba(7, 19, 36, 0.1);
    border-radius: 12px;
    padding: 1rem;
  }
  
  .V2Table--sequences td {
    display: flex;
    justify-content: space-between;
    padding: 0.5rem 0;
    border-bottom: 1px solid rgba(7, 19, 36, 0.05);
  }
  
  .V2Table--sequences td::before {
    content: attr(data-label);
    font-weight: 600;
    color: var(--v2-muted);
  }
  
  /* Larger touch targets */
  .V2TabNav__btn {
    padding: 0.75rem 1.25rem;
    min-height: 44px;
  }
  
  .V2TableActions__chip {
    padding: 0.4rem 0.75rem;
    min-height: 36px;
  }
}
```

---

## 6. Per-Section Loading (Priority: Low)

### Goal
Replace full-page skeleton with granular section loading states.

### Implementation Details

**Current State:**
- Full page shows `SkeletonDashboard` while loading

**New Approach:**
- Main content loads immediately when core data (salesMetrics, scoreboard) is ready
- Secondary sections show individual skeletons while their data loads
- Sequence qualification section already has this pattern (reference implementation)

**Implementation Pattern:**
```tsx
// For each section that depends on secondary data:
<V2Panel title="Lead Qualification by Sequence">
  {sequenceQualQuery.isLoading ? (
    <V2Skeleton height={200} />
  ) : (
    <SequenceQualificationBreakdown items={sequenceQualQuery.data?.data?.items ?? []} />
  )}
</V2Panel>
```

**Sections to Update:**
- Reply Timing Panel (if timing data is loading)
- Sequence Qualification (already done - use as reference)
- Booking Attribution (if attribution data is loading)

---

## Files to Modify

| File | Changes |
|------|---------|
| `frontend/src/v2/pages/SequencesV2.tsx` | Add hero section, tab navigation, reorganize content |
| `frontend/src/v2/components/V2Primitives.tsx` | Add V2HeroSummary, V2TabNav components |
| `frontend/src/v2/components/SequencePerformanceTable.tsx` | Add sorting, filtering, column visibility |
| `frontend/src/v2/v2.css` | Add all new CSS classes |
| `frontend/src/utils/export.ts` | Create new export utility |

---

## Implementation Order

1. **Phase 1: Foundation** (Start here)
   - Create export utility
   - Add CSS classes for hero and tabs
   - Add V2HeroSummary and V2TabNav components

2. **Phase 2: Layout** 
   - Reorganize SequencesV2.tsx with tab structure
   - Implement hero summary section
   - Add per-section loading states

3. **Phase 3: Table Enhancements**
   - Add sorting to SequencePerformanceTable
   - Add search filtering
   - Add column visibility toggle
   - Add export button

4. **Phase 4: Polish**
   - Mobile responsiveness
   - Animation refinements
   - Testing and bug fixes

---

## Success Metrics

- [ ] Hero summary displays 3 key metrics prominently
- [ ] Tab navigation reduces scroll depth by 60%+
- [ ] Table supports sorting by all numeric columns
- [ ] Table supports search by sequence name/lead magnet
- [ ] CSV export downloads filtered data correctly
- [ ] Mobile view stacks content appropriately
- [ ] No full-page skeleton on secondary data loading

---

## Notes

- All changes maintain backward compatibility with existing data structures
- Uses existing V2 design system (colors, typography, spacing)
- Follows established patterns from other V2 components
- LocalStorage persistence for tab state and column visibility (optional enhancement)
