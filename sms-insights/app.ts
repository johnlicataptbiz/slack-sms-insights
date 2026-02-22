import { App, LogLevel } from '@slack/bolt';
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApiRoute } from './api/routes.js';
import registerListeners from './listeners/index.js';
import { initDatabase, initializeSchema } from './services/db.js';
import { reportError } from './services/error-reporter.js';
import { startMondaySyncJobs } from './services/monday-sync.js';

const DEFAULT_APP_LOG_LEVEL = LogLevel.INFO;
const safeEnvLen = (value: string | undefined): number => (value || '').trim().length;

const getLogLevel = (): LogLevel => {
  const configured = process.env.APP_LOG_LEVEL?.trim().toUpperCase();
  if (configured === 'DEBUG') {
    return LogLevel.DEBUG;
  }
  if (configured === 'WARN') {
    return LogLevel.WARN;
  }
  if (configured === 'ERROR') {
    return LogLevel.ERROR;
  }
  return DEFAULT_APP_LOG_LEVEL;
};

/** Initialization */
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  logLevel: getLogLevel(),
});

/** Register Listeners */
registerListeners(app);

/** Global Error Handler */
app.error(async (error) => {
  await reportError(app, error, 'Global App Error');
});

/** Start Bolt App */
(async () => {
  try {
    // Initialize database
    await initDatabase(app.logger);
    await initializeSchema();

    // Get frontend dist path
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = join(__filename, '..');
    const frontendDistPath = join(__dirname, '../frontend/dist');
    let frontendIndex: string | null = null;

    try {
      frontendIndex = readFileSync(join(frontendDistPath, 'index.html'), 'utf-8');
    } catch {
      app.logger.warn('Frontend dist not found; dashboard will be unavailable');
    }

    // Start HTTP server with API + static file serving
    const port = Number.parseInt(process.env.PORT || '3000', 10);
    const server = createServer(async (req, res) => {
      const pathname = new URL(req.url || '/', `http://${req.headers.host}`).pathname;

      // Handle API routes
      if (pathname.startsWith('/api/')) {
        const handled = await handleApiRoute(req, res, pathname, app.logger);
        if (handled) {
          return;
        }
      }

      // Serve frontend
      if (frontendIndex && !pathname.startsWith('/api/')) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(frontendIndex);
        return;
      }

      // Fallback health check
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Health check: OK');
    });

    server.listen(port, '0.0.0.0', () => {
      app.logger.info(`🌐 HTTP server listening on port ${port}`);
    });

    // Start Bolt App
    await app.start();
    app.logger.info('⚡️ Bolt app is running via Socket Mode!');
    app.logger.info('Token config diagnostics', {
      alowareApiTokenLength: safeEnvLen(process.env.ALOWARE_API_TOKEN),
      alowareWebhookTokenLength: safeEnvLen(process.env.ALOWARE_WEBHOOK_API_TOKEN),
      alowareFormTokenLength: safeEnvLen(process.env.ALOWARE_FORM_API_TOKEN),
      mondayTokenLength: safeEnvLen(process.env.MONDAY_API_TOKEN),
    });

    // 🕒 Schedule 6:00 AM Daily Report
    const { scheduleDailyReport } = await import('./services/scheduler.js');
    await scheduleDailyReport(app);

    // monday read-sync/writeback maintenance jobs (feature-flag gated).
    startMondaySyncJobs(app.logger);
  } catch (error) {
    await reportError(app, error, 'Startup Failure');
  }
})();
