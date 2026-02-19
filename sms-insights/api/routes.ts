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
import { getSalesMetricsSummary } from '../services/sales-metrics.js';
import { assignWorkItem, decodeWorkItemCursor, listOpenWorkItems, resolveWorkItem } from '../services/work-items.js';

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
    type LegacyRunPayload = {
      channelId: string;
      channelName?: string;
      reportType: 'daily' | 'manual' | 'test';
      status: 'success' | 'error' | 'pending';
      errorMessage?: string;
      summaryText?: string;
      fullReport?: string;
      durationMs?: number;
    };

    const body = (await parseJsonBody(req)) as Partial<LegacyRunPayload>;

    if (!body.channelId || !body.reportType || !body.status) {
      return sendJson(res, 400, { error: 'Missing required fields: channelId, reportType, status' }, origin);
    }

    const { channelId, channelName, reportType, status, errorMessage, summaryText, fullReport, durationMs } =
      body as LegacyRunPayload;

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

  // Fetch recent events to satisfy the frontend Conversation detail view
  const events = await listSmsEventsForConversation(
    { contact_id: conversation.contact_id, contact_phone: conversation.contact_phone },
    50,
    logger,
  );

  // Map to frontend format
  const frontendConversation = {
    id: conversation.id,
    contactId: conversation.contact_id,
    contactName: conversation.contact_phone, // Fallback
    repId: conversation.current_rep_id,
    repName: conversation.current_rep_id ? 'Assigned Rep' : null,
    lastMessageAt: conversation.last_touch_at,
    lastInboundAt: conversation.last_inbound_at,
    lastOutboundAt: conversation.last_outbound_at,
    firstResponseAt: null, // Calculate if needed
    source: 'inbound',
    stage: 'active',
    events: events.map((e) => ({
      id: e.id,
      direction: e.direction,
      body: e.body,
      createdAt: e.event_ts,
    })),
  };

  sendJson(res, 200, frontendConversation, origin);
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

const handleGetMetrics: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const fromStr = url.searchParams.get('from');
  const toStr = url.searchParams.get('to');

  if (!fromStr || !toStr) {
    return sendJson(res, 400, { error: 'Missing from/to params' }, origin);
  }

  const from = new Date(fromStr);
  const to = new Date(toStr);
  const days = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  const windowDays = Math.max(1, Math.min(days, 90));

  const [overview, sla, workload, volume] = await Promise.all([
    getMetricsOverview({ windowDays, repId: undefined }, logger),
    // Pass empty string instead of undefined to avoid pg "could not determine data type of parameter $1"
    // in some environments when the first param is omitted.
    getSlaMetrics({ windowDays, repId: '' }, logger),
    getWorkloadByRepMetrics({ windowDays }, logger),
    getVolumeByDayMetrics({ windowDays }, logger),
  ]).catch((err) => {
    logger?.error('Failed to fetch metrics:', err);
    sendJson(
      res,
      500,
      { error: 'Failed to fetch metrics', details: err instanceof Error ? err.message : String(err) },
      origin,
    );
    return [null, null, null, null] as const;
  });

  if (!overview || !sla || !workload || !volume) {
    return;
  }

  // Transform to frontend MetricsSummary format
  const summary = {
    timeRange: { from: fromStr, to: toStr },
    totalConversations: volume.rows.reduce((acc, r) => acc + r.inbound + r.outbound, 0), // Rough proxy
    newConversations: volume.rows.reduce((acc, r) => acc + r.inbound, 0), // Rough proxy
    reps: workload.rows.map((r) => ({
      repId: r.repId || 'unassigned',
      repName: r.repId || 'Unassigned', // We'd need a rep lookup here
      conversationsHandled: 0, // Placeholder
      avgFirstResponseMinutes: null,
      p90FirstResponseMinutes: null,
      followupLagMinutesAvg: null,
      openWorkItems: r.openWorkItems,
      overdueWorkItems: r.overdueWorkItems,
      conversionRate: null,
    })),
    pipelineVelocity: {
      avgTimeToFirstResponseMinutes: sla.p50Minutes,
      avgTimeToQualifiedMinutes: null,
      avgTimeToCloseWonMinutes: null,
    },
    responseTimeBuckets: sla.buckets,
    openWorkItems: overview.openWorkItems,
    overdueWorkItems: overview.overdueWorkItems,
  };

  sendJson(res, 200, summary, origin);
};

