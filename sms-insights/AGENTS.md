# AGENTS.md

This file provides guidance to agents when working with code in this repository.

- Build includes conditional frontend build from ../frontend if exists (set SKIP_FRONTEND_BUILD=true to skip)
- Linting only checks: *.ts listeners services tests api (not all TypeScript files)
- Testing uses two runners: Vitest for most, Node.js --test for legacy tests in tests/services/, tests/listeners/, tests/events/, tests/api/
- Single test: vitest run path/to/test.ts (Vitest) or node --import tsx --test path/to/test.ts (legacy)
- Database: SQLite supported in dev (DATABASE_URL=file:...) skips PostgreSQL pool
- Prisma: Uses previewFeatures ["partialIndexes"]
- Code style: 2 spaces, single quotes, line width 120, custom Biome rules (noAssignInExpressions off, style rules as error)
- Logging: Pino with env configs (pretty dev, JSON prod)
- Errors: Reported to Slack admin channel