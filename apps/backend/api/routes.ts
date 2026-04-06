import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from '@slack/bolt';
import {
  getAlowarePollingState,
  pollAlowareSmsEvents,
} from '../services/aloware-sms-poller.js';
import {
  type AlowareWebhookPayload,
  handleAlowareWebhook,
  validateWebhookSignature,
} from '../services/aloware-webhook-handler.js';
import { getAttributionLagStatus } from '../services/attribution-health.js';
import {
  listAttributionMethodDaily,
  listOpenAttributionReviewItems,
  listRepResponseDaily,
  listSequenceFunnelDaily,
  listUnresolvedAttributions,
} from '../services/attribution-review-queue.js';
import {
  getChannelsWithRuns,
  getDailyRuns,
} from '../services/daily-run-logger.js';
import {
  listInboxConversations,
  listMessageTemplates,
} from '../services/inbox-store.js';
// Import V2 service functions
import { getInsightsSummary } from '../services/insights-summary.js';
import { getSalesMetricsSummary } from '../services/sales-metrics.js';
import { listSendLineOptions } from '../services/send-line-catalog.js';
import { buildSequenceQualificationBreakdown } from '../services/sequence-qualification-analytics.js';
import { getSequencesDeep } from '../services/sequences-deep.js';
import {
  createDashboardSession,
  destroyDashboardSession,
  getDashboardSession,
  getDashboardSessionTtlSeconds,
} from '../services/session-store.js';
import { resolveMetricsRange } from '../services/time-range.js';

type AlertCheckType =
  | 'workload'
  | 'sla'
  | 'conversion'
  | 'health'
  | 'inbox'
  | 'attribution';

type AlertSeverity = 'critical' | 'warning' | 'info';

type AlertWebhookPayload = {
  checkType: AlertCheckType;
  alertTriggered: boolean;
  metricValue: number;
  alertMessage: string;
  severity: AlertSeverity;
  timestamp: string;
  channelId?: string;
  workflowId?: string;
};

const isAlertCheckType = (value: unknown): value is AlertCheckType => {
  if (typeof value !== 'string') return false;
  return (
    value === 'workload' ||
    value === 'sla' ||
    value === 'conversion' ||
    value === 'health' ||
    value === 'inbox' ||
    value === 'attribution'
  );
};

const asNumber = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
};

const formatInboxAlertMessage = (counts: {
  critical: number;
  stale: number;
  unassigned: number;
  needsReply: number;
}): string => {
  return (
    `Inbox backlog: critical=${counts.critical}, stale=${counts.stale}, ` +
    `unassigned=${counts.unassigned}, needsReply=${counts.needsReply}`
  );
};

const triggerProactiveAlertsWorkflow = async (
  payload: AlertWebhookPayload,
): Promise<void> => {
  console.log('[alerts] Triggering Proactive Alerts workflow:', {
    checkType: payload.checkType,
    severity: payload.severity,
    triggered: payload.alertTriggered,
  });
};

const triggerInboxWatchWorkflow = async (
  payload: AlertWebhookPayload,
): Promise<void> => {
  console.log('[alerts] Triggering Inbox Watch workflow:', {
    severity: payload.severity,
    message: payload.alertMessage,
  });
};

const triggerAttributionHealthWorkflow = async (
  payload: AlertWebhookPayload,
): Promise<void> => {
  console.log('[alerts] Triggering Attribution Health workflow:', {
    severity: payload.severity,
    lagHours: payload.metricValue,
  });
};

/**
 * Parse cookies from a Cookie header string into a map.
 */
function parseCookies(
  cookieHeader: string | undefined,
): Record<string, string> {
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
function buildSetCookie(
  name: string,
  value: string,
  options: {
    maxAge?: number;
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: string;
    path?: string;
  },
): string {
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
    req.on('data', (chunk: string) => {
      body += chunk;
    });
    req.on('end', () => {
      resolve(body);
    });
    req.on('error', () => {
      resolve('');
    });
  });
}

/**
 * Parse JSON body with size limit.
 */
async function parseJsonBody(
  req: IncomingMessage,
  maxBytes = 1024 * 1024,
): Promise<Record<string, unknown>> {
  const raw = await readBody(req);
  if (Buffer.byteLength(raw, 'utf8') > maxBytes) {
    throw new Error('PAYLOAD_TOO_LARGE');
  }
  return JSON.parse(raw);
}

