import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from '@slack/bolt';

/**
 * Lightweight API router for the legacy node:http server.
 * Returns true when a route is handled, false to allow upstream fallback handling.
 */
export const handleApiRoute = async (
  _req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  logger?: Pick<Logger, 'warn' | 'error' | 'info' | 'debug'>,
): Promise<boolean> => {
  if (pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, source: 'api-routes', ts: new Date().toISOString() }));
    return true;
  }

  // Route module intentionally keeps unknown API paths unhandled so callers can fallback.
  logger?.debug?.('Unhandled API route path', { pathname });
  return false;
};

