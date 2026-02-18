import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import { getConversationById, listSmsEventsForConversation } from '../services/conversation-store.js';
import { getChannelsWithRuns, getDailyRunById, getDailyRuns, logDailyRun } from '../services/daily-run-logger.js';
import {
  getMetricsOverview,
  getSlaMetrics,
  getVolumeByDayMetrics,
  getWorkloadByRepMetrics,
} from '../services/metrics.js';
import { subscribeRealtimeEvents } from '../services/realtime.js';
import { decodeWorkItemCursor, listOpenWorkItems } from '../services/work-items.js';

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
  const url = new URL(req.url || '', `http://${req.headers.host}`);

  let token: string | null = null;

  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else {
    // SSE/EventSource can't set Authorization headers; allow token via query param for /api/stream only.
    if (url.pathname === '/api/stream') {
      token = url.searchParams.get('token');
    }
  }

  if (!token) return false;

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

const handleGetChannels: RequestHandler = async (_req, res, logger, origin) => {
  const channels = await getChannelsWithRuns(logger);
  sendJson(res, 200, { channels }, origin);
};

const handleGetConversationById: RequestHandler = async (req, res, logger, origin) => {
  const id = req.url?.split('/').pop();
  if (!id) {
    return sendJson(res, 400, { error: 'Missing conversation ID' }, origin);
  }

  const conversation = await getConversationById(id, logger);
  if (!conversation) {
    return sendJson(res, 404, { error: 'Conversation not found' }, origin);
  }

  sendJson(res, 200, { conversation }, origin);
};

const handleGetConversationEvents: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);
  const id = parts[2]; // /api/conversations/:id/events
  if (!id) {
    return sendJson(res, 400, { error: 'Missing conversation ID' }, origin);
  }

  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);

  const conversation = await getConversationById(id, logger);
  if (!conversation) {
    return sendJson(res, 404, { error: 'Conversation not found' }, origin);
  }

  const events = await listSmsEventsForConversation(
    { contact_id: conversation.contact_id, contact_phone: conversation.contact_phone },
    limit,
    logger,
  );

  sendJson(res, 200, { events }, origin);
};

const handleGetMetricsOverview: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const days = Math.min(Number.parseInt(url.searchParams.get('days') || '7', 10) || 7, 90);
  const repId = url.searchParams.get('repId') || undefined;

  const overview = await getMetricsOverview({ windowDays: days, repId }, logger);
  sendJson(res, 200, { overview }, origin);
};

const handleGetMetricsSla: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const days = Math.min(Number.parseInt(url.searchParams.get('days') || '7', 10) || 7, 90);
  const repId = url.searchParams.get('repId') || undefined;

  const sla = await getSlaMetrics({ windowDays: days, repId }, logger);
  sendJson(res, 200, { sla }, origin);
};

const handleGetMetricsWorkloadByRep: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const days = Math.min(Number.parseInt(url.searchParams.get('days') || '7', 10) || 7, 90);

  const workload = await getWorkloadByRepMetrics({ windowDays: days }, logger);
  sendJson(res, 200, { workload }, origin);
};

const handleGetMetricsVolumeByDay: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const days = Math.min(Number.parseInt(url.searchParams.get('days') || '7', 10) || 7, 90);

  const volume = await getVolumeByDayMetrics({ windowDays: days }, logger);
  sendJson(res, 200, { volume }, origin);
};

