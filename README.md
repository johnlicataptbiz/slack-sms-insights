# PT Biz SMS Insights Dashboard

[![Deploy](https://img.shields.io/badge/deploy-Vercel-black?style=flat-square&logo=vercel)](https://vercel.com)
[![Backend](https://img.shields.io/badge/backend-Railway-0B0D0E?style=flat-square&logo=railway)](https://railway.app)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![Tailwind](https://img.shields.io/badge/Tailwind-4.0-38B2AC?style=flat-square&logo=tailwind-css)](https://tailwindcss.com/)

A real-time SMS analytics dashboard for PT Biz, integrated with Slack, Aloware, and Monday.com. Provides daily reports, conversation insights, and sales metrics for SMS marketing campaigns.

## 🎯 What is this?

PT Biz SMS Insights is a comprehensive analytics platform that:

- **Monitors SMS campaigns** in real-time through Slack integration
- **Generates daily reports** with sales metrics, response rates, and booked calls
- **Tracks conversations** across multiple channels with SLA monitoring
- **Syncs with Monday.com** for lead management and call tracking
- **Provides a modern dashboard** with interactive charts and KPIs

## 🏗️ System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        User Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │   Slack App  │  │   Dashboard  │  │   Monday.com │       │
│  │   (Mentions) │  │   (Web UI)   │  │   (Sync)     │       │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘       │
└─────────┼─────────────────┼─────────────────┼───────────────┘
          │                 │                 │
          ▼                 ▼                 ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Layer (Railway)                     │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Node.js + Express Server                │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐   │   │
│  │  │  Slack Bot  │ │   REST API  │ │   WebSocket │   │   │
│  │  │  (Bolt.js)  │ │   (Routes)  │ │   (Stream)  │   │   │
│  │  └─────────────┘ └─────────────┘ └─────────────┘   │   │
│  └─────────────────────────────────────────────────────┘   │
│                         │                                    │
│                         ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Service Layer                           │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │   │
│  │  │ Aloware  │ │  Monday  │ │  Slack   │ │  AI    │ │   │
│  │  │  Client  │ │   Sync   │ │  Client  │ │Response│ │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────┘ │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Data Layer (PostgreSQL)                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │ daily_runs  │ │ sms_events  │ │conversations│          │
│  │  (reports)  │ │  (events)   │ │   (threads) │          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐          │
│  │ work_items  │ │booked_calls │ │ sessions    │          │
│  │   (SLA)     │ │   (calls)   │ │ (password)  │          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Getting Started

For a comprehensive guide to setting up your local development environment, see the **[Onboarding Document](docs/setup/ONBOARDING.md)**.

## 📁 Project Structure

```
SlackCLI/
├── sms-insights/              # Backend (Node.js/TypeScript)
│   ├── app.ts                 # Entry point, HTTP server
│   ├── api/                   # API routes
│   │   ├── routes.ts          # Route handlers
│   │   └── v2-contract.ts     # API types
│   ├── listeners/             # Slack event listeners
│   │   ├── events/            # Event handlers
│   │   ├── commands/          # Slash commands
│   │   └── actions/           # Interactive actions
│   ├── services/              # Business logic
│   │   ├── db.ts              # Database connection
│   │   ├── daily-run-logger.ts # Report logging
│   │   ├── aloware-analytics.ts # SMS analytics
│   │   └── monday-sync.ts     # Monday.com integration
│   └── scripts/               # Utility scripts
│       ├── backfill-*.ts      # Data backfill scripts
│       └── seed-*.ts          # Sample data scripts
│
├── frontend/                  # Frontend (React/Vite)
│   ├── src/
│   │   ├── App.tsx            # Main app component
│   │   ├── api/               # API client & queries
│   │   ├── components/        # React components
│   │   │   ├── ui/            # shadcn/ui components
│   │   │   ├── v2/            # V2 dashboard components
│   │   │   └── insights/      # Legacy components
│   │   ├── pages/             # Page components
│   │   ├── hooks/             # Custom React hooks
│   │   └── lib/               # Utilities
│   └── package.json
│
├── sms-insights-workflow/     # Slack Workflow (Deno)
├── sms-insights-workflow-ref/ # Reference workflows
└── docs/                      # Documentation
```

## 📚 Documentation

- **[Onboarding Guide](docs/setup/ONBOARDING.md)** - Comprehensive setup and development guide.
- **[Local Development](docs/setup/LOCAL_DEV.md)** - Detailed setup instructions
- **[Deployment](docs/setup/DEPLOYMENT.md)** - Production deployment guide
- **[API Reference](docs/architecture/API.md)** - API endpoint documentation
- **[Contributing](docs/development/CONTRIBUTING.md)** - Development workflow
- **[Architecture](docs/architecture/DASHBOARD_OVERVIEW.md)** - System architecture details

## 🔧 Key Technologies

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend | Node.js + TypeScript | API server, Slack bot |
| Slack | @slack/bolt | Slack app framework |
| Frontend | React 19 + Vite | Dashboard UI |
| Styling | Tailwind CSS v4 | Utility-first CSS |
| Components | shadcn/ui | Accessible UI components |
| Charts | Recharts | Data visualization |
| State | TanStack Query | Server state management |
| Database | PostgreSQL | Data persistence |
| Deployment | Railway + Vercel | Hosting & CDN |

## 🎨 Dashboard Features

### V2 Dashboard (Modern)
- **Real-time KPIs** with sparkline trends
- **Interactive charts** (sales trends, response times)
- **Campaign table** with filtering and sorting
- **Dark mode** support
- **Mobile responsive** design
- **Password-based** authentication

### Legacy Dashboard
- Daily runs list with status indicators
- Report detail view
- Channel filtering
- Basic analytics

## 🔐 Authentication

The dashboard uses password-based session authentication:

1. User enters dashboard password
2. Backend validates credentials and creates a secure session
3. Frontend verifies session via `/api/auth/verify`
4. CSRF tokens are required for protected write operations

## 📊 Data Flow

### Report Generation
```
User mentions @Aloware in Slack
    ↓
Slack bot receives mention
    ↓
Generate analytics report
    ↓
Post to Slack thread
    ↓
Log to database (daily_runs)
    ↓
Dashboard polls API
    ↓
Display in real-time
```

### Dashboard Data Flow
```
User visits dashboard
    ↓
Password login
    ↓
Frontend verifies session
    ↓
Fetches /api/runs
    ↓
Backend queries PostgreSQL
    ↓
Returns JSON response
    ↓
React Query caches data
    ↓
Dashboard renders
```

## 🚀 Deployment

### Backend (Railway)
```bash
cd sms-insights
railway login
railway up
```

### Frontend (Vercel)
```bash
cd frontend
vercel --prod
```

See [DEPLOYMENT.md](docs/setup/DEPLOYMENT.md) for detailed instructions.

## 🧪 Development

### Running Tests
```bash
# Backend tests
cd sms-insights
npm test

# Frontend tests (when implemented)
cd frontend
npm test
```

### Code Quality
```bash
# Lint backend
cd sms-insights
npm run lint

# Type check frontend
cd frontend
npm run typecheck:v2
```

### Database Operations
```bash
# Connect to Railway database
railway db:connect

# Run backfill scripts
cd sms-insights
npx tsx scripts/backfill-slack-events.ts
```

## 🐛 Troubleshooting

### Common Issues

**"DATABASE_URL not set"**
- Check `.env` file exists and has DATABASE_URL
- Verify database is accessible

**"Frontend can't reach API"**
- Check `VITE_API_URL` in frontend/.env
- Ensure backend is running on correct port
- Check CORS configuration

**"Password login fails"**
- Verify `DASHBOARD_PASSWORD` is set on the backend
- Check backend logs for rate-limit or session-store errors

See [LOCAL_DEV.md](docs/setup/LOCAL_DEV.md) for more troubleshooting.

## 📈 Monitoring

- **Railway Logs**: `railway logs --follow`
- **Vercel Analytics**: Dashboard → Analytics
- **Database**: Railway dashboard → PostgreSQL

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

See [CONTRIBUTING.md](docs/development/CONTRIBUTING.md) for detailed guidelines.

## 📝 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- Built with [Slack Bolt](https://slack.dev/bolt-js/)
- UI components from [shadcn/ui](https://ui.shadcn.com/)
- Icons by [Lucide](https://lucide.dev/)

---

**Questions?** Check the [documentation](docs/) or open an issue.
