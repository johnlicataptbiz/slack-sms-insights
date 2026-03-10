# Quick Start Guide

Get up and running with PT Biz SMS Insights in 5 minutes.

## 🚀 Prerequisites

- Node.js 18+ (`node --version`)
- npm 9+ (`npm --version`)
- PostgreSQL 15+ (or Railway account)
- Slack app credentials (or use dummy mode for testing)

## 📦 Installation (2 minutes)

```bash
# 1. Clone the repository
git clone <repo-url>
cd SlackCLI

# 2. Install backend dependencies
cd sms-insights
npm install

# 3. Install frontend dependencies
cd ../frontend
npm install
```

## ⚙️ Configuration (2 minutes)

```bash
# 1. Copy environment template
cd ../sms-insights
cp .env.example .env

# 2. Edit .env with minimum required values:
# - DATABASE_URL (or use Railway)
# - SLACK_BOT_TOKEN (or use <slack-bot-token> for testing)
# - VITE_API_URL=http://localhost:3000
# - DASHBOARD_AUTH_REDIRECT_URI=http://localhost:3000/api/oauth/callback
# - DASHBOARD_AUTH_SUCCESS_URL=http://localhost:5173
# - ALLOW_DUMMY_AUTH_TOKEN=true (for local testing only!)

# 3. Quick edit for dummy mode:
cat > .env << 'EOF'
NODE_ENV=development
SLACK_BOT_TOKEN=<slack-bot-token>
SLACK_SIGNING_SECRET=dummy-secret
DATABASE_URL=postgresql://$(whoami)@localhost:5432/sms_insights
VITE_API_URL=http://localhost:3000
DASHBOARD_AUTH_REDIRECT_URI=http://localhost:3000/api/oauth/callback
DASHBOARD_AUTH_SUCCESS_URL=http://localhost:5173
ALLOW_DUMMY_AUTH_TOKEN=true
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
EOF
```

## 🗄️ Database Setup (1 minute)

### Option A: Local PostgreSQL
```bash
# Create database
createdb sms_insights

# Test connection
psql sms_insights -c "SELECT 1"
```

### Option B: Railway PostgreSQL (Easier)
```bash
# Install Railway CLI
brew install railway

# Login and link project
railway login
railway link

# Get database URL
railway variables | grep DATABASE_URL
# Copy the DATABASE_URL to your .env file
```

## 🏃 Start Development (30 seconds)

```bash
# Terminal 1: Start backend
cd sms-insights
npm run dev

# Terminal 2: Start frontend (in new terminal)
cd frontend
npm run dev
```

**Open browser:** http://localhost:5173

## ✅ Verify Setup

1. **Dashboard loads** → You should see the login page
2. **Dummy auth works** → Click through (dummy mode skips OAuth)
3. **API responds** → Check http://localhost:3000/api/health
4. **Database connected** → Check logs for "Database connection pool initialized"

## 🐛 Common Issues

### "Cannot find module '@slack/web-api'"
```bash
cd sms-insights
npm install
```

### "DATABASE_URL not set"
```bash
# Check .env file exists
cat .env | grep DATABASE_URL

# Test connection
psql $DATABASE_URL -c "SELECT 1"
```

### "Port 3000 already in use"
```bash
# Find and kill process
lsof -ti:3000 | xargs kill -9

# Or use different port
PORT=3001 npm run dev
```

### "Frontend can't reach API"
```bash
# Check VITE_API_URL in frontend/.env
cat frontend/.env | grep VITE_API_URL

# Should be http://localhost:3000
```

## 🧪 Test the Integration

1. **View Dashboard** → http://localhost:5173
2. **Check API directly** → http://localhost:3000/api/runs (requires token in dummy mode)
3. **Test Slack bot** (if not using dummy):
   - Invite bot to test channel
   - Mention: `@Aloware SMS Insights populate daily report for today`
   - Check dashboard for new entry

## 📚 Next Steps

- Read [LOCAL_DEV.md](LOCAL_DEV.md) for detailed setup
- Read [CONTRIBUTING.md](../development/CONTRIBUTING.md) for development workflow
- Check [API.md](../architecture/API.md) for API documentation
- Review [TODO.md](../planning/TODO.md) for implementation tasks

## 🆘 Need Help?

1. Check [IMPROVEMENTS_SUMMARY.md](../development/IMPROVEMENTS_SUMMARY.md) for known issues
2. Review [CODE_IMPROVEMENTS.md](../development/CODE_IMPROVEMENTS.md) for code quality tips
3. Open an issue with:
   - Error message
   - Steps to reproduce
   - Environment details (Node version, OS)

---

**Happy coding! 🎉**
