# Database Setup Quick Reference

## Current status
- **Current runtime DB**: PostgreSQL
- **Active connection string**: `DATABASE_URL=postgresql://jl@localhost/sms_insights`
- **Recommended local flow**: PostgreSQL + Prisma migrations

---

## Fast start

```bash
cd /Users/jl/Developer/slack-sms-insights/sms-insights

# Confirm the database is reachable
python3 db-simple-check.py

# Apply migrations
npx prisma migrate deploy

# Start the app
npm run dev
```

---

## Local PostgreSQL setup

### 1) Install and start PostgreSQL

```bash
# macOS
brew install postgresql@15
brew services start postgresql@15

# Verify the server is up
pg_isready -h localhost -p 5432
```

### 2) Create the database

```bash
createdb sms_insights
psql sms_insights -c "SELECT 'connected' AS status;"
```

### 3) Set the connection string

Update `sms-insights/.env`:

```bash
DATABASE_URL="postgresql://jl@localhost/sms_insights"
```

If you prefer to keep your shell session aligned too:

```bash
export DATABASE_URL="postgresql://jl@localhost/sms_insights"
```

### 4) Apply migrations

```bash
npx prisma migrate deploy
```

### 5) Verify and inspect data

```bash
# Quick app-friendly check
python3 db-simple-check.py

# PostgreSQL health check
psql "$DATABASE_URL" < db-simple-health.sql

# Full audit
psql "$DATABASE_URL" < docs/database-health-audit.sql

# Visual browse
npx prisma studio
```

---

## Railway PostgreSQL setup

### 1) Link the Railway project

```bash
cd /Users/jl/Developer/slack-sms-insights
railway link
```

### 2) Read the database variable

```bash
railway variables --service sms-insights --json | jq -r '.DATABASE_PUBLIC_URL'
```

### 3) Update `DATABASE_URL`

Use the Railway connection string in `sms-insights/.env`:

```bash
DATABASE_URL="postgresql://..."
```

### 4) Deploy migrations and verify

```bash
cd /Users/jl/Developer/slack-sms-insights/sms-insights
npx prisma migrate deploy
python3 db-simple-check.py
```

---

## Diagnostic commands

### Works with the current setup

```bash
python3 db-simple-check.py
```

### PostgreSQL-only checks

```bash
psql "$DATABASE_URL" < db-simple-health.sql
psql "$DATABASE_URL" < docs/database-health-audit.sql
```

### Prisma commands

```bash
npx prisma migrate status
npx prisma migrate deploy
npx prisma studio
npx prisma format
npx prisma validate
```

---

## Troubleshooting

### PostgreSQL is not running

```bash
brew services list | grep postgresql
brew services start postgresql@15
pg_isready -h localhost -p 5432
```

### Prisma still points at SQLite

If you see `file:./dev.db`, update `DATABASE_URL` in `.env` to PostgreSQL:

```bash
DATABASE_URL="postgresql://jl@localhost/sms_insights"
```

### Migrations are pending

```bash
npx prisma migrate status
npx prisma migrate deploy
```

### You want to reset local data

```bash
npx prisma migrate reset
```

---

## Environment variables

Minimum runtime variables:

```bash
DATABASE_URL=postgresql://jl@localhost/sms_insights
SLACK_CLIENT_ID=
SLACK_CLIENT_SECRET=
SLACK_SIGNING_SECRET=
SLACK_APP_TOKEN=
SLACK_BOT_TOKEN=
OPENAI_API_KEY=
```

See `.env.sample` for the full list.

---

## Notes

- The repo now uses PostgreSQL for local development and audit scripts.
- The quick check script works with both SQLite and PostgreSQL, but the production path should use PostgreSQL.
- The full audit script is PostgreSQL-only.

---

**Last updated**: March 20, 2026
