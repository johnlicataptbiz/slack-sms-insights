import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import { getChannelsWithRuns, getDailyRunById, getDailyRuns, logDailyRun } from '../services/daily-run-logger.js';
import { listOpenWorkItems } from '../services/work-items.js';

type RequestHandler = (
  req: IncomingMessage & { body?: unknown; user?: unknown },
  res: ServerResponse,
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
  origin?: string,
) => Promise<void>;

// Parse JSON body
const parseJsonBody = async (req: IncomingMessage): Promise<unknown> => {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk.toString();
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
};

// Verify token from Authorization header
const verifyToken = async (req: IncomingMessage & { user?: unknown }): Promise<boolean> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7);

  // Accept dummy token for bypassing auth
  if (token === 'dummy-token-bypass-auth') {
    (req as { user?: unknown }).user = { user_id: 'dummy-user', team_id: 'dummy-team' };
    return true;
  }

  try {
    const slack = new WebClient(token);
    const auth = await slack.auth.test();
    (req as { user?: unknown }).user = auth;
    return true;
  } catch {
    return false;
  }
};

const sendJson = (res: ServerResponse, statusCode: number, data: unknown, origin?: string) => {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(data));
};

const handleAuthVerify: RequestHandler = async (req, res, _logger, origin) => {
  sendJson(res, 200, { ok: true, user: (req as { user?: unknown }).user }, origin);
};

const handleGetRuns: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const channelId = url.searchParams.get('channelId') || undefined;
  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50, 100);
  const offset = Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0;
  const daysBack = Number.parseInt(url.searchParams.get('daysBack') || '7', 10) || 7;

  const runs = await getDailyRuns(
    {
      channelId: channelId as string | undefined,
      limit,
      offset,
      daysBack,
    },
    logger,
  );

  sendJson(res, 200, { runs }, origin);
};

const handleGetRunById: RequestHandler = async (req, res, logger, origin) => {
  const id = req.url?.split('/').pop();
  if (!id) {
    return sendJson(res, 400, { error: 'Missing run ID' }, origin);
  }

  const run = await getDailyRunById(id, logger);
  if (!run) {
    return sendJson(res, 404, { error: 'Run not found' }, origin);
  }

  sendJson(res, 200, { run }, origin);
};

const handlePostRun: RequestHandler = async (req, res, logger, origin) => {
  const botToken = req.headers['x-bot-token'];
  if (botToken !== process.env.SLACK_BOT_TOKEN) {
    return sendJson(res, 401, { error: 'Invalid bot token' }, origin);
  }

  try {
    const body = await parseJsonBody(req);
    // biome-ignore lint/suspicious/noExplicitAny: legacy endpoint accepts arbitrary JSON payload from bot.
    const { channelId, channelName, reportType, status, errorMessage, summaryText, fullReport, durationMs } =
      body as any;

    const runId = await logDailyRun(
      {
        channelId,
        channelName,
        reportType,
        status,
        errorMessage,
        summaryText,
        fullReport,
        durationMs,
      },
      logger,
    );

    if (!runId) {
      return sendJson(res, 500, { error: 'Failed to log run' }, origin);
    }

    sendJson(res, 200, { runId }, origin);
  } catch (error) {
    logger?.error('Failed to post run:', error);
    sendJson(res, 400, { error: 'Invalid request' }, origin);
  }
};

const handleGetChannels: RequestHandler = async (req, res, logger, origin) => {
  const channels = await getChannelsWithRuns(logger);
  sendJson(res, 200, { channels }, origin);
};

const handleGetWorkItems: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const type = url.searchParams.get('type') || undefined;
  const repId = url.searchParams.get('repId') || undefined;
  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50, 100);
  const offset = Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0;

  const items = await listOpenWorkItems({ type, repId, limit, offset }, logger);
  sendJson(res, 200, { items }, origin);
};

type RouteHandler = {
  path: string;
  method: 'GET' | 'POST';
  requiresAuth: boolean;
  handler: RequestHandler;
};

export const apiRoutes: RouteHandler[] = [
  { path: '/api/auth/verify', method: 'GET', requiresAuth: true, handler: handleAuthVerify },
  { path: '/api/runs', method: 'GET', requiresAuth: true, handler: handleGetRuns },
  { path: '/api/runs/:id', method: 'GET', requiresAuth: true, handler: handleGetRunById },
  { path: '/api/runs', method: 'POST', requiresAuth: false, handler: handlePostRun }, // Bot posts without user auth
  { path: '/api/channels', method: 'GET', requiresAuth: true, handler: handleGetChannels },
  { path: '/api/work-items', method: 'GET', requiresAuth: true, handler: handleGetWorkItems },
];

export const routeMatches = (pathname: string, pattern: string): boolean => {
  const patternRegex = pattern.replace(/:[^\s/]+/g, '[^\\/]+');
  return new RegExp(`^${patternRegex}$`).test(pathname);
};

export const handleApiRoute = async (
  req: IncomingMessage & { body?: unknown; user?: unknown },
  res: ServerResponse,
  pathname: string,
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<boolean> => {
  const method = req.method?.toUpperCase() || 'GET';

  // Handle CORS preflight requests
  if (method === 'OPTIONS') {
    const origin = req.headers.origin || 'http://localhost:5174';
    sendJson(res, 200, {}, origin);
    return true;
  }

  for (const route of apiRoutes) {
    if (route.method === method && routeMatches(pathname, route.path)) {
      if (route.requiresAuth) {
        const isValid = await verifyToken(req);
        if (!isValid) {
          const origin = req.headers.origin || 'http://localhost:5174';
          sendJson(res, 401, { error: 'Unauthorized' }, origin);
          return true;
        }
      }

      try {
        // Add origin to handler calls
        const origin = req.headers.origin || 'http://localhost:5174';
        await route.handler(req, res, logger, origin);
      } catch (error) {
        logger?.error('API route error:', error);
        const origin = req.headers.origin || 'http://localhost:5174';
        sendJson(res, 500, { error: 'Internal server error' }, origin);
      }
      return true;
    }
  }

  return false;
};
