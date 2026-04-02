# 24/7 Background Server Setup

To ensure your Slack bot and HubSpot lead watcher stay active 24/7 without needing an open terminal window, follow these steps.

## 1. Process Management (using PM2)

PM2 is the standard way to keep Node.js apps running in the background. If it crashes, PM2 will automatically restart it.

### Install PM2

Run this in your terminal:

```bash
npm install -g pm2
```

### Start the Bot in Background

Inside your `my-slack-app` directory:

```bash
pm2 start "npm run dev" --name slack-bot
```

### Manage the Bot

- **Check Status**: `pm2 status`
- **View Logs**: `pm2 logs slack-bot`
- **Stop**: `pm2 stop slack-bot`
- **Restart**: `pm2 restart slack-bot`

---

## 2. Keeping your Mac Awake

If your MacBook Pro goes to sleep, the bot will stop. You have two options:

### Option A: The Terminal Command (Temporary)

Run this in a separate terminal tab. It will keep the Mac awake as long as this command is running:

```bash
caffeinate -dis
```

### Option B: The "Amphetamine" App (Recommended)

Install the free **Amphetamine** app from the Mac App Store. It allows you to keep your Mac awake with one click in the menu bar.

---

## 3. Persistent Hosting (True 24/7)

If you don't want to rely on your laptop staying open, the best practice is to deploy to a cloud server:

1.  **Railway.app**: Very easy to set up. Just link your GitHub repo.
2.  **DigitalOcean / AWS / Render**: Other popular options.

If you want to go this route, let me know and I can help you with the deployment steps!
