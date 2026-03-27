# AGENTS.md

This file provides guidance to agents when working with code in this repository.

## Project Overview

PT Biz SMS Insights is a real-time SMS analytics platform with:
- Backend: Node.js 22 + TypeScript (Express + Slack Bolt) in `sms-insights/`
- Frontend: React 19 + Vite + Tailwind in `frontend/`
- Data: PostgreSQL via Prisma
- Deployments: Railway (backend) + Vercel (frontend)
- Integrations: Slack, Aloware, Monday.com, HubSpot, OpenAI

This repo is a monorepo. The closest `AGENTS.md` applies, but the root file should be enough for most work.

## Setup Commands

Prereqs:
- Node.js 22+
- PostgreSQL 15+ (local) or Railway PostgreSQL
- Slack app credentials in `.env`

Install deps:
```bash
cd sms-insights && npm install
cd ../frontend && npm install
```

Environment:
```bash
cd sms-insights
cp .env.sample .env
# Fill required vars (see docs/setup/ENV_REFERENCE.md)
```

## Development Workflow

Backend (API + Slack bot):
```bash
cd sms-insights
npm run dev
```

Frontend (Vite):
```bash
cd frontend
npm run dev
```

Local URLs:
- UI: `http://localhost:5173`
- API: `http://localhost:3000`
- Health: `http://localhost:3000/api/health`

## Database Notes

Local PostgreSQL:
```bash
createdb sms_insights
```

Railway PostgreSQL (local dev):
```bash
railway link
railway variables --service sms-insights --json | python3 -c \
  "import json,sys; d=json.load(sys.stdin); print(d.get('DATABASE_PUBLIC_URL',''))"
```

Use `DATABASE_PUBLIC_URL` in local `.env`. Never hardcode DB URLs in code.

## Testing Instructions

Backend tests live in `sms-insights/tests/` and use Node's test runner:
```bash
cd sms-insights
node --import tsx --test tests/**/*.test.ts
```

Convenience scripts:
```bash
cd sms-insights
npm run test                # build + lint + full backend tests
npm run test:monday-sms-sync
npm run test:monday-sms-sequences
npm run test:monday-sms-reports
```

Frontend test utilities use Vitest/Test Library, but there is no `npm run test` script. Add one if needed.

Typecheck frontend:
```bash
cd frontend
npm run typecheck:v2
```

## Code Style and Conventions

Backend:
- TypeScript strict mode
- Structured logging via `pino` (avoid `console.log`)
- Prefer Zod for request validation
- File names `kebab-case`, types/interfaces `PascalCase`, functions `camelCase`

Linting/formatting:
```bash
cd sms-insights
npm run lint
npm run lint:fix
```

Frontend:
- React components use `PascalCase`
- Use `cn()` helper for class composition (`frontend/src/lib/utils`)
- Tailwind CSS utilities for styling

## Build and Deployment

Build everything (backend + frontend):
```bash
cd sms-insights
npm run build
```

Backend build output: `sms-insights/dist/`
Frontend build output: `frontend/dist/`

Deploy:
- Backend: Railway (`railway.toml`)
- Frontend: Vercel (`vercel.json`)

## Scripts and Maintenance

Useful backend scripts (run from `sms-insights/`):
```bash
npm run backfill:hubspot
npm run backfill:slack
npm run backfill:booked-calls
npm run refresh:booked-attribution
npm run sync:monday
```

## Pull Request Guidelines

Branching:
- `main` (prod), `develop` (integration), `feature/*`, `hotfix/*`

Commit convention: Conventional Commits
```
type(scope): description
```

Before submitting:
```bash
cd sms-insights
npm run lint
npm run build

cd ../frontend
npm run typecheck:v2
npm run build
```

## Debugging Tips

Backend:
```bash
LOG_LEVEL=debug npm run dev
DEBUG=db,services:* npm run dev
```

Frontend:
```bash
DEBUG=vite:* npm run dev
```

## References

- Local dev guide: `docs/setup/LOCAL_DEV.md`
- Onboarding: `docs/setup/ONBOARDING.md`
- Env vars: `docs/setup/ENV_REFERENCE.md`
- Contributing: `docs/development/CONTRIBUTING.md`

## Figma Design System Rules

### Design Token Sources
- Color, typography, spacing, and state tokens live in `frontend/src/styles/design-tokens.ts` and are mirrored as CSS variables under `frontend/src/styles/tokens.css`. Use these exports instead of hardcoded hex values.
  ```ts
  export const colors = { primary: { 500: "#0ea5e9", 600: "#0284c7" }, success: { 500: "#22c55e" }, ... }
  export const spacing = { 1: "4px", 2: "8px", 4: "16px", 8: "32px", 16: "64px" }
  ```
