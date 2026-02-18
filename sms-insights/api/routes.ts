import type { IncomingMessage, ServerResponse } from 'node:http';
import { WebClient } from '@slack/web-api';
import type { Logger } from '@slack/bolt';
import { logDailyRun, getDailyRuns, getDailyRunById, getChannelsWithRuns } from '../services/daily-run-logger.js';

type RequestHandler = (req: IncomingMessage & { body?: any; user?: any }, res: ServerResponse, logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>, origin?: string) => Promise<void>;

// Parse JSON body
const parseJsonBody = async (req: IncomingMessage): Promise<any> => {
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
const verifyToken = async (req: IncomingMessage & { user?: any }): Promise<boolean> => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7);
  
  // Accept dummy token for bypassing auth
  if (token === 'dummy-token-bypass-auth') {
    (req as any).user = { user_id: 'dummy-user', team_id: 'dummy-team' };
    return true;
  }
  
  try {
    const slack = new WebClient(token);
    const auth = await slack.auth.test();
    (req as any).user = auth;
    return true;
  } catch {
    return false;
  }
};

const sendJson = (res: ServerResponse, statusCode: number, data: any, origin?: string) => {
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

// OAuth endpoints
const handleOAuthStart: RequestHandler = async (req, res, logger, origin) => {
  const clientId = process.env.SLACK_CLIENT_ID;
  const redirectUri = process.env.DASHBOARD_AUTH_REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/api/oauth/callback`;
  const scopes = ['users:read', 'chat:read'];
  const state = Math.random().toString(36).substring(7);

  if (!clientId) {
    return sendJson(res, 500, { error: 'SLACK_CLIENT_ID not configured' }, origin);
  }

  const url = new URL('https://slack.com/oauth/v2/authorize');
  url.searchParams.append('client_id', clientId);
  url.searchParams.append('scope', scopes.join(','));
  url.searchParams.append('redirect_uri', redirectUri);
  url.searchParams.append('state', state);

  res.writeHead(302, { Location: url.toString() });
  res.end();
};

const handleOAuthCallback: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');

  if (error) {
    return sendJson(res, 400, { error: `OAuth error: ${error}` }, origin);
  }

  if (!code) {
    return sendJson(res, 400, { error: 'Missing authorization code' }, origin);
  }

  try {
    const clientId = process.env.SLACK_CLIENT_ID;
    const clientSecret = process.env.SLACK_CLIENT_SECRET;
    const redirectUri = process.env.DASHBOARD_AUTH_REDIRECT_URI || `http://localhost:${process.env.PORT || 3000}/api/oauth/callback`;

    if (!clientId || !clientSecret) {
      return sendJson(res, 500, { error: 'OAuth credentials not configured' }, origin);
    }

    const slack = new WebClient();
    const result = await slack.oauth.v2.access({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    if (!result.ok) {
      return sendJson(res, 400, { error: result.error }, origin);
    }

    const token = result.access_token;
    const frontendUrl = process.env.VITE_API_URL || `http://localhost:${process.env.PORT || 3000}`;
    res.writeHead(302, { Location: `${frontendUrl}/?token=${encodeURIComponent(token || '')}` });
    res.end();
  } catch (error) {
    logger?.error('OAuth callback error:', error);
    sendJson(res, 500, { error: 'OAuth exchange failed' }, origin);
  }
};

const handleAuthVerify: RequestHandler = async (req, res, logger, origin) => {
  sendJson(res, 200, { ok: true, user: (req as any).user }, origin);
};

const handleGetRuns: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const channelId = url.searchParams.get('channelId') || undefined;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 100);
  const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;
  const daysBack = parseInt(url.searchParams.get('daysBack') || '7', 10) || 7;

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
    const { channelId, channelName, reportType, status, errorMessage, summaryText, fullReport, durationMs } = body;

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

type RouteHandler = {
  path: string;
  method: 'GET' | 'POST';
  requiresAuth: boolean;
  handler: RequestHandler;
};

export const apiRoutes: RouteHandler[] = [
  { path: '/api/oauth/start', method: 'GET', requiresAuth: false, handler: handleOAuthStart },
  { path: '/api/oauth/callback', method: 'GET', requiresAuth: false, handler: handleOAuthCallback },
  { path: '/api/auth/verify', method: 'GET', requiresAuth: true, handler: handleAuthVerify },
  { path: '/api/runs', method: 'GET', requiresAuth: true, handler: handleGetRuns },
  { path: '/api/runs/:id', method: 'GET', requiresAuth: true, handler: handleGetRunById },
  { path: '/api/runs', method: 'POST', requiresAuth: false, handler: handlePostRun }, // Bot posts without user auth
  { path: '/api/channels', method: 'GET', requiresAuth: true, handler: handleGetChannels },
];

export const routeMatches = (pathname: string, pattern: string): boolean => {
  const patternRegex = pattern.replace(/:[^\s/]+/g, '[^\\/]+');
  return new RegExp(`^${patternRegex}$`).test(pathname);
};

export const handleApiRoute = async (
  req: IncomingMessage & { body?: any; user?: any },
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
