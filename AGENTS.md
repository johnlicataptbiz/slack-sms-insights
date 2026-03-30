# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Non-Obvious Project Patterns

- Monorepo: Backend in `sms-insights/`, frontend in `frontend/`; root package.json uses workspaces but directories differ
- Integrations: Slack Bolt for bots, Aloware/Monday.com/HubSpot for CRM, OpenAI for AI features
- Database: Railway PostgreSQL; extract URL with `railway variables --service sms-insights --json | python3 -c "import json,sys; d=json.load(sys.stdin); print(d.get('DATABASE_PUBLIC_URL',''))"`
- Logging: Use `pino` for structured logging; avoid `console.log`
- Validation: Prefer `zod` for request validation
- Testing: Backend uses Node test runner with `tsx`; run specific tests like `npm run test:monday-sms-sync`
- Frontend typecheck: Use `npm run typecheck:v2` (tsconfig.v2.json)
- Build: Backend prebuild generates changelog JSON, runs Prisma generate, conditionally builds frontend
- Scripts: Backfill/sync scripts (e.g., `npm run backfill:hubspot`, `npm run sync:monday`) for data maintenance
- Design tokens: Use `frontend/src/styles/design-tokens.ts` exports; CSS vars like `--color-ds-primary-500`
- Figma integration: Fetch design context via MCP `get_design_context(fileKey, nodeId)` before changes; download assets to `public/assets/figma/`
- Component patterns: Prefer `PasswordGate`, `RunList`, `RunDetail`, `SuspenseLoader`; lazy-load via `frontend/src/v2/V2App`
- Styling: Use `var(--color-ds-*)` in CSS files; animations via `--duration-*`, `--shadow-*`, `--radius-*`
- Asset handling: Figma assets via MCP endpoints; no CDN replacements; store in `public/assets/figma/`
- Accessibility: Keyboard focus, aria labels, WCAG AA contrast required