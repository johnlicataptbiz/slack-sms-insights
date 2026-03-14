# PT Biz SMS Insights Documentation

Welcome to the PT Biz SMS Insights documentation hub. This directory contains comprehensive guides for setup, development, deployment, and usage of the platform.

## 📚 Documentation Structure

```
docs/
├── setup/                    # Getting started guides
│   ├── ONBOARDING.md        # Complete setup guide
│   ├── QUICK_START.md       # 5-minute quick start
│   ├── LOCAL_DEV.md         # Local development details
│   ├── DEPLOYMENT.md        # Production deployment
│   ├── ENV_REFERENCE.md     # Environment variables
│   ├── USAGE_GUIDE.md       # Day-to-day usage
│   └── PASSWORD_GATE.md     # Password authentication
│
├── architecture/             # System design docs
│   ├── API.md               # API documentation
│   ├── DASHBOARD_OVERVIEW.md # Dashboard architecture
│   ├── SEQUENCE_KPI_CONTRACT.md # KPI definitions
│   └── UNIFIED_ANALYTICS.md # Analytics architecture
│
├── development/              # Development guides
│   ├── CONTRIBUTING.md      # Contribution guidelines
│   ├── CODE_IMPROVEMENTS.md # Code quality tips
│   └── IMPROVEMENTS_SUMMARY.md # Known issues
│
├── planning/                 # Project planning
│   ├── ROADMAP.md           # Feature roadmap
│   ├── TODO.md              # Implementation tasks
│   └── implementation_plan.md # Current sprint plan
│
└── operations/               # Operations guides
    ├── DRIFT_CHECKLIST.md   # Configuration drift checks
    └── PRODUCTION_SMOKE_CHECKS.md # Production verification
```

## 🚀 Start Here

### New to the Project?
1. **[QUICK_START.md](setup/QUICK_START.md)** — Get running in 5 minutes
2. **[ONBOARDING.md](setup/ONBOARDING.md)** — Complete setup guide
3. **[USAGE_GUIDE.md](setup/USAGE_GUIDE.md)** — How to use the platform

### Setting Up Development Environment?
1. **[LOCAL_DEV.md](setup/LOCAL_DEV.md)** — Detailed local setup
2. **[ENV_REFERENCE.md](setup/ENV_REFERENCE.md)** — All environment variables
3. **[CONTRIBUTING.md](development/CONTRIBUTING.md)** — Development workflow

### Deploying to Production?
1. **[DEPLOYMENT.md](setup/DEPLOYMENT.md)** — Railway + Vercel deployment
2. **[PRODUCTION_SMOKE_CHECKS.md](operations/PRODUCTION_SMOKE_CHECKS.md)** — Post-deploy verification
3. **[DRIFT_CHECKLIST.md](operations/DRIFT_CHECKLIST.md)** — Configuration monitoring

### Building Features?
1. **[API.md](architecture/API.md)** — API endpoints and contracts
2. **[DASHBOARD_OVERVIEW.md](architecture/DASHBOARD_OVERVIEW.md)** — Dashboard architecture
3. **[CONTRIBUTING.md](development/CONTRIBUTING.md)** — Code standards and PR process

## 📖 Key Documents by Role

### For Developers
| Document | Purpose |
|----------|---------|
| [ONBOARDING.md](setup/ONBOARDING.md) | Complete development environment setup |
| [LOCAL_DEV.md](setup/LOCAL_DEV.md) | Local development workflow |
| [CONTRIBUTING.md](development/CONTRIBUTING.md) | Code standards and PR process |
| [API.md](architecture/API.md) | API reference |
| [CODE_IMPROVEMENTS.md](development/CODE_IMPROVEMENTS.md) | Code quality guidelines |

### For DevOps/Operations
| Document | Purpose |
|----------|---------|
| [DEPLOYMENT.md](setup/DEPLOYMENT.md) | Production deployment guide |
| [ENV_REFERENCE.md](setup/ENV_REFERENCE.md) | Environment configuration |
| [PRODUCTION_SMOKE_CHECKS.md](operations/PRODUCTION_SMOKE_CHECKS.md) | Post-deploy checks |
| [DRIFT_CHECKLIST.md](operations/DRIFT_CHECKLIST.md) | Configuration monitoring |

### For Product/Analytics
| Document | Purpose |
|----------|---------|
| [USAGE_GUIDE.md](setup/USAGE_GUIDE.md) | Platform usage guide |
| [DASHBOARD_OVERVIEW.md](architecture/DASHBOARD_OVERVIEW.md) | Dashboard features |
| [UNIFIED_ANALYTICS.md](architecture/UNIFIED_ANALYTICS.md) | Analytics architecture |
| [ROADMAP.md](planning/ROADMAP.md) | Feature roadmap |

### For New Team Members
| Document | Purpose |
|----------|---------|
| [QUICK_START.md](setup/QUICK_START.md) | 5-minute setup |
| [ONBOARDING.md](setup/ONBOARDING.md) | Complete guide |
| [USAGE_GUIDE.md](setup/USAGE_GUIDE.md) | How to use the platform |
| [CONTRIBUTING.md](development/CONTRIBUTING.md) | How to contribute |

## 🔧 Quick Reference

### Common Commands

```bash
# Start development
cd sms-insights && npm run dev      # Backend
cd frontend && npm run dev          # Frontend

# Database
cd sms-insights && npx prisma studio # Database GUI
npm run prisma:generate             # Regenerate client

# Code quality
cd sms-insights && npm run lint     # Lint backend
cd frontend && npm run typecheck:v2 # Type check frontend

# Deployment
cd sms-insights && railway up       # Deploy backend
cd frontend && vercel --prod        # Deploy frontend
```

### Important URLs

| Environment | URL |
|-------------|-----|
| Local Dashboard | http://localhost:5173 |
| Local API | http://localhost:3000 |
| Production Dashboard | https://your-project.vercel.app |
| Production API | https://your-railway-app.up.railway.app |

### Key Files

| File | Purpose |
|------|---------|
| `sms-insights/.env` | Backend configuration |
| `frontend/.env` | Frontend configuration |
| `sms-insights/prisma/schema.prisma` | Database schema |
| `railway.toml` | Railway deployment config |
| `vercel.json` | Vercel deployment config |

## 🆘 Getting Help

1. **Check the docs** — Start with the relevant guide above
2. **Review troubleshooting** — Each setup guide has a troubleshooting section
3. **Check logs** — `railway logs --follow` for backend, browser console for frontend
4. **Open an issue** — Include error messages, steps to reproduce, and environment details

## 📝 Documentation Standards

When contributing documentation:
- Use clear, concise language
- Include code examples where helpful
- Add troubleshooting sections for common issues
- Keep the [QUICK_START.md](setup/QUICK_START.md) updated with any setup changes
- Update this README when adding new documents

---

**Questions?** Start with [ONBOARDING.md](setup/ONBOARDING.md) or open an issue.
