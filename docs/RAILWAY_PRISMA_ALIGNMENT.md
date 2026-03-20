# Production Deployment: Railway + Prisma Alignment Checklist

## 📋 Status Overview

**Last Updated:** March 20, 2026  
**Backend Deployment:** Railway  
**Database:** PostgreSQL on Railway  
**Migrations:** 9 Prisma migrations (latest: March 19)

---

## ✅ Pre-Deployment Checklist

### Local Testing

```bash
# 1. Test migration deployment script
cd sms-insights
npm run migrate:deploy

# 2. Check migration status
npm run migrate:status

# 3. Verify Prisma schema
npx prisma validate --config prisma.config.ts

# 4. Test build process
npm run build
```

### Environment Variables

**Required in Railway:**

```
DATABASE_URL=postgresql://...
DATABASE_PUBLIC_URL=postgresql://...  # Mirror for local dev
NODE_ENV=production
SKIP_MIGRATIONS=false  # Must be false to auto-deploy migrations
```

**Optional:**

```
PG_CONNECT_TIMEOUT_MS=20000  # Default Railway timeout
PG_QUERY_TIMEOUT_MS=60000
PG_STATEMENT_TIMEOUT_MS=60000
```

---

## 🚀 Deployment Flow

### Current Build Pipeline

```bash
npm run build
├── npm run clean (delete dist/)
├── npm run prebuild (generate changelog)
├── npm run prisma:generate (compile schema)
├── tsc (TypeScript compilation)
└── npm run build:frontend (compile React app)
```

### ✅ Migration Deployment Configured

The build process includes migration deployment via post-build hook.

### Railway Configuration (ACTIVE)

Both `railway.toml` files are configured with the post-build hook:

```toml
[build]
builder = "nixpacks"
postBuild = "npm run migrate:deploy"
```

This ensures migrations run automatically after build succeeds, before app starts.

---

## 🔄 Migration Management

### Latest Migrations (March 19, 2026)

1. `20260319_add_temporal_columns` - Adds timestamp tracking
2. `20260319_add_foreign_keys_constraints` - Referential integrity
3. `20260319_add_composite_indexes` - Query optimization

### Checking Migration Status

```bash
npm run migrate:status
```

Shows last 10 applied migrations from `_prisma_migrations` table.

### Applying New Migrations

```bash
# Generate migration
npx prisma migrate dev --name descriptive_name --config prisma.config.ts

# Verify before push
npx prisma migrate status --config prisma.config.ts

# Deploy to prod
npm run migrate:deploy
```

---

## 🔍 Production Alignment Checks

### 1. Database Schema Sync

```sql
-- Check if all tables exist
SELECT table_name FROM information_schema.tables
WHERE table_schema = 'public' ORDER BY table_name;

-- Verify _prisma_migrations table (required)
SELECT COUNT(*) FROM _prisma_migrations;
```

### 2. Migration History

```bash
npm run migrate:status
# Should show all 9 migrations applied
```

### 3. Prisma Client Generation

```bash
# Verify client is generated
ls sms-insights/node_modules/@prisma/client/index.d.ts
```

### 4. Connection Pool Verification

Logs on app startup should show:

```
✅ Database connection pool initialized
```

---

## ⚠️ Common Issues & Fixes

| Issue                  | Symptom                                     | Fix                                                    |
| ---------------------- | ------------------------------------------- | ------------------------------------------------------ |
| Migrations not running | App starts but tables missing               | Set `SKIP_MIGRATIONS=false` in Railway env             |
| Schema mismatch        | TypeScript errors on Prisma types           | Run `npm run prisma:generate` locally                  |
| Connection timeout     | Deploy fails or hangs                       | Increase `PG_CONNECT_TIMEOUT_MS` to 30000              |
| Migration lock         | Database locked from previous failed deploy | Contact Railway support to unlock `_prisma_migrations` |
| Stale Prisma client    | Runtime errors about missing fields         | Redeploy to regenerate client                          |

---

## 📊 Deployment Workflow

### Step 1: Local Validation

```bash
cd sms-insights
npm run migrate:deploy  # Test locally with local DB
npx prisma validate --config prisma.config.ts
npm run build
```

### Step 2: Commit & Push

```bash
git add sms-insights/scripts/deploy-migrations.ts sms-insights/package.json
git commit -m "chore: add deployment migration script for production sync"
git push origin main
```

### Step 3: Railway Deployment

```bash
# Option A: Trigger via Railway CLI
railway deploy

# Option B: Trigger via GitHub (if connected)
# Push to main → GitHub Actions → Railway auto-deploy
```

### Step 4: Verify in Production

```bash
# SSH into Railway container (if available)
npm run migrate:status

# Or check Railway logs for:
# ✅ Production migration deployment complete!
```

---

## 💾 Rollback Procedures

### Rollback a Migration

```bash
# Local only (doesn't roll back in prod)
npx prisma migrate resolve --rolled-back 20260319_add_temporal_columns --config prisma.config.ts

# Manual rollback (if needed)
psql $DATABASE_URL -f rollback-script.sql
```

### Revert Deployment

```bash
git revert <commit-hash>
git push origin main
# Railway auto-deploys, but migrations cannot be undone!
```

---

## 📞 Quick Reference

| Command                  | Purpose                          |
| ------------------------ | -------------------------------- |
| `npm run migrate:deploy` | Apply all pending migrations     |
| `npm run migrate:status` | Show migration history           |
| `npm run build`          | Build app (excluding migrations) |
| `npx prisma validate`    | Check schema syntax              |
| `npx prisma generate`    | Regenerate TypeScript types      |

---

## 🎯 Next Actions

1. **Set up Railway post-build hook** to run `npm run migrate:deploy`
2. **Test migration deployment locally** before prod push
3. **Add monitoring** to alert if migrations fail
4. **Document** any custom `.env` overrides in Railway