const handleGetStream: RequestHandler = async (req, res, _logger, origin) => {
  // SSE endpoint for realtime invalidation.
  // Note: we intentionally do not use sendJson here.
  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  res.writeHead(200, headers);

  const writeEvent = (event: unknown) => {
    res.write('event: message\n');
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // initial hello
  writeEvent({ type: 'hello', ts: new Date().toISOString() });

  const unsubscribe = subscribeRealtimeEvents((event) => {
    writeEvent(event);
  });

  const ping = setInterval(() => {
    writeEvent({ type: 'ping', ts: new Date().toISOString() });
  }, 25_000);

  req.on('close', () => {
    clearInterval(ping);
    unsubscribe();
    res.end();
  });
};

const handleGetWorkItems: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const type = url.searchParams.get('type') || undefined;
  const repId = url.searchParams.get('repId') || undefined;
  const severity = (url.searchParams.get('severity') || undefined) as 'low' | 'med' | 'high' | undefined;
  const overdueOnly = url.searchParams.get('overdueOnly') === 'true';
  const dueBefore = url.searchParams.get('dueBefore') || undefined;

  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);
  const offset = Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0;

  const cursorParam = url.searchParams.get('cursor') || undefined;
  const cursor = cursorParam ? decodeWorkItemCursor(cursorParam) : undefined;

  const { items, nextCursor } = await listOpenWorkItems(
    {
      type,
      repId,
      severity,
      overdueOnly,
      dueBefore,
      limit,
      offset: cursor ? undefined : offset, // prefer cursor when provided
      cursor,
    },
    logger,
  );

  sendJson(res, 200, { items, nextCursor }, origin);
};

type ApiRoute = {
  method: 'GET' | 'POST';
  path: string;
  requiresAuth: boolean;
  handler: RequestHandler;
};

const routeMatches = (pathname: string, pattern: string): boolean => {
  const patternRegex = pattern.replace(/:[^\s/]+/g, '[^\\/]+');
  return new RegExp(`^${patternRegex}$`).test(pathname);
};

const apiRoutes: ApiRoute[] = [
  { method: 'GET', path: '/api/auth/verify', requiresAuth: true, handler: handleAuthVerify },
  { method: 'GET', path: '/api/runs', requiresAuth: true, handler: handleGetRuns },
  { method: 'GET', path: '/api/runs/:id', requiresAuth: true, handler: handleGetRunById },
  { method: 'POST', path: '/api/runs', requiresAuth: false, handler: handlePostRun },
  { method: 'GET', path: '/api/channels', requiresAuth: true, handler: handleGetChannels },

  { method: 'GET', path: '/api/conversations/:id', requiresAuth: true, handler: handleGetConversationById },
  { method: 'GET', path: '/api/conversations/:id/events', requiresAuth: true, handler: handleGetConversationEvents },

  { method: 'GET', path: '/api/metrics/overview', requiresAuth: true, handler: handleGetMetricsOverview },
  { method: 'GET', path: '/api/metrics/sla', requiresAuth: true, handler: handleGetMetricsSla },
  { method: 'GET', path: '/api/metrics/workload-by-rep', requiresAuth: true, handler: handleGetMetricsWorkloadByRep },
  { method: 'GET', path: '/api/metrics/volume-by-day', requiresAuth: true, handler: handleGetMetricsVolumeByDay },

  { method: 'GET', path: '/api/stream', requiresAuth: true, handler: handleGetStream },

  { method: 'GET', path: '/api/work-items', requiresAuth: true, handler: handleGetWorkItems },
];

export const handleApiRoute = async (
  req: IncomingMessage & { body?: unknown; user?: unknown },
  res: ServerResponse,
  pathname: string,
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<boolean> => {
  const method = req.method?.toUpperCase() || 'GET';

  // Handle CORS preflight requests
  if (method === 'OPTIONS') {
    const origin = req.headers.origin || 'http://localhost:5173';
    sendJson(res, 200, {}, origin);
    return true;
  }

  for (const route of apiRoutes) {
    if (route.method === method && routeMatches(pathname, route.path)) {
      if (route.requiresAuth) {
        const isValid = await verifyToken(req);
        if (!isValid) {
          const origin = req.headers.origin || 'http://localhost:5173';
          sendJson(res, 401, { error: 'Unauthorized' }, origin);
          return true;
        }
      }

      try {
        // Add origin to handler calls
        const origin = req.headers.origin || 'http://localhost:5173';
        await route.handler(req, res, logger, origin);
      } catch (error) {
        logger?.error('API route error:', error);
        const origin = req.headers.origin || 'http://localhost:5173';
        sendJson(res, 500, { error: 'Internal server error' }, origin);
      }
      return true;
    }
  }

  return false;
};
