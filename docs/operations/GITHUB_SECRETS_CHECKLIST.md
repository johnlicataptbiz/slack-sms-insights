# GitHub Secrets Verification Checklist

## Required Secrets for CI/CD Pipeline

The following secrets must be configured in GitHub repository settings for automated deployments to work:

### Backend Deployment (Railway)

| Secret Name     | Purpose                       | How to Obtain                                 |
| --------------- | ----------------------------- | --------------------------------------------- |
| `RAILWAY_TOKEN` | Authenticate with Railway API | Railway Dashboard → Account Settings → Tokens |

### Frontend Deployment (Vercel)

| Secret Name         | Purpose                        | How to Obtain                         |
| ------------------- | ------------------------------ | ------------------------------------- |
| `VERCEL_TOKEN`      | Authenticate with Vercel API   | Vercel Dashboard → Settings → Tokens  |
| `VERCEL_ORG_ID`     | Vercel organization identifier | Vercel Dashboard → Settings → General |
| `VERCEL_PROJECT_ID` | Vercel project identifier      | Project Settings → General            |

## Verification Steps

### 1. Check if Secrets Exist

```bash
# Use GitHub CLI (if authenticated)
gh secret list -R jacklicata/slack-sms-insights
```

### 2. Manual Verification

1. Go to: https://github.com/jacklicata/slack-sms-insights/settings/secrets/actions
2. Verify all 4 secrets are listed:
   - [ ] `RAILWAY_TOKEN`
   - [ ] `VERCEL_TOKEN`
   - [ ] `VERCEL_ORG_ID`
   - [ ] `VERCEL_PROJECT_ID`

### 3. Test Deployments

After secrets are confirmed, test by:

1. Creating a test PR to `main` branch
2. Verify CI runs successfully (lint, typecheck, test, build)
3. Merge PR and verify auto-deployment triggers

## Current Status

**Last Updated:** 2026-03-19

| Secret              | Status     | Notes              |
| ------------------- | ---------- | ------------------ |
| `RAILWAY_TOKEN`     | ⚠️ Unknown | Needs verification |
| `VERCEL_TOKEN`      | ⚠️ Unknown | Needs verification |
| `VERCEL_ORG_ID`     | ⚠️ Unknown | Needs verification |
| `VERCEL_PROJECT_ID` | ⚠️ Unknown | Needs verification |

## Troubleshooting

### Secret Not Found Error

If CI fails with "secret not found":

1. Go to Settings → Secrets and variables → Actions
2. Click "New repository secret"
3. Add the missing secret name and value

### Invalid Token Error

If CI fails with "authentication failed":

1. Regenerate the token from Railway/Vercel dashboard
2. Update the secret in GitHub with the new value
3. Re-run the failed workflow

## Related Files

- `.github/workflows/ci-cd.yml` - Uses these secrets for deployment jobs
- `config/railway.toml` - Railway deployment configuration
- `frontend/vercel.json` - Vercel deployment configuration
