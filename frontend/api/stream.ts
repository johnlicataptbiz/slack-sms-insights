import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * SSE proxy for /api/stream
 *
 * Why:
 * - Vercel "rewrites" can behave oddly for SSE (HEAD/content-type/cache), causing EventSource to fail.
 * - This function proxies the Railway SSE endpoint and forces correct SSE + no-cache headers.
 *
 * Notes:
 * - We keep auth compatible with the existing backend: token is passed via query param.
 * - We also forward the Origin header so the backend can echo it for CORS.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method && req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const token = typeof req.query.token === 'string' ? req.query.token : '';
  const upstreamBase = (process.env.RAILWAY_API_BASE_URL || '').trim();
  if (!upstreamBase) {
    res.status(500).json({
      error: 'RAILWAY_API_BASE_URL is required for stream proxy',
      code: 'missing_railway_api_base_url',
    });
    return;
  }
  const upstreamUrl = `${upstreamBase}/api/stream?token=${encodeURIComponent(token)}`;

  // SSE headers
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Connection', 'keep-alive');
  // Helps some proxies (including Vercel/NGINX) not buffer SSE
  res.setHeader('X-Accel-Buffering', 'no');

  // CORS: allow the requesting origin (same-origin in our case, but safe)
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  // Flush headers early
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (res as any).flushHeaders?.();

  const controller = new AbortController();
  req.on('close', () => controller.abort());

  try {
    const upstreamRes = await fetch(upstreamUrl, {
      method: 'GET',
      headers: {
        Accept: 'text/event-stream',
        // Forward origin so backend can echo it for CORS (and for debugging)
        ...(origin ? { Origin: origin } : {}),
      },
      signal: controller.signal,
    });

    if (!upstreamRes.ok || !upstreamRes.body) {
      res.write(`event: error\n`);
      res.write(`data: ${JSON.stringify({ error: 'Upstream stream failed', status: upstreamRes.status })}\n\n`);
      res.end();
      return;
    }

    // Pipe upstream bytes to client
    const reader = upstreamRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) res.write(Buffer.from(value));
    }
    res.end();
  } catch (err) {
    // If client disconnected, ignore
    if (controller.signal.aborted) return;

    res.write(`event: error\n`);
    res.write(`data: ${JSON.stringify({ error: 'Stream proxy error' })}\n\n`);
    res.end();
  }
}
