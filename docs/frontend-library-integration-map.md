# Frontend Library Integration Map

Last updated: March 2, 2026

## Purpose
Turn the March 2 dependency spike into a staged implementation plan with explicit product intent per library.

## Current Status

Integrated in product code now:
- `react-resizable-panels`: Inbox composer split-pane resize with persisted layout.
- `vaul`: KPI definitions drawer.
- `cmdk`: global command palette.
- `@tanstack/react-virtual`: Inbox conversation list virtualization.
- `@formkit/auto-animate`: animated list transitions.
- `@radix-ui/react-alert-dialog`, `@radix-ui/react-switch`, `@radix-ui/react-tabs`: Inbox interaction primitives.

Installed but not yet productized:
- `@floating-ui/react`
- `@tanstack/react-table`
- `react-day-picker`
- `react-resizable-panels` advanced patterns (nested panes, saved presets)
- `ai` (Vercel AI SDK)
- `three`, `@react-three/fiber`, `@react-three/drei`
- Unused Radix primitives from the bundle install (`accordion`, `popover`, `select`, `toast`, etc.)

## Integration Backlog (Ordered)

1. Table foundation (`@tanstack/react-table`)
- Target: `RunsV2` and `SequencesV2` dense tables.
- Outcome: sortable, filterable, column-visibility-controlled data tables.

2. Date UX (`react-day-picker` + Radix popover)
- Target: Inbox snooze/date controls and analytics date-range filters.
- Outcome: consistent calendar picker with timezone-safe day boundaries.

3. Overlay correctness (`@floating-ui/react`)
- Target: template dropdown and future contextual menus in Inbox.
- Outcome: collision-aware positioning, scroll-safe overlays, keyboard-safe focus handling.

4. AI workflow layer (`ai`)
- Target: draft generation and reply refinement flow in Inbox.
- Outcome: structured tool-calling pipeline and streaming draft UX.

5. 3D/visualization layer (`three`, `@react-three/fiber`, `@react-three/drei`)
- Target: optional Insights visual module only.
- Outcome: isolated experiment behind route/flag; no Inbox dependency.

## Rules For Future Library Adds

- No dependency without a linked feature slice and acceptance criteria.
- No “bulk install” commits; add libraries in the same PR where they are first used.
- Every slice must pass `npm run typecheck:v2` and `npm run build` before merge.
