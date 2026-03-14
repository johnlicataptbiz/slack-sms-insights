# Implementation Plan

## Overview
Incorporate SMS-themed visual assets from `ptbiz_sms_asset_kit/assets/` (23 PNG/webp: banners, dividers, patterns, logos) throughout the frontend dashboard (v2 pages) to elevate visual standard. Focus on V2 dashboard pages (InsightsV2.tsx, SequencesV2.tsx) using modern CSS (backgrounds, dividers, hero banners, patterns). Assets copied to `frontend/public/assets/sms-kit/`.

High-level: Add responsive hero banners, section dividers, subtle patterns, logo badges. Preserve V2Primitives clean design; enhance via CSS classes/images. Mobile-first, performant (no heavy transforms).

## Types
No new types needed.

## Files
**New**:
- `frontend/public/assets/sms-kit/` (already copied, 23 assets).

**Modified**:
- `frontend/src/v2/v2.css` (add SMS theme classes: .sms-hero-banner, .sms-divider, .sms-pattern-bg, .sms-logo-badge).
- `frontend/src/App.tsx` (add sms-kit path imports if dynamic).
- `frontend/src/v2/pages/InsightsV2.tsx` (add hero banner, metric dividers, pattern bg).
- `frontend/src/v2/pages/SequencesV2.tsx` (similar).
- `frontend/src/v2/layout/V2Shell.tsx` (sidebar logo badge, header pattern).
- `frontend/src/v2/components/V2Primitives.tsx` (add variant props for themed cards/panels).

**No deletions**.

## Functions
No function changes (pure UI/CSS).

## Classes
No class changes (React functional).

## Dependencies
No new deps (images/CSS).

## Testing
Manual: Browser devtools responsive test, Lighthouse perf/accessibility on dashboard pages.

## Implementation Order
1. Create `frontend/src/v2/v2.css` theme additions.
2. Update InsightsV2.tsx (primary dashboard).
3. Update SequencesV2.tsx.
4. Update V2Shell.tsx (global).
5. Update V2Primitives.tsx variants.
6. Build/test frontend.

