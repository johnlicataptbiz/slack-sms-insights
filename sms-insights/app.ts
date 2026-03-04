import { App, LogLevel } from '@slack/bolt';
import compression from 'compression';
import 'dotenv/config';
import { createReadStream, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleApiRoute } from './api/routes.js';
import registerListeners from './listeners/index.js';
import { initDatabase, initializeSchema } from './services/db.js';
import { reportError } from './services/error-reporter.js';
import { logger } from './services/logger.js';
import { startMondaySyncJobs } from './services/monday-sync.js';
import { setSlackAuthRuntimeStatus } from './services/runtime-status.js';
import { assertStreamTokenSecretConfigured, getStreamTokenSecretConfigStatus } from './services/stream-token.js';

const DEFAULT_APP_LOG_LEVEL = LogLevel.INFO;
const safeEnvLen = (value: string | undefined): number => (value || '').trim().length;
const isProduction = (): boolean => (process.env.NODE_ENV || '').trim().toLowerCase() === 'production';

const assertStartupSecurityConfig = (): void => {
  const allowDummyAuthToken = (process.env.ALLOW_DUMMY_AUTH_TOKEN || '').trim().toLowerCase() === 'true';
  if (allowDummyAuthToken && isProduction()) {
    throw new Error('ALLOW_DUMMY_AUTH_TOKEN cannot be enabled in production.');
  }
  assertStreamTokenSecretConfigured();
};

type SlackStartupErrorLike = {
  code?: string;
  data?: { error?: string };
  message?: string;
};

const parseSlackStartupError = (error: unknown): { invalidAuth: boolean; reason: string } => {
  const fallback = error instanceof Error ? error.message : String(error);
  if (!error || typeof error !== 'object') {
    return { invalidAuth: false, reason: fallback };
  }
  const err = error as SlackStartupErrorLike;
  if (err.data?.error === 'invalid_auth' || err.code === 'slack_webapi_platform_error') {
    return { invalidAuth: true, reason: err.data?.error || err.message || fallback };
  }
  return { invalidAuth: false, reason: err.message || fallback };
};

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

const responseSecurityHeaders: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

const getContentType = (ext: string): string => {
  const types: Record<string, string> = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain',
    '.pdf': 'application/pdf',
  };
  return types[ext.toLowerCase()] || 'application/octet-stream';
};

