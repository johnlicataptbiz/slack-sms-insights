# Asset Kit UI Integration — TODO

## Phase 1: Asset Optimization ✅
- [x] Install ImageMagick
- [x] Convert all 23 PNGs to WebP (60MB → 2.2MB)
- [x] Optimize gridcoachbg.png (29MB → 130KB WebP)

## Phase 2: V2Shell Enhancements ✅
- [x] Update all asset URLs from .png to .webp
- [x] Add banner2, ptbiz_sms_pattern, sms_network_pattern, sms_growth_hero to rotation
- [x] Expand getPatternForRoute() and getHeroBannerForRoute()

## Phase 3: InsightsV2 Enhancement
- [ ] Migrate banner URLs from .png to .webp
- [ ] Add section dividers between major sections
- [ ] Add grid background to page section
- [ ] Complete 7-day banner rotation

## Phase 4: SequencesV2 Integration
- [ ] Add hero banner with overlay
- [ ] Add pattern background to table container
- [ ] Add section dividers

## Phase 5: RunsV2 Integration
- [ ] Add hero banner
- [ ] Add pattern background to timeline

## Phase 6: RepV2 Integration
- [ ] Add hero banner with rep name
- [ ] Add section dividers between metrics and risk flags

## Phase 7: AttributionV2 Integration
- [ ] Add hero banner
- [ ] Add section dividers

## Phase 8: CSS Utility Classes
- [ ] Add .sms-grid-bg utility class
- [ ] Add .sms-section-divider utility
- [ ] Add .V2HeroBanner--overlay variant
- [ ] Add dark mode overrides for new patterns
- [ ] Add reduced-motion support

## Phase 9: Cleanup
- [x] Delete dead legacy files (LegacyApp.tsx, pages/*.tsx)
- [ ] Verify tsc --noEmit (pre-existing errors only)
- [ ] Verify vite build passes

## Phase 10: Ship
- [ ] Git commit all changes
- [ ] Push to remote
- [ ] Deploy to Vercel
- [ ] Browser verify