const handleGetSalesMetrics: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const fromStr = url.searchParams.get('from');
  const toStr = url.searchParams.get('to');

  if (!fromStr || !toStr) {
    return sendJson(res, 400, { error: 'Missing from/to params' }, origin);
  }

  const from = new Date(fromStr);
  const to = new Date(toStr);

  try {
    const summary = await getSalesMetricsSummary({ from, to }, logger);
    sendJson(res, 200, summary, origin);
  } catch (err) {
    logger?.error('Failed to fetch sales metrics:', err);
    sendJson(
      res,
      500,
      { error: 'Failed to fetch sales metrics', details: err instanceof Error ? err.message : String(err) },
      origin,
    );
  }
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
    // Map internal event types to frontend event types if needed
    // Currently they match or are compatible
    if (event.type === 'work-item-updated') {
      res.write('event: work-item-updated\n');
      res.write(`data: ${JSON.stringify(event.payload)}\n\n`);
    } else if (event.type === 'work-item-created') {
      res.write('event: work-item-created\n');
      res.write(`data: ${JSON.stringify(event.payload)}\n\n`);
    } else if (event.type === 'runs-updated') {
      res.write('event: runs-updated\n');
      res.write(`data: ${JSON.stringify(event.payload)}\n\n`);
    } else if (event.type === 'metrics-updated') {
      res.write('event: metrics-updated\n');
      res.write('data: {}\n\n');
    } else {
      writeEvent(event);
    }
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
  const _search = url.searchParams.get('search') || undefined; // Not implemented in service yet, but good to have param

  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);
  const offset = Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0;

  const cursorParam = url.searchParams.get('cursor') || undefined;
  const cursor = cursorParam ? decodeWorkItemCursor(cursorParam) : undefined;

  const { items, nextCursor: _nextCursor } = await listOpenWorkItems(
    {
      type: type === 'ALL' ? undefined : type,
      repId: repId === 'all' ? undefined : repId === 'me' ? 'dummy-user' : repId, // Handle 'me' and 'all'
      severity,
      overdueOnly,
      dueBefore,
      limit,
      offset: cursor ? undefined : offset, // prefer cursor when provided
      cursor,
    },
    logger,
  );

  // Transform to frontend WorkItem format
  const frontendItems = items.map((item) => ({
    id: item.id,
    type: item.type,
    status: item.resolved_at ? 'resolved' : 'open',
    conversationId: item.conversation_id,
    contactName: item.contact_phone || 'Unknown', // Use phone as name fallback
    repId: item.rep_id,
    repName: item.rep_id ? 'Assigned Rep' : null, // Placeholder
    createdAt: item.created_at,
    dueAt: item.due_at,
    priority: item.severity === 'med' ? 'medium' : item.severity,
    slaMinutes: null,
    currentLagMinutes: null, // Calculate if needed
    tags: [],
    slackPermalink: undefined, // Add if available
  }));

  sendJson(res, 200, frontendItems, origin);
};

const handleResolveWorkItem: RequestHandler = async (req, res, logger, origin) => {
  const id = req.url?.split('/')[3]; // /api/work-items/:id/resolve
  if (!id) {
    return sendJson(res, 400, { error: 'Missing work item ID' }, origin);
  }

  const success = await resolveWorkItem(id, logger);
  if (!success) {
    return sendJson(res, 404, { error: 'Work item not found or already resolved' }, origin);
  }

  sendJson(res, 200, { success: true }, origin);
};

const handleAssignWorkItem: RequestHandler = async (req, res, logger, origin) => {
  const id = req.url?.split('/')[3]; // /api/work-items/:id/assign
  if (!id) {
    return sendJson(res, 400, { error: 'Missing work item ID' }, origin);
  }

  try {
    const body = (await parseJsonBody(req)) as { repId: string };
    if (!body.repId) {
      return sendJson(res, 400, { error: 'Missing repId' }, origin);
    }

    const success = await assignWorkItem(id, body.repId, logger);
    if (!success) {
      return sendJson(res, 404, { error: 'Work item not found' }, origin);
    }

    sendJson(res, 200, { success: true }, origin);
  } catch (_error) {
    sendJson(res, 400, { error: 'Invalid request body' }, origin);
  }
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

  { method: 'GET', path: '/api/metrics', requiresAuth: true, handler: handleGetMetrics },
  { method: 'GET', path: '/api/sales-metrics', requiresAuth: true, handler: handleGetSalesMetrics },

  { method: 'GET', path: '/api/stream', requiresAuth: true, handler: handleGetStream },

  { method: 'GET', path: '/api/work-items', requiresAuth: true, handler: handleGetWorkItems },
  { method: 'POST', path: '/api/work-items/:id/resolve', requiresAuth: true, handler: handleResolveWorkItem },
  { method: 'POST', path: '/api/work-items/:id/assign', requiresAuth: true, handler: handleAssignWorkItem },
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
    const requestOrigin = req.headers.origin;
    const origin = requestOrigin ? requestOrigin : 'http://localhost:5173';
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
        // Add origin to handler calls.
        // In production, the dashboard is hosted on Vercel, so we must allow that origin for CORS.
        // If no Origin header is present, fall back to localhost for local dev.
        const requestOrigin = req.headers.origin;
        const origin = requestOrigin ? requestOrigin : 'http://localhost:5173';
        await route.handler(req, res, logger, origin);
      } catch (error) {
        logger?.error('API route error:', error);
        const requestOrigin = req.headers.origin;
        const origin = requestOrigin ? requestOrigin : 'http://localhost:5173';
        sendJson(res, 500, { error: 'Internal server error' }, origin);
      }
      return true;
    }
  }

  return false;
};