/** Initialization */
const isDummyToken = process.env.SLACK_BOT_TOKEN === 'xoxb-dummy';
const app = new App({
  token: isDummyToken ? undefined : process.env.SLACK_BOT_TOKEN,
  authorize: isDummyToken
    ? async () => ({
        botToken: 'xoxb-dummy',
        botId: 'B_DUMMY',
        teamId: 'T_DUMMY',
      })
    : undefined,
  socketMode: !isDummyToken,
  appToken: isDummyToken ? undefined : process.env.SLACK_APP_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET || 'dummy-secret',
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
    setSlackAuthRuntimeStatus('unknown', 'Slack runtime has not started yet');
    assertStartupSecurityConfig();
    const streamStatus = getStreamTokenSecretConfigStatus();
    if (streamStatus.status !== 'ok') {
      logger.app.warn(`[startup] stream token config: ${streamStatus.reason}`);
    }

    // Initialize database
    await initDatabase(app.logger);
    await initializeSchema();

    // Frontend is deployed on Vercel in production. Only attempt to serve a local
    // `frontend/dist` bundle when explicitly enabled (useful for single-container dev).
    const serveFrontendFromDisk = (process.env.SERVE_FRONTEND_FROM_DISK || '').trim().toLowerCase() === 'true';

    // Get frontend dist path
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = join(__filename, '..');
    const frontendDistPath = join(__dirname, '../frontend/dist');
    let frontendIndex: string | null = null;

    if (serveFrontendFromDisk) {
      try {
        frontendIndex = readFileSync(join(frontendDistPath, 'index.html'), 'utf-8');
      } catch {
        logger.app.warn('Frontend dist not found; dashboard will be unavailable');
      }
    }

    // Start HTTP server with API + static file serving
    const port = Number.parseInt(process.env.PORT || '3000', 10);

    // Compression middleware wrapper
    const compressionMiddleware = compression();
    const server = createServer((req, res) => {
      // Apply compression
      compressionMiddleware(req, res, () => {
        // Continue with request handling
        void (async () => {
          const pathname = new URL(req.url || '/', `http://${req.headers.host}`).pathname;

          // Handle API routes
          if (pathname.startsWith('/api/')) {
            const handled = await handleApiRoute(req, res, pathname, app.logger);
            if (handled) {
              return;
            }
          }

          // Serve static files from public directory
          if (!pathname.startsWith('/api/') && !pathname.startsWith('/assets/')) {
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = join(__filename, '..');
            const publicDir = join(__dirname, 'public');
            const filePath = join(publicDir, pathname === '/' ? '/index.html' : pathname);

            try {
              const stats = statSync(filePath);
              if (stats.isFile()) {
                const contentType = getContentType(extname(filePath));
                res.writeHead(200, {
                  ...responseSecurityHeaders,
                  'Content-Type': contentType,
                });
                createReadStream(filePath).pipe(res);
                return;
              }
            } catch (_error) {
              // File doesn't exist, continue to other handlers
            }
          }

          // Serve frontend
          if (frontendIndex && !pathname.startsWith('/api/')) {
            res.writeHead(200, {
              ...responseSecurityHeaders,
              'Content-Type': 'text/html',
              'Content-Security-Policy':
                "default-src 'self'; img-src 'self' https: data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' https://slack.com https://*.slack.com;",
            });
            res.end(frontendIndex);
            return;
          }

          // Fallback health check
          res.writeHead(200, {
            ...responseSecurityHeaders,
            'Content-Type': 'text/plain',
          });
          res.end('Health check: OK');
        })();
      });
    });

    server.listen(port, '0.0.0.0', () => {
      logger.app.info(`🌐 HTTP server listening on port ${port}`);
    });

    // Start Bolt App
    let slackStarted = false;
    if (process.env.SLACK_BOT_TOKEN === 'xoxb-dummy') {
      setSlackAuthRuntimeStatus('disabled', 'Slack bot runtime disabled: xoxb-dummy token in use');
      logger.app.info('⚡️ Bolt app skipped (dummy token detected)');
    } else {
      const missingSlackEnv: string[] = [];
      if (!(process.env.SLACK_BOT_TOKEN || '').trim()) missingSlackEnv.push('SLACK_BOT_TOKEN');
      if (!(process.env.SLACK_APP_TOKEN || '').trim()) missingSlackEnv.push('SLACK_APP_TOKEN');

      if (missingSlackEnv.length > 0) {
        const detail = `Slack runtime disabled: missing required env vars ${missingSlackEnv.join(', ')}`;
        setSlackAuthRuntimeStatus('error', detail);
        logger.app.error(detail);
      } else {
        try {
          await app.start();
          slackStarted = true;
          setSlackAuthRuntimeStatus('ok', 'Slack Bolt app started in Socket Mode');
          logger.app.info('⚡️ Bolt app is running via Socket Mode!');
        } catch (error) {
          const parsed = parseSlackStartupError(error);
          const detail = parsed.invalidAuth
            ? 'Slack startup failed (invalid_auth). Check SLACK_BOT_TOKEN and SLACK_APP_TOKEN.'
            : `Slack startup failed: ${parsed.reason}`;
          setSlackAuthRuntimeStatus('error', detail);
          logger.app.error(detail);
          await reportError(app, error, 'Slack Startup Failure');
        }
      }
    }

    logger.app.info({
      msg: 'Token config diagnostics',
      alowareApiTokenLength: safeEnvLen(process.env.ALOWARE_API_TOKEN),
      alowareWebhookTokenLength: safeEnvLen(process.env.ALOWARE_WEBHOOK_API_TOKEN),
      alowareFormTokenLength: safeEnvLen(process.env.ALOWARE_FORM_API_TOKEN),
      mondayTokenLength: safeEnvLen(process.env.MONDAY_API_TOKEN),
    });

    // 🕒 Daily Report Cron — fires at 6:00 AM CT every day via user token
    if (slackStarted) {
      const { startDailyReportCron, startLrnRefreshCron } = await import('./services/cron-scheduler.js');
      await startDailyReportCron(app);
      startLrnRefreshCron(app);
    }

    // monday read-sync/writeback maintenance jobs (feature-flag gated).
    startMondaySyncJobs(app.logger);
  } catch (error) {
    logger.app.error(`[startup] Fatal startup error: ${error instanceof Error ? error.message : String(error)}`);
    await reportError(app, error, 'Startup Failure');
  }
})();