- Tokens.css exposes the same palette via `@theme` variables (e.g., `--color-ds-primary-500`, `--spacing-control-x`). Reference these vars in global CSS or CSS modules to keep the Tailwind-like scale consistent.

### Component Library
- UI components live in `frontend/src/components/` (with subfolders like `/insights`, `/v2`, `/ui`) and are orchestrated by the lazy-loaded `frontend/src/v2/V2App`.
- New Figma-derived components should land under `frontend/src/components/` (feature-specific components near `features/` or `v2/` as needed). Storybook stories (inside `storybook-static` and `frontend/.storybook`) demonstrate how these components compose.
- Prefer the existing `PasswordGate`, `RunList`, `RunDetail`, `SuspenseLoader`, and `theme-provider` patterns when adding shared UI. Keep exports in PascalCase and collocate styles via dedicated `.css` files.

### Frameworks & Styling Stack
- React 19 + Vite 7 power the UI via `frontend/src/main.tsx`, with `BrowserRouter` for `/v2/*` flows and React Query for data fetching.
- Styling layers: Tailwind v4 utilities, project-specific CSS (`globals.css`, `utilities.css`, per-component CSS), and ThemeProvider-driven CSS class toggles for light/dark themes.
- Vite bundle config (`vite.config.ts`) and `tailwind.config.js` hook into the tokens generator script (`frontend/scripts/generate-design-tokens.ts`). Run `npm run generate-tokens` if tokens change.

### Asset / Icon Management
- Static assets live in `frontend/src/assets/` and `public/` for direct Vite serving. When Figma provides assets, place optimized versions under `public/assets/figma/` and import them via `/assets/` paths so Vite handles hashing.
- Icons use `lucide-react`, `@radix-ui/react-icons`, and Radix UI primitives. Wrap new icons in the shared `components/ui` wrappers if they require consistent sizing or color tokens.

### Styling Rules & Responsive Behavior
- Per-component CSS files (e.g., `Insights.css`, `Sequences.css`) rely on CSS variables defined in `tokens.css`. Always favor `var(--color-ds-*)` and spacing tokens over literal values.
- Responsive breakpoints follow the CSS in `globals.css` and grid classes inside `frontend/src/styles/*.css`. Keep this structure when implementing designs (wide layout + 240px sidebar).
- Animations use root-defined durations (`--duration-fast/normal/slow`), shadows (`--shadow-surface`), and radii (`--radius-panel`). Reuse these for hover/focus states instead of inventing new values.

### Project Structure Callouts
- Primary UI directories: `frontend/src/components/`, `frontend/src/features/`, `frontend/src/v2/` for the new dashboard, `frontend/src/styles/` for CSS/token definitions, and `frontend/src/lib/` for utilities (e.g., `hooks`, `utils`, `api`).
- Keep imports grouped: React/core libs → third-party (Radix, TanStack) → local aliases (use `@/` from `tsconfig` if configured) → types.

### Figma MCP Implementation Flow
1. Always fetch `get_design_context(fileKey, nodeId)` before booking any code changes; it exposes layout, typography, and asset data that we translate into this stack.
2. If the response is too large, call `get_metadata` to inspect child node IDs, then re-fetch those nodes individually.
3. Grab a screenshot with `get_screenshot(fileKey, nodeId)` for visual validation and keep it handy while coding.
4. Download assets from the MCP server (do not replace `localhost` URLs). Store them under `public/assets` and reference via Vite-friendly paths.
5. Translate the default React/Tailwind output into the project conventions above (CSS files, token usage, existing components).
6. Validate pixel-for-pixel against the screenshot before closing the ticket.

### Asset Handling Rules
- Use the MCP-provided asset endpoint URLs directly; do not host separate CDN copies unless explicitly needed.
- Keep SVG/PNG assets in `public/assets/figma/` with descriptive names (e.g., `public/assets/figma/sequences-header.svg`).
- Avoid adding new icon libraries; prefer `lucide-react` or inline SVGs reused through `components/ui/Icon`.

### Miscellaneous Expectations
- All new components must accept a `className` prop for composition and be documented in `src/components/ui/`.
- Prop types must be typed (TypeScript) and include JSDoc comments for exported utilities.
- Accessibility checklist: keyboard focus states, aria labels on interactive elements, and color contrast meeting WCAG AA.
- Before committing, run `npm run build` (frontend) and `npm run test`/`npm run lint` (backend) to ensure the new UI doesn’t introduce regressions.
