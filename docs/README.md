# PT Biz SMS Insights Documentation

Welcome to the documentation hub for PT Biz SMS Insights — a real-time SMS analytics dashboard integrated with Slack, Aloware, and Monday.com.

## 📂 Documentation Structure

### 🚀 Setup & Deployment
| Document | Description | Audience |
|----------|-------------|----------|
| [QUICK_START.md](setup/QUICK_START.md) | 5-minute setup guide | New developers |
| [ONBOARDING.md](setup/ONBOARDING.md) | Comprehensive setup and development guide | New team members |
| [LOCAL_DEV.md](setup/LOCAL_DEV.md) | Detailed local development environment setup | Developers |
| [DEPLOYMENT.md](setup/DEPLOYMENT.md) | Production deployment to Railway/Vercel | DevOps |

### 🏗️ Architecture & API
| Document | Description | Audience |
|----------|-------------|----------|
| [DASHBOARD_OVERVIEW.md](architecture/DASHBOARD_OVERVIEW.md) | System architecture, data flow, and component overview | All developers |
| [API.md](architecture/API.md) | Complete API endpoint reference with TypeScript types | Frontend/backend developers |

### 🛠️ Development
| Document | Description | Audience |
|----------|-------------|----------|
| [CONTRIBUTING.md](development/CONTRIBUTING.md) | Git workflow, code standards, testing, PR process | All contributors |
| [CODE_IMPROVEMENTS.md](development/CODE_IMPROVEMENTS.md) | Summary of code quality improvements implemented | Maintainers |
| [IMPROVEMENTS_SUMMARY.md](development/IMPROVEMENTS_SUMMARY.md) | Detailed analysis of improvements and recommendations | Tech leads |

### 📋 Planning & Roadmap
| Document | Description | Audience |
|----------|-------------|----------|
| [ROADMAP.md](planning/ROADMAP.md) | Product roadmap and strategic vision (4-layer architecture) | Product/Engineering |
| [implementation_plan.md](planning/implementation_plan.md) | Feature implementation phases and technical specs | Engineers |
| [TODO.md](planning/TODO.md) | Active task tracking and backlog | Team |

## 🎯 Quick Navigation

**New to the project?** → Start with [QUICK_START.md](setup/QUICK_START.md)  
**Setting up locally?** → See [LOCAL_DEV.md](setup/LOCAL_DEV.md)  
**Deploying to production?** → Follow [DEPLOYMENT.md](setup/DEPLOYMENT.md)  
**Understanding the system?** → Read [DASHBOARD_OVERVIEW.md](architecture/DASHBOARD_OVERVIEW.md)  
**API integration?** → Reference [API.md](architecture/API.md)  
**Contributing code?** → Check [CONTRIBUTING.md](development/CONTRIBUTING.md)

## 🏛️ Architecture Overview

The system follows a 4-layer architecture:

```
┌─────────────────────────────────────────┐
│  Layer 4: User Interface (React/Vite)   │
│  - V2 Dashboard, Legacy Dashboard       │
├─────────────────────────────────────────┤
│  Layer 3: API Layer (Express/Bolt)    │
│  - REST API, Slack Bot, WebSocket       │
├─────────────────────────────────────────┤
│  Layer 2: Service Layer               │
│  - Aloware, Monday, Slack, AI clients   │
├─────────────────────────────────────────┤
│  Layer 1: Data Layer (PostgreSQL)     │
│  - daily_runs, conversations, events    │
└─────────────────────────────────────────┘
```

## 🔄 Development Workflow

1. **Setup**: Follow [ONBOARDING.md](setup/ONBOARDING.md) for initial setup
2. **Develop**: Follow [CONTRIBUTING.md](development/CONTRIBUTING.md) for workflow
3. **Test**: Run type checks and local tests
4. **Deploy**: Use [DEPLOYMENT.md](setup/DEPLOYMENT.md) for production releases

## 📞 Support

- **Technical questions**: Check [LOCAL_DEV.md](setup/LOCAL_DEV.md) troubleshooting section
- **API questions**: Reference [API.md](architecture/API.md)
- **Architecture questions**: See [DASHBOARD_OVERVIEW.md](architecture/DASHBOARD_OVERVIEW.md)

---

*Last updated: Current session | Maintained by the PT Biz Engineering team*
