# Implementation Plan

## Overview
Integrate the full ptbiz_sms_asset_kit/assets image set into the frontend UI so all kit assets are used intentionally across existing V2 and auth surfaces without breaking current behavior.

The current frontend already uses a subset of legacy `sms-kit` assets in `PasswordGate`, `V2Shell`, and `InsightsV2`, but none of the dedicated `ptbiz_sms_asset_kit/` paths are referenced. The implementation will standardize usage around `frontend/public/assets/sms-kit/` by copying missing kit assets into the public folder and then wiring route-aware and component-aware image selection logic across high-visibility UI regions.

Scope includes: (1) asset availability, (2) reusable asset mapping utilities, (3) targeted UI integration in existing components, and (4) thorough verification via build + runtime route checks. The approach minimizes churn by extending existing image rotation patterns rather than introducing a new rendering system.

## Types
No global type-system changes are required; only local typed constants and helper return signatures will be extended for safer asset mapping.

Define local union-like string maps in existing files:
- `type RouteAssetKey = 'insights' | 'inbox' | 'runs' | 'sequences' | 'attribution' | 'rep'`
- `type AssetPath = string`
- Asset map objects:
  - `const routePatternMap: Record<RouteAssetKey, AssetPath>`
  - `const routeHeroMap: Record<RouteAssetKey, AssetPath>`
  - `const dividerRotation: AssetPath[]`
Validation rules:
- Every mapped path must begin with `/assets/sms-kit/`
- Filenames with spaces must be URL-encoded
- Fallback key must always resolve to an existing image path

## Files
Primary modifications focus on frontend source files and public assets.

- New files to be created:
  - `frontend/public/assets/sms-kit/analytics_wave_banner.png` (copied from kit)
  - `frontend/public/assets/sms-kit/arrow_strip_divider.png` (copied from kit)
  - `frontend/public/assets/sms-kit/network_bar_divider.png` (copied from kit)
  - `frontend/public/assets/sms-kit/node_bar_divider.png` (copied from kit)
  - `frontend/public/assets/sms-kit/ptbiz_sms_logo_badge.png` (copied from kit)
  - `frontend/public/assets/sms-kit/ptbiz_sms_pattern.png` (copied from kit)
  - `frontend/public/assets/sms-kit/sms_growth_banner.png` (copied from kit)
  - `frontend/public/assets/sms-kit/sms_growth_hero.png` (copied from kit)
  - `frontend/public/assets/sms-kit/sms_network_pattern.png` (copied from kit)
  - `frontend/public/assets/sms-kit/sms_wave_banner.png` (copied from kit)
  - `frontend/public/assets/sms-kit/wave_sms_divider.png` (copied from kit)

- Existing files to be modified:
  - `frontend/src/components/PasswordGate.tsx`
    - Remove temporary test-day override and restore runtime day logic.
    - Expand banner/divider/logo selection to include kit assets in deterministic rotation.
  - `frontend/src/v2/layout/V2Shell.tsx`
    - Extend route-based pattern/hero mappings to include additional kit banners/patterns.
    - Remove unused constants if not rendered.
  - `frontend/src/v2/pages/InsightsV2.tsx`
    - Add usage of kit banner/pattern assets in page header or section visuals.
  - `frontend/src/v2/v2.css`
    - Add/adjust utility classes for newly used kit pattern/divider backgrounds.
  - `docs/image_integration_summary.md`
    - Update with complete asset-to-component mapping for all kit assets.

- No files deleted or moved.
- No config file changes required.

## Functions
Function updates extend existing helpers without altering core app flow.

- New functions:
  - `getPasswordGateLogoForDay(): string` in `frontend/src/components/PasswordGate.tsx`
    - Rotates between `logo1sms.png` and `ptbiz_sms_logo_badge.png`.
  - `getRouteAssetKey(pathname: string): RouteAssetKey` in `frontend/src/v2/layout/V2Shell.tsx`
    - Normalizes route parsing for map lookups.
  - `getRouteDivider(pathname: string): string` in `frontend/src/v2/layout/V2Shell.tsx`
    - Returns divider asset per route cluster.
  - `getInsightsBannerVariant(): string` in `frontend/src/v2/pages/InsightsV2.tsx`
    - Chooses between analytics/growth/wave banners.

- Modified functions:
  - `getBannerForToday()` in `PasswordGate.tsx`
    - Remove test mode; return day-based banner from expanded set.
  - `getDividerForToday()` in `PasswordGate.tsx`
    - Extend to include `wave_sms_divider`, `arrow_strip_divider`, and bar dividers.
  - `getPatternForRoute(pathname)` in `V2Shell.tsx`
    - Extend to include `ptbiz_sms_pattern` and `sms_network_pattern`.
  - `getHeroBannerForRoute(pathname)` in `V2Shell.tsx`
    - Extend to include `sms_growth_hero`, `sms_growth_banner`, `sms_wave_banner`, `analytics_wave_banner`.

- Removed functions:
  - None.

## Classes
No class-based TypeScript/JS classes are introduced or removed.

React function components will be modified:
- `PasswordGate` (`frontend/src/components/PasswordGate.tsx`): swap in additional asset selectors.
- `V2Shell` (`frontend/src/v2/layout/V2Shell.tsx`): route-to-asset mapping refinements.
- `InsightsV2` (`frontend/src/v2/pages/InsightsV2.tsx`): additional section visuals using kit assets.

## Dependencies
No new package dependencies are required.

Use existing toolchain:
- Vite asset serving from `frontend/public`
- Existing React + TypeScript runtime
- Existing framer-motion/lucide components for rendering wrappers where needed

## Testing
Testing will validate that every kit asset is both referenced in code and visible/served correctly at runtime.

Required checks:
1. Static reference audit:
   - Search for each asset filename in `frontend/src` and confirm at least one usage.
2. Build validation:
   - Run `cd frontend && npm run build` and confirm no missing asset warnings.
3. Runtime validation (frontend):
   - Launch app and verify affected pages/components:
     - PasswordGate
     - V2 sidebar on Insights, Inbox, Runs, Sequences
     - InsightsV2 banner sections
   - Confirm images render and no broken links in console.
4. Responsive check:
   - Verify sidebar/image behavior under collapsed/mobile conditions.
5. Documentation check:
   - Ensure `docs/image_integration_summary.md` lists all kit assets and exact usage targets.

## Implementation Order
Implement by first making assets available, then wiring deterministic mapping logic, then validating and documenting.

1. Copy missing `ptbiz_sms_asset_kit/assets/*` files into `frontend/public/assets/sms-kit/`.
2. Update `PasswordGate.tsx` to remove test override and integrate expanded banner/divider/logo rotation.
3. Update `V2Shell.tsx` route-key mapping + pattern/hero/divider usage for all route groups.
4. Update `InsightsV2.tsx` to render kit banners/patterns so remaining unassigned assets are consumed.
5. Update `v2.css` classes for any new pattern/divider presentation hooks.
6. Run static usage search to confirm each kit asset appears in code references.
7. Run `npm run build` and perform route-by-route browser validation.
8. Update `docs/image_integration_summary.md` with final asset matrix and test evidence.
