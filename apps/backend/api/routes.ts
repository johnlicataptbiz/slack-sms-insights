import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from '@slack/bolt';
import { timingSafeEqual } from 'node:crypto';

// Import V2 service functions
import { getInsightsSummary } from '../services/insights-summary.js';
import { getSalesMetricsSummary } from '../services/sales-metrics.js';
import { listInboxConversations, listMessageTemplates } from '../services/inbox-store.js';
import { listSendLineOptions } from '../services/send-line-catalog.js';
import { getDailyRuns, getChannelsWithRuns } from '../services/daily-run-logger.js';
import { getSequencesDeep } from '../services/sequences-deep.js';
import { getAttributionLagStatus } from '../services/attribution-health.js';
import {
  listOpenAttributionReviewItems,
  listUnresolvedAttributions,
  listSequenceFunnelDaily,
  listAttributionMethodDaily,
  listRepResponseDaily,
} from '../services/attribution-review-queue.js';
import { buildSequenceQualificationBreakdown } from '../services/sequence-qualification-analytics.js';
import { resolveMetricsRange } from '../services/time-range.js';
import {
  createDashboardSession,
  destroyDashboardSession,
  getDashboardSession,
  getDashboardSessionTtlSeconds,
} from '../services/session-store.js';

/**
 * Parse cookies from a Cookie header string into a map.
 */
function parseCookies(cookieHeader: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx > 0) {
      const name = part.slice(0, idx).trim();
      const value = decodeURIComponent(part.slice(idx + 1).trim());
      result[name] = value;
    }
  }
  return result;
}

/**
 * Build a Set-Cookie header value.
 */
function buildSetCookie(name: string, value: string, options: { maxAge?: number; httpOnly?: boolean; secure?: boolean; sameSite?: string; path?: string }): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.httpOnly !== false) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  if (options.path) parts.push(`Path=${options.path}`);
  return parts.join('; ');
}

/**
 * Read the request body as a string (for JSON parsing).
 */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk: string) => { body += chunk; });
    req.on('end', () => { resolve(body); });
    req.on('error', () => { resolve(''); });
  });
}

/**
 * Parse JSON body with size limit.
 */
async function parseJsonBody(req: IncomingMessage, maxBytes = 1024 * 1024): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    throw new Error('PAYLOAD_TOO_LARGE');
  }
  return JSON.parse(raw);
}

/**
 * Extract session and CSRF info from cookies.
 */
function getSessionFromCookies(req: IncomingMessage): { session: ReturnType<typeof getDashboardSession>; csrfToken: string | null } {
  const cookies = parseCookies(req.headers.cookie);
  const session = getDashboardSession(cookies.ptbizsms_session);
  const csrfToken = cookies.ptbizsms_csrf ?? null;
  return { session, csrfToken };
}

/**
 * Validate CSRF token from header against cookie.
 */
