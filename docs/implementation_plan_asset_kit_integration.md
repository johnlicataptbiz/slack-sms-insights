# PT Biz SMS Asset Kit Integration - Implementation Plan

## Status
**Phase**: Complete Investigation ✅  
**Current**: Creating Implementation Plan  
**Next**: Execute plan → Commit → Deploy → Verify

## 1. Asset Inventory (23 assets, ~60MB total)
```
✅ In use (V2Shell/InsightsV2): logo1sms.png, patternsms.png, herobannersms.png, banner3.png, divider.png, divider3.png, smsbanner1.png, smspattern2.png, analytics_wave_banner.png, sms_growth_banner.png, sms_wave_banner.png
❌ Unused opportunities:
  - Banners: banner2.png, sms_growth_hero.png
  - Dividers: divider 3 sms.png, divider2.png, arrow_strip_divider.png, network_bar_divider.png, node_bar_divider.png, wave_sms_divider.png  
  - Patterns: ptbiz_sms_pattern.png, sms_network_pattern.png
  - Logos: ptbiz_sms_logo_badge.png
  - ChatGPT: ChatGPT Image Mar 13, 2026, 03_17_26 PM.png
```
**External**: `/Users/jl/Downloads/gridcoachbg.png` (29MB PNG 5056x3368 → optimize → `gridcoachbg.webp`)

## 2. Optimization Pipeline (60MB → &lt;5MB)
```
1. ALL PNGs → WebP (80% quality) using ImageMagick
2. Resize banners: 1920x300px max
3. Resize dividers: 1920x80px max  
4. Resize patterns: 400x400px tiles
5. Compress logos: 256x256px
6. gridcoachbg.png → 1920x1274 WebP (4:3 aspect)
```
**Commands**:
```bash
cd frontend/public/assets/sms-kit/
magick mogrify -format webp -quality 80 *.png
magick gridcoachbg.png -resize 1920x -quality 80 gridcoachbg.webp
```

## 3. Page-by-Page Integration Strategy

### V2Shell.tsx (Enhance existing)
```
✅ Hero rotation → Add banner2.png, sms_growth_hero.png
✅ Pattern rotation → Add ptbiz_sms_pattern.png, sms_network_pattern.png  
✅ Logo variants → ptbiz_sms_logo_badge.png (sidebar alt)
✅ Dividers → network_bar_divider.png (topbar), node_bar_divider.png (sidebar)
```

### InsightsV2.tsx (Enhance + gridcoachbg)
```
✅ Hero banners → Complete 7-day rotation cycle
➕ Section dividers: wave_sms_divider.png (KPI→Setter), arrow_strip_divider.png (Funnel→Monday)
➕ Grid background: gridcoachbg.webp (`.V2PageSection--grid::before`)
➕ Metric cards: SMS variant borders on high-performers
```

### SequencesV2.tsx (NEW - Full integration)
```
➕ Hero: sms_growth_hero.png + "Sequences Performance" overlay
➕ Patterns: ptbiz_sms_pattern.png (table container)
➕ Dividers: divider 3 sms.png (above/below table)
➕ Table headers: SMS accent gradients
➕ Qualification breakdown: ChatGPT diagram as hero
```

### RunsV2.tsx (NEW - Full integration)
```
➕ Hero: banner2.png + "Run History & Reports"
➕ Patterns: sms_network_pattern.png (timeline container)
➕ Dividers: node_bar_divider.png (saved views), divider2.png (run detail)
➕ Cards: SMS variant for active runs
```

### InboxV2.tsx (NEW - Subtle integration) 
```
➕ Patterns: subtle sms_network_pattern.png (0.03 opacity, conversation list)
➕ Dividers: arrow_strip_divider.png (list→detail panel)
➕ Topbar: network_bar_divider.png (template drawer trigger)
```

### RepV2.tsx (NEW - Full integration)
```
➕ Hero: ptbiz_sms_logo_badge.png + rep name
➕ Patterns: patternsms.png (metrics grid)
➕ Dividers: wave_sms_divider.png (metrics→risk flags)
➕ Risk cards: SMS critical/positive variants
```

### AttributionV2.tsx (NEW - Full integration)
```
➕ Hero: analytics_wave_banner.png + "Booking Sources"
➕ Patterns: ptbiz_sms_pattern.png (source breakdown)
➕ Dividers: divider3.png (attributed→unattributed)
➕ Audit table: SMS warning variant rows
```

## 4. CSS Architecture (Extend v2.css)
```
✅ Existing: .sms-hero-banner, .sms-divider, .sms-pattern-bg, .sms-pattern-bg--alt
➕ New:
  .sms-grid-bg::before { background-image: url('/assets/sms-kit/gridcoachbg.webp') }
  .V2PageSection--sms { @extend .sms-pattern-bg }
  .V2MetricCard--sms-critical { border: 2px solid var(--v2-critical) }
  [data-theme="dark"] .sms-pattern-bg::before { opacity: 0.12 }
```

## 5. Implementation Sequence (TODO.md)
```
Phase 1: Optimize assets (magick) → 20 WebP files + gridcoachbg.webp
Phase 2: V2Shell enhancements (4 assets)
Phase 3: InsightsV2 gridcoachbg + dividers (2 assets) 
Phase 4: SequencesV2 full integration (4 assets)
Phase 5: RunsV2 full integration (4 assets)
Phase 6: InboxV2 subtle (3 assets)
Phase 7: RepV2 full (4 assets)
Phase 8: AttributionV2 full (3 assets)
Phase 9: CSS polish + dark mode + reduced-motion
Phase 10: Build → Commit → Deploy → Browser verify
```

## 6. Success Metrics
```
✅ 100% asset utilization (23/23)
✅ &lt;5MB total size (from 60MB)
✅ All 6 pages have SMS branding
✅ Dark mode compatible
✅ Reduced motion compliant
✅ Vite build passes
✅ Vercel deploys successfully
✅ Visual verification: hero→pattern→divider flow on all pages
```

## 7. Risks & Mitigations
```
Risk: 29MB gridcoachbg breaks build
  → Resize + WebP + lazy loading

Risk: CSS specificity conflicts  
  → !important only on ::before backgrounds

Risk: Mobile hero banners too tall
  → max-height + object-fit: cover

Risk: Dark mode pattern opacity wrong
  → Separate [data-theme="dark"] rules
