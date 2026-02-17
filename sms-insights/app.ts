import { App, LogLevel } from '@slack/bolt';
import 'dotenv/config';
import { createServer } from 'node:http';
import registerListeners from './listeners/index.js';
import { reportError } from './services/error-reporter.js';

const DEFAULT_APP_LOG_LEVEL = LogLevel.INFO;

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
    // Start a simple HTTP server FIRST for health checks (required by Railway)
    const port = Number.parseInt(process.env.PORT || '3000', 10);
    createServer((_req, res) => {
      res.writeHead(200);
      res.end('Health check: OK');
    }).listen(port, '0.0.0.0', () => {
      app.logger.info(`Health check server listening on port ${port}`);
    });

    // Start Bolt App
    await app.start();
    app.logger.info('⚡️ Bolt app is running via Socket Mode!');

    // 🕒 Schedule 4:00 PM Daily Report
    const { scheduleDailyReport } = await import('./services/scheduler.js');
    await scheduleDailyReport(app);

  } catch (error) {
    await reportError(app, error, 'Startup Failure');
  }
})();
