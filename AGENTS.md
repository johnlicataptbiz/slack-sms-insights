# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Stack & Structure
- Monorepo with npm workspaces: `apps/backend` (ptbizsms-api) + `apps/frontend` (ptbizsms-dashboard-unified)
- Backend: Express + Prisma 7 + PostgreSQL, runs via `tsx` (not compiled during dev)
- Frontend: React 19 + Vite 6 + Tailwind v3 + Radix UI, V2 dashboard in `frontend/src/v2/`
- Design tokens: `frontend/src/styles/tokens.css` (brand) + `frontend/src/v2/v2.css` (V2 system)

## Commands
- `npm run dev` - runs both backend + frontend concurrently
- `npm run dev:backend` / `npm run dev:frontend` - single workspace dev
- Backend tests: `npm run test:monday-sms-sync` (Node test runner with tsx, pattern: `tests/**/*.test.ts`)
- Frontend tests: `npm run test` (Vitest)
- Frontend typecheck: `npm run typecheck:v2` (uses tsconfig.v2.json)
- Backend lint: `npx @biomejs/biome check *.ts listeners services tests api`
- Frontend lint: `npx @biomejs/biome check src`
- Prisma: `npm run prisma:generate` (uses `prisma.config.ts` in backend root)
- Deploy migrations: `npm run migrate:deploy` (custom script in `apps/backend/scripts/deploy-migrations.ts`)

## Code Style
- Biome: 2-space indent, single quotes, 120 line width, LF line endings
- Backend biome rules: `noParameterAssign: error`, `useAsConstAssertion: error`, `noAssignInExpressions: off`
- Use optional chaining for potentially undefined objects (e.g., `context?.includes`)
- Prefix unused params with `_` (e.g., `_req`)
- Import alias: `@/` resolves to `frontend/src/`, `@/v2/` for V2 components

## Critical Patterns
- Backend uses ESM (`"type": "module"` in package.json) - no `require()`, use `import`
- Prisma config at `apps/backend/prisma.config.ts` loads `DATABASE_URL` from env via dotenv
- Frontend CSS: use `cn()` from `@/lib/utils` for class merging, `cva` for component variants
- Figma assets: store in `public/assets/figma/`, fetch via MCP `get_design_context(fileKey, nodeId)`
- Backfill scripts: `npm run backfill:hubspot`, `npm run sync:monday`, etc. in backend workspace
- Railway deploys backend (config: `config/railway.toml`), Vercel deploys frontend (config: `config/vercel.json`)