function validateCsrfToken(csrfCookie: string | null, csrfHeader: string | null): boolean {
  if (!csrfCookie || !csrfHeader) return false;
  const a = Buffer.from(csrfCookie, 'utf8');
  const b = Buffer.from(csrfHeader, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Parse query string from URL
 */
function parseQuery(url: string | undefined): Record<string, string> {
  const query: Record<string, string> = {};
  if (!url) return query;
  const queryString = url.split('?')[1];
  if (!queryString) return query;
  for (const pair of queryString.split('&')) {
    const [key, value] = pair.split('=');
    if (key) {
      query[decodeURIComponent(key)] = decodeURIComponent(value || '');
    }
  }
  return query;
}

/**
 * Send JSON response
 */
function sendJson(res: ServerResponse, status: number, data: unknown): void {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

/**
 * Send error response
 */
function sendError(res: ServerResponse, status: number, error: string, details?: string): void {
  sendJson(res, status, {
    success: false,
    error,
    ...(details && { details }),
  });
}

/**
 * Send success response with V2 envelope
 */
function sendSuccess(res: ServerResponse, data: unknown, timeZone = 'America/Chicago'): void {
  sendJson(res, 200, {
    success: true,
    data,
    meta: {
      schemaVersion: '2026.1',
      generatedAt: new Date().toISOString(),
      timeZone,
    },
  });
}

/**
 * Lightweight API router for the legacy node:http server.
 * Returns true when a route is handled, false to allow upstream fallback handling.
 */
export const handleApiRoute = async (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  logger?: Pick<Logger, 'warn' | 'error' | 'info' | 'debug'>,
): Promise<boolean> => {
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, source: 'api-routes', ts: new Date().toISOString() }));
    return true;
  }

  // ─── Auth Endpoints ──────────────────────────────────────────────────────
  if (pathname === '/api/auth/verify' && req.method === 'GET') {
    const { session } = getSessionFromCookies(req);
    if (!session) {
      sendJson(res, 401, { ok: false, error: 'Not authenticated' });
      return true;
    }
    sendJson(res, 200, {
      ok: true,
      authMode: 'session',
      csrfToken: session.csrfToken,
      user: session.user,
    });
    return true;
  }

  if (pathname === '/api/auth/password' && req.method === 'POST') {
    let body: Record<string, unknown>;
    try {
      const maxBytes = Number.parseInt(process.env.API_JSON_BODY_MAX_BYTES || '', 10);
      body = await parseJsonBody(req, Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : 1024 * 1024);
    } catch (e) {
      if ((e as Error).message === 'PAYLOAD_TOO_LARGE') {
        sendJson(res, 413, { error: 'Payload too large' });
        return true;
      }
      sendJson(res, 400, { error: 'Invalid JSON' });
      return true;
    }

    const password = body.password as string | undefined;
    const expectedPassword = (process.env.DASHBOARD_PASSWORD || '').trim();
    if (!expectedPassword || !password || password !== expectedPassword) {
      sendJson(res, 401, { error: 'Invalid credentials' });
      return true;
    }

    const session = createDashboardSession(
      { user_id: 'dashboard-user', user: 'dashboard', email: 'dashboard@ptbiz.com' },
      { ttlSeconds: body.stayLoggedIn === true ? 60 * 60 * 24 * 30 : getDashboardSessionTtlSeconds() },
    );

    const ttlSeconds = getDashboardSessionTtlSeconds();
    const setCookieSession = buildSetCookie('ptbizsms_session', session.id, {
      maxAge: body.stayLoggedIn === true ? 60 * 60 * 24 * 30 : ttlSeconds,
      httpOnly: true,
      secure: (process.env.NODE_ENV || '').toLowerCase() === 'production',
      sameSite: 'lax',
      path: '/',
    });
    const setCookieCsrf = buildSetCookie('ptbizsms_csrf', session.csrfToken, {
      maxAge: body.stayLoggedIn === true ? 60 * 60 * 24 * 30 : ttlSeconds,
      httpOnly: false,
      secure: (process.env.NODE_ENV || '').toLowerCase() === 'production',
      sameSite: 'lax',
      path: '/',
    });

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': [setCookieSession, setCookieCsrf],
    });
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    const { session, csrfToken: csrfCookie } = getSessionFromCookies(req);
    const csrfHeader = req.headers['x-csrf-token'] as string | null;
    if (!validateCsrfToken(csrfCookie, csrfHeader)) {
      sendJson(res, 403, { error: 'CSRF token missing or invalid' });
      return true;
    }
    if (session) {
      destroyDashboardSession(session.id);
    }

    const expireCookie = (name: string): string =>
      `${name}=; Max-Age=0; HttpOnly${(process.env.NODE_ENV || '').toLowerCase() === 'production' ? '; Secure' : ''}; SameSite=lax; Path=/`;

    res.writeHead(200, {
      'Content-Type': 'application/json',
      'Set-Cookie': [
        expireCookie('ptbizsms_session'),
        `${'ptbizsms_csrf'}=; Max-Age=0; Secure=${(process.env.NODE_ENV || '').toLowerCase() === 'production'}; SameSite=lax; Path=/`,
      ],
    });
    res.end(JSON.stringify({ ok: true }));
    return true;
  }

  // Handle V2 routes
  if (pathname.startsWith('/api/v2/')) {
    // All V2 endpoints require an authenticated session
    const { session } = getSessionFromCookies(req);
    if (!session) {
      sendJson(res, 401, { ok: false, error: 'Not authenticated' });
      return true;
    }

    const query = parseQuery(req.url);
    const routePath = pathname.replace('/api/v2', '');

    try {
      // ─── Insights Endpoints ──────────────────────────────────────────────
      if (routePath === '/insights/summary') {
        const range = query.range || '7d';
        const resolved = resolveMetricsRange({ range, tz: query.tz || null });
        const data = await getInsightsSummary(
          { from: resolved.from, to: resolved.to, timeZone: resolved.timeZone },
          logger,
        );
        sendSuccess(res, data, resolved.timeZone);
        return true;
      }

      if (routePath === '/sales-metrics') {
        const range = query.range || '7d';
        const resolved = resolveMetricsRange({ range, tz: query.tz || null });
        const data = await getSalesMetricsSummary(
          { from: resolved.from, to: resolved.to, timeZone: resolved.timeZone },
          logger,
        );
        sendSuccess(res, data, resolved.timeZone);
        return true;
      }

      // ─── Inbox Endpoints ─────────────────────────────────────────────────
      if (routePath === '/inbox/conversations') {
        const data = await listInboxConversations(
          {
            status: query.status as 'open' | 'closed' | 'dnc' | undefined,
            repId: query.repId,
            needsReplyOnly: query.needsReplyOnly === 'true',
            search: query.search,
            limit: Math.min(Number(query.limit) || 50, 100),
            offset: Number(query.offset) || 0,
          },
          logger,
        );
        sendSuccess(res, data);
        return true;
      }

      if (routePath === '/inbox/send-config') {
        const data = listSendLineOptions();
        sendSuccess(res, data);
        return true;
      }

      if (routePath === '/inbox/templates') {
        const data = await listMessageTemplates(logger);
        sendSuccess(res, data);
        return true;
      }

      // ─── Runs Endpoints ──────────────────────────────────────────────────
      if (routePath === '/runs') {
        const data = await getDailyRuns(
          {
            daysBack: Number(query.daysBack) || 7,
            channelId: query.channelId,
            limit: Math.min(Number(query.limit) || 50, 100),
            offset: Number(query.offset) || 0,
          },
          logger,
        );
        sendSuccess(res, data);
        return true;
      }

      if (routePath === '/channels') {
        const data = await getChannelsWithRuns(logger);
        sendSuccess(res, data);
        return true;
      }

      // ─── Sequences Endpoints ─────────────────────────────────────────────
      if (routePath === '/sequences/deep') {
        const range = query.range || '30d';
        const resolved = resolveMetricsRange({ range, tz: query.tz || null });
        const data = await getSequencesDeep(
          { from: resolved.from, to: resolved.to, timeZone: resolved.timeZone },
          logger,
        );
        sendSuccess(res, data, resolved.timeZone);
        return true;
      }

      if (routePath === '/sequences/funnel') {
        const range = query.range || '30d';
        const resolved = resolveMetricsRange({ range, tz: query.tz || null });
        const data = await listSequenceFunnelDaily({
          from: resolved.from,
          to: resolved.to,
        });
        sendSuccess(res, data, resolved.timeZone);
        return true;
      }

      if (routePath === '/sequences/qualification') {
        const range = query.range || '30d';
        const resolved = resolveMetricsRange({ range, tz: query.tz || null });
        const data = await buildSequenceQualificationBreakdown({
          from: resolved.from.toISOString(),
          to: resolved.to.toISOString(),
          timezone: resolved.timeZone,
          logger,
        });
        sendSuccess(res, data, resolved.timeZone);
        return true;
      }

      // ─── Attribution Endpoints ───────────────────────────────────────────
      if (routePath === '/attribution/health') {
        const data = await getAttributionLagStatus();
        sendSuccess(res, data);
        return true;
      }

      if (routePath === '/attribution/methods') {
        const range = query.range || '30d';
        const resolved = resolveMetricsRange({ range, tz: query.tz || null });
        const data = await listAttributionMethodDaily({
          from: resolved.from,
          to: resolved.to,
        });
        sendSuccess(res, data, resolved.timeZone);
        return true;
      }

      if (routePath === '/attribution/review-queue') {
        const data = await listOpenAttributionReviewItems(Math.min(Number(query.limit) || 50, 100));
        sendSuccess(res, data);
        return true;
      }

      if (routePath === '/attribution/unresolved') {
        const data = await listUnresolvedAttributions(Math.min(Number(query.limit) || 50, 100));
        sendSuccess(res, data);
        return true;
      }

      // ─── Reps Endpoints ──────────────────────────────────────────────────
      if (routePath === '/reps/response') {
        const range = query.range || '7d';
        const resolved = resolveMetricsRange({ range, tz: query.tz || null });
        const data = await listRepResponseDaily({
          from: resolved.from,
          to: resolved.to,
        });
        sendSuccess(res, data, resolved.timeZone);
        return true;
      }

      // Unknown V2 route
      logger?.debug?.('Unknown V2 route', { routePath });
      sendError(res, 404, 'Not found', `Route ${routePath} not found`);
      return true;
    } catch (error) {
      logger?.error?.('V2 route error', { routePath, error });
      sendError(
        res,
        500,
        'Internal server error',
        error instanceof Error ? error.message : String(error),
      );
      return true;
    }
  }

  // Route module intentionally keeps unknown API paths unhandled so callers can fallback.
  logger?.debug?.('Unhandled API route path', { pathname });
  return false;
};
