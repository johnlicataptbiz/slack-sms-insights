# PT Biz SMS Insights Onboarding

Welcome to the PT Biz SMS Insights project! This document provides a comprehensive guide to get you started with development.

## 1. Project Overview

PT Biz SMS Insights is a real-time SMS analytics dashboard integrated with Slack, Aloware, and Monday.com. It provides daily reports, conversation insights, and sales metrics for SMS marketing campaigns.

### Key Features

- **Real-time SMS Campaign Monitoring:** Track campaigns through Slack integration.
- **Daily Analytics Reports:** Generate daily reports with sales metrics, response rates, and booked calls.
- **Conversation Tracking:** Monitor conversations across multiple channels with SLA monitoring.
- **CRM Integration:** Sync with Monday.com for lead management and call tracking.
- **Modern Dashboard:** An interactive web UI with charts, KPIs, and real-time data.

## 2. System Architecture

The system is composed of three main parts: a **backend service**, a **frontend dashboard**, and a **Slack workflow** for scheduling.

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
│  │ work_items  │ │booked_calls │ │   users     │          │
│  │   (SLA)     │ │   (calls)   │ │  (oauth)    │          │
│  └─────────────┘ └─────────────┘ └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

## 3. Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 15+
- Slack CLI
- A development Slack workspace on a paid plan

### 3.1 Backend & Frontend Setup

1. **Clone and install dependencies**
   ```bash
   git clone <repo-url>
   cd SlackCLI

   # backend
   cd sms-insights
   npm install

   # frontend
   cd ../frontend
   npm install
   ```

2. **Configure environment**
   ```bash
   cd sms-insights
   cp .env.example .env
   ```
   Edit `.env` and provide at minimum:
   - `DATABASE_URL`
   - `SLACK_BOT_TOKEN`
   - `SLACK_APP_TOKEN`
   - `DASHBOARD_PASSWORD` (for dashboard auth)

3. **Run local development**
   ```bash
   # Terminal 1 (backend)
   cd sms-insights
   npm run dev

   # Terminal 2 (frontend)
   cd frontend
   npm run dev
   ```
   Frontend is available at `http://localhost:5173`.

4. **Run validation checks**
   ```bash
   # backend lint + tests
   cd sms-insights
   npm run lint
   npm test

   # frontend typecheck + tests
   cd frontend
   npm run typecheck:v2
   npx vitest run
   ```

### 3.2 Slack Workflow Setup

The `sms-insights-workflow` project automates the daily request for SMS reports.

1.  **Install Slack CLI:**
    Follow the [Quickstart Guide](https://api.slack.com/automation/quickstart) to install and configure the Slack CLI.

2.  **Run the Workflow Locally:**
    ```bash
    cd sms-insights-workflow
    slack run
    ```

3.  **Create a Trigger:**
    On the first run, the CLI will prompt you to create a trigger. For local development, you must set the `SMS_REPORT_CHANNEL_ID` environment variable to a non-production channel.
    ```bash
    SMS_REPORT_CHANNEL_ID=C0123456789 slack trigger create --trigger-def triggers/daily_sms_report_scheduled_trigger.ts
    ```

## 4. Project Structure

```
SlackCLI/
├── sms-insights/              # Backend (Node.js/TypeScript)
├── frontend/                  # Frontend (React/Vite)
├── sms-insights-workflow/     # Slack Workflow (Deno) for scheduling
└── docs/                      # Documentation
```

## 5. Usage Guide

### Common day-to-day commands

```bash
# start backend
cd sms-insights && npm run dev

# start frontend
cd frontend && npm run dev

# backend production build (+ frontend build if present)
cd sms-insights && npm run build

# frontend production build
cd frontend && npm run build
```

### Backend utility scripts

From `sms-insights/`:
- `npm run backfill:slack`
- `npm run backfill:booked-calls`
- `npm run backfill:contact-profiles`
- `npm run sync:monday`
- `npm run rebuild:monday:governed`
- `npm run regenerate:runs`

## 6. Deployment

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

### Slack Workflow (Slack Infrastructure)

```bash
cd sms-insights-workflow
slack deploy
```
When deploying, you will be prompted to create a production trigger. To target the production channel, set the `SMS_REPORT_USE_PRODUCTION_CHANNEL` environment variable:
```bash
SMS_REPORT_USE_PRODUCTION_CHANNEL=true slack trigger create --trigger-def triggers/daily_sms_report_scheduled_trigger.ts
```

## 7. Key Technologies

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Backend | Node.js + TypeScript | API server, Slack bot |
| Slack | @slack/bolt | Slack app framework |
| Frontend | React 19 + Vite | Dashboard UI |
| Styling | Tailwind CSS v4 | Utility-first CSS |
| Components | shadcn/ui | Accessible UI components |
| Workflow | Deno + Slack SDK | Scheduled automation |
| Database | PostgreSQL | Data persistence |
| Deployment | Railway + Vercel | Hosting & CDN |