/**
 * Extract session and CSRF info from cookies.
 */
function getSessionFromCookies(req: IncomingMessage): {
  session: ReturnType<typeof getDashboardSession>;
  csrfToken: string | null;
} {
  const cookies = parseCookies(req.headers.cookie);
  const session = getDashboardSession(cookies.ptbizsms_session);
  const csrfToken = cookies.ptbizsms_csrf ?? null;
  return { session, csrfToken };
}

/**
 * Validate CSRF token from header against cookie.
 */
function validateCsrfToken(
  csrfCookie: string | null,
  csrfHeader: string | null,
): boolean {
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
function sendError(
  res: ServerResponse,
  status: number,
  error: string,
  details?: string,
): void {
  sendJson(res, status, {
    success: false,
    error,
    ...(details && { details }),
  });
}

/**
 * Send success response with V2 envelope
 */
function sendSuccess(
  res: ServerResponse,
  data: unknown,
  timeZone = 'America/Chicago',
): void {
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
    res.end(
      JSON.stringify({
        ok: true,
        source: 'api-routes',
        ts: new Date().toISOString(),
      }),
    );
    return true;
  }

  // ─── Alerts Webhook Endpoints ───────────────────────────────────────────
  if (pathname === '/api/alerts/status' && req.method === 'GET') {
    sendJson(res, 200, {
      success: true,
      data: {
        timestamp: new Date().toISOString(),
        alerts: {
          inbox: {
            lastAlertAt: null,
            isHealthy: true,
            openCount: 0,
          },
          attribution: {
            lastAlertAt: null,
            isHealthy: true,
            lagHours: 0,
          },
        },
      },
    });
    return true;
  }

  if (
    (pathname === '/api/alerts/webhook' ||
      pathname === '/api/alerts/inbox' ||
      pathname === '/api/alerts/attribution') &&
    req.method === 'POST'
  ) {
    let body: Record<string, unknown>;
    try {
      body = await parseJsonBody(req);
    } catch (error) {
      if ((error as Error).message === 'PAYLOAD_TOO_LARGE') {
        sendJson(res, 413, { success: false, error: 'Payload too large' });
        return true;
      }
      sendJson(res, 400, { success: false, error: 'Invalid JSON' });
      return true;
    }

    try {
      let payload: AlertWebhookPayload;

      if (pathname === '/api/alerts/inbox') {
        const critical = asNumber(body.critical);
        const stale = asNumber(body.stale);
        const unassigned = asNumber(body.unassigned);
        const needsReply = asNumber(body.needsReply);
        payload = {
          checkType: 'inbox',
          alertTriggered: critical > 0 || stale > 0 || unassigned > 0,
          metricValue: needsReply,
          alertMessage: formatInboxAlertMessage({
            critical,
            stale,
            unassigned,
            needsReply,
          }),
          severity: critical > 0 ? 'critical' : stale > 0 ? 'warning' : 'info',
          timestamp: new Date().toISOString(),
          channelId:
            (process.env.INBOX_ALERT_CHANNEL_ID || '').trim() || undefined,
        };
      } else if (pathname === '/api/alerts/attribution') {
        const lagHours = asNumber(body.lagHours);
        payload = {
          checkType: 'attribution',
          alertTriggered: lagHours > 24,
          metricValue: lagHours,
          alertMessage: `Attribution lag: ${lagHours}h (booked_calls: ${String(body.maxBookedCallsTs ?? 'n/a')}, attribution: ${String(body.maxAttributionTs ?? 'n/a')})`,
          severity: lagHours > 24 ? 'warning' : 'info',
          timestamp: new Date().toISOString(),
          channelId:
            (process.env.ATTRIBUTION_ALERT_CHANNEL_ID || '').trim() ||
            undefined,
        };
      } else {
        if (!isAlertCheckType(body.checkType)) {
          sendJson(res, 400, {
            success: false,
            error: `Unknown checkType: ${String(body.checkType ?? '')}`,
          });
          return true;
        }
        payload = {
          checkType: body.checkType,
          alertTriggered: Boolean(body.alertTriggered),
          metricValue: asNumber(body.metricValue),
          alertMessage: String(body.alertMessage ?? ''),
          severity:
            body.severity === 'critical' ||
            body.severity === 'warning' ||
            body.severity === 'info'
              ? body.severity
              : 'info',
          timestamp:
            typeof body.timestamp === 'string'
              ? body.timestamp
              : new Date().toISOString(),
          channelId:
            typeof body.channelId === 'string' ? body.channelId : undefined,
          workflowId:
            typeof body.workflowId === 'string' ? body.workflowId : undefined,
        };
      }

      if (payload.checkType === 'inbox') {
        await triggerInboxWatchWorkflow(payload);
      } else if (payload.checkType === 'attribution') {
        await triggerAttributionHealthWorkflow(payload);
      } else {
        await triggerProactiveAlertsWorkflow(payload);
      }

      sendJson(res, 200, {
        success: true,
        message: `Alert webhook processed: ${payload.checkType}`,
        severity: payload.severity,
      });
      return true;
    } catch (error) {
      sendError(
        res,
        500,
        'Failed to process alert webhook',
        error instanceof Error ? error.message : String(error),
      );
      return true;
    }
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
      const maxBytes = Number.parseInt(
        process.env.API_JSON_BODY_MAX_BYTES || '',
        10,
      );
      body = await parseJsonBody(
        req,
        Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : 1024 * 1024,
      );
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
      {
        user_id: 'dashboard-user',
        user: 'dashboard',
        email: 'dashboard@ptbiz.com',
      },
      {
        ttlSeconds:
          body.stayLoggedIn === true
            ? 60 * 60 * 24 * 30
            : getDashboardSessionTtlSeconds(),
      },
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
        const data = await listOpenAttributionReviewItems(
          Math.min(Number(query.limit) || 50, 100),
        );
        sendSuccess(res, data);
        return true;
      }

      if (routePath === '/attribution/unresolved') {
        const data = await listUnresolvedAttributions(
          Math.min(Number(query.limit) || 50, 100),
        );
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

  // ─── Aloware Webhook Endpoint ──────────────────────────────────────────────
  // Supports both /api/webhooks/aloware and /api/webhooks/aloware/sms (Aloware dashboard URL)
  if (pathname.startsWith('/api/webhooks/aloware') && req.method === 'POST') {
    const signature = req.headers['x-aloware-signature'] as string | undefined;
    let bodyStr: string;
    try {
      bodyStr = await readBody(req);
    } catch {
      sendError(res, 400, 'Invalid request body');
      return true;
    }

    if (!validateWebhookSignature(bodyStr, signature)) {
      sendJson(res, 403, { success: false, error: 'Invalid signature' });
      return true;
    }

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(bodyStr);
    } catch {
      sendJson(res, 400, { success: false, error: 'Invalid JSON' });
      return true;
    }

    const result = await handleAlowareWebhook(
      payload as AlowareWebhookPayload,
      logger,
    );

    if (result.status === 'success') {
      sendJson(res, 200, { success: true, data: result });
    } else if (result.status === 'skipped') {
      sendJson(res, 202, { success: true, data: result });
    } else {
      sendJson(res, 500, { success: false, error: result.reason });
    }
    return true;
  }

  // ─── Aloware Polling Admin Endpoint ────────────────────────────────────────
  if (pathname === '/api/admin/aloware/poll' && req.method === 'POST') {
    const { session } = getSessionFromCookies(req);
    if (!session) {
      sendJson(res, 401, { success: false, error: 'Not authenticated' });
      return true;
    }

    const result = await pollAlowareSmsEvents(logger);
    sendJson(res, 200, { success: true, data: result });
    return true;
  }

  if (pathname === '/api/admin/aloware/status' && req.method === 'GET') {
    const { session } = getSessionFromCookies(req);
    if (!session) {
      sendJson(res, 401, { success: false, error: 'Not authenticated' });
      return true;
    }

    const status = getAlowarePollingState();
    sendJson(res, 200, { success: true, data: status });
    return true;
  }

  // Route module intentionally keeps unknown API paths unhandled so callers can fallback.
  logger?.debug?.('Unhandled API route path', { pathname });
  return false;
};
