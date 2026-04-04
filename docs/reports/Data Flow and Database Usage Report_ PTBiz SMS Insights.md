# Data Flow and Database Usage Report: PTBiz SMS Insights

I have investigated your `slack-sms-insights` project across GitHub, Vercel, and Railway to clarify how data flows from Slack and Aloware into your databases. Here is a comprehensive breakdown of the architecture and data pipeline.

## 1. Which Database is Being Used?

Your application uses **Prisma** as the Object-Relational Mapper (ORM) to interact with a **PostgreSQL** database hosted on **Railway**. 

There is no separate "Prisma database" versus "Railway database" in terms of the application's runtime logic. Prisma is simply the tool (the code library) used to talk to the Railway PostgreSQL database.

### The Confusion Explained
*   **Railway** is the hosting provider where your actual PostgreSQL database server lives (e.g., `crossover.proxy.rlwy.net`).
*   **Prisma** is the ORM used in your Node.js backend (`sms-insights` folder) to query that database.
*   **Prisma Accelerate / Optimize** (the API key you provided earlier) is a connection pooling and caching layer provided by Prisma. It acts as a middleman between your application and your Railway database to improve performance.

**Conclusion:** The data lives in Railway. Prisma is the tool used to read/write that data. The "Prisma DB" you saw earlier with 50 tables is likely your production database connected via Prisma Accelerate, while the Railway DB with 23 tables might be a staging/development instance or an older deployment.

## 2. How Data Feeds into the System

The data flow originates from **Aloware** and is routed through **Slack** before being ingested into your database via the backend API.

### The Data Pipeline

1.  **Aloware to Slack:** Aloware sends SMS event notifications (inbound/outbound messages, daily snapshots) to specific Slack channels (e.g., `#aloware-alerts`) using a Slack integration or webhook.
2.  **Slack to Backend API:** Your backend application (`sms-insights`) runs a Slack Bot using the `@slack/bolt` framework. This bot listens to messages in those specific channels.
3.  **Parsing and Extraction:** When a message arrives, the `listeners/messages/index.ts` file intercepts it. It uses the `aloware-parser.ts` service to extract key information from the Slack message text and attachments, such as:
    *   Contact Name and Phone Number
    *   Message Body
    *   Direction (Inbound/Outbound)
    *   Aloware User
4.  **Database Insertion (Prisma to Railway):** Once parsed, the data is passed to the `sms-event-store.ts` service. This service uses the Prisma Client (`prisma.sms_events.upsert`) to insert or update the record in the PostgreSQL database hosted on Railway.

### Additional Integrations

*   **Monday.com:** The backend also has extensive background jobs (cron jobs) that sync data between your database and Monday.com boards (e.g., `monday-sync.ts`). It pulls lead data from Monday.com and pushes SMS metrics and booked call data back to Monday.com.
*   **HubSpot:** There is also logic (`hubspot-sync.ts`) to sync AI-generated notes and contact activities to HubSpot based on phone numbers.

## 3. Deployment Architecture

*   **Frontend (Vercel):** The React SPA (`frontend` folder) is deployed on Vercel (`sms-insights-dashboard`). It does not connect to the database directly. Instead, it makes HTTP requests to your backend API. The Vercel configuration (`vercel.json`) proxies `/api/*` requests to `https://sms-insights-production.up.railway.app/api/`.
*   **Backend (Railway):** The Node.js API and Slack Bot (`sms-insights` folder) are deployed on Railway as a service named `sms-insights-backend`. This service connects directly to the Railway PostgreSQL database using the `DATABASE_URL` environment variable.

## Summary

1.  **Aloware** sends alerts to **Slack**.
2.  Your **Slack Bot** (running on Railway) reads those messages.
3.  The Bot parses the data and uses **Prisma** to save it to your **Railway PostgreSQL** database.
4.  Your **Vercel Frontend** fetches this data from the Railway Backend to display the dashboard.

I hope this clears up the confusion! Let me know if you need further details on any specific part of the pipeline.
