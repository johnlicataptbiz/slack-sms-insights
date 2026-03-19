# Database Migration Strategy

## Overview

This document outlines the database migration strategy for the PTBiz SMS Insights project using Prisma ORM with SQLite (development) and PostgreSQL (production).

## Current State

- **ORM**: Prisma
- **Development Database**: SQLite (`sms-insights/dev.db`)
- **Production Database**: PostgreSQL (via Railway)
- **Schema Location**: `sms-insights/prisma/schema.prisma`

## Migration Workflow

### 1. Development Migrations

```bash
cd sms-insights

# Create a new migration after schema changes
npx prisma migrate dev --name <descriptive_name>

# Apply migrations to development database
npx prisma migrate dev

# Generate Prisma Client
npx prisma generate
```

### 2. Production Migrations

```bash
cd sms-insights

# Deploy migrations to production (non-interactive)
npx prisma migrate deploy

# Verify migration status
npx prisma migrate status
```

### 3. Database Seeding (if needed)

```bash
cd sms-insights

# Run seed script
npx prisma db seed
```

## CI/CD Integration

Migrations are automatically applied in the CI/CD pipeline (see `.github/workflows/ci-cd.yml`):

1. **Test Job**: Validates migrations with `prisma migrate dev`
2. **Deploy Job**: Applies migrations with `prisma migrate deploy` before deployment

## Best Practices

1. **Always create migrations for schema changes** - Never manually edit the database
2. **Test migrations locally** before committing
3. **Backup production database** before running migrations
4. **Use descriptive migration names** (e.g., `add_user_preferences`, `fix_contact_index`)
5. **Review migration SQL** before applying to production

## Rollback Strategy

If a migration fails in production:

```bash
# Mark migration as rolled back (use with caution)
npx prisma migrate resolve --rolled-back <migration_name>

# Or mark as applied if manually fixed
npx prisma migrate resolve --applied <migration_name>
```

## Environment Variables

Required environment variables for database connections:

```bash
# Development
DATABASE_URL="file:./dev.db"

# Production
DATABASE_URL="postgresql://user:pass@host:port/dbname"
```

## Troubleshooting

### Common Issues

1. **Migration drift**: Run `prisma migrate dev` to create a drift fix migration
2. **Failed migrations**: Check logs and resolve manually, then mark as resolved
3. **Prisma Client out of sync**: Run `prisma generate` after schema changes

### Useful Commands

```bash
# Reset database (development only!)
npx prisma migrate reset

# Validate schema without applying
npx prisma validate

# Format schema
npx prisma format

# Visual database management
npx prisma studio
```
