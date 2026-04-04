import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from '@slack/bolt';

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

  // Handle V2 routes
  if (pathname.startsWith('/api/v2/')) {
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
