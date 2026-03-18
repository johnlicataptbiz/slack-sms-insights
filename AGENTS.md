# AGENTS.md

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

Backend tests live in `sms-insights/tests/` and use Node’s test runner:
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
