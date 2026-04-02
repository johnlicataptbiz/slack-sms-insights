# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Non-Obvious Project Patterns

- Testing: Backend uses Node test runner with `tsx`; run specific tests like `npm run test:monday-sms-sync`
- Frontend typecheck: Use `npm run typecheck:v2` (tsconfig.v2.json)
- Build: Backend prebuild generates changelog JSON, runs Prisma generate, conditionally builds frontend
- Scripts: Backfill/sync scripts (e.g., `npm run backfill:hubspot`, `npm run sync:monday`) for data maintenance
- Design tokens: Use `frontend/src/styles/design-tokens.ts` exports; CSS vars like `--color-ds-primary-500`
- Figma integration: Fetch design context via MCP `get_design_context(fileKey, nodeId)` before changes; download assets to `public/assets/figma/`
- Styling: Use `var(--color-ds-*)` in CSS files; animations via `--duration-*`, `--shadow-*`, `--radius-*`
- Asset handling: Figma assets via MCP endpoints; no CDN replacements; store in `public/assets/figma/`