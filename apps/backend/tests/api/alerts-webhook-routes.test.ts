import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { handleApiRoute } from '../../api/routes.js';

type RouteCallInput = {
  method?: 'GET' | 'POST';
  path: string;
  headers?: Record<string, string>;
  body?: string;
};

type RouteCallResult = {
  handled: boolean;
  statusCode: number;
  body: string;
  json: unknown;
};

const callRoute = async (input: RouteCallInput): Promise<RouteCallResult> => {
  const pathUrl = new URL(input.path, 'http://localhost:3000');
  const req = Readable.from(input.body ? [input.body] : []) as Readable & {
    method?: string;
    url?: string;
    headers: Record<string, string>;
    socket: { remoteAddress: string };
  };
  req.method = input.method || 'GET';
  req.url = pathUrl.pathname + pathUrl.search;
  req.headers = {
    host: 'localhost:3000',
    ...(input.headers || {}),
  };
  req.socket = { remoteAddress: '127.0.0.1' };

  const responseState: {
    statusCode: number;
    body: string;
  } = {
    statusCode: 0,
    body: '',
  };

  const res = {
    writeHead: (statusCode: number) => {
      responseState.statusCode = statusCode;
      return res;
    },
    end: (chunk?: unknown) => {
      if (typeof chunk === 'string') {
        responseState.body += chunk;
      } else if (Buffer.isBuffer(chunk)) {
        responseState.body += chunk.toString('utf8');
      }
    },
  };

  const handled = await handleApiRoute(
    req as never,
    res as never,
    pathUrl.pathname,
  );
  let json: unknown = null;
  if (responseState.body) {
    try {
      json = JSON.parse(responseState.body);
    } catch {
      json = responseState.body;
    }
  }

  return {
    handled,
    statusCode: responseState.statusCode,
    body: responseState.body,
    json,
  };
};

test('GET /api/alerts/status returns a success payload', async () => {
  const response = await callRoute({
    method: 'GET',
    path: '/api/alerts/status',
  });

  assert.equal(response.handled, true);
  assert.equal(response.statusCode, 200);
  const payload = response.json as { success: boolean; data?: unknown };
  assert.equal(payload.success, true);
  assert.ok(payload.data);
});

test('POST /api/alerts/webhook accepts a valid checkType', async () => {
  const response = await callRoute({
    method: 'POST',
    path: '/api/alerts/webhook',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      checkType: 'inbox',
      alertTriggered: true,
      metricValue: 7,
      alertMessage: 'Backlog increasing',
      severity: 'warning',
      timestamp: '2026-04-06T00:00:00.000Z',
    }),
  });

  assert.equal(response.handled, true);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json, {
    success: true,
    message: 'Alert webhook processed: inbox',
    severity: 'warning',
  });
});

test('POST /api/alerts/webhook rejects missing checkType', async () => {
  const response = await callRoute({
    method: 'POST',
    path: '/api/alerts/webhook',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      metricValue: 7,
      alertMessage: 'Backlog increasing',
      severity: 'warning',
      timestamp: '2026-04-06T00:00:00.000Z',
    }),
  });

  assert.equal(response.handled, true);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json, {
    success: false,
    error: 'Unknown checkType: ',
  });
});

test('POST /api/alerts/webhook rejects unknown checkType', async () => {
  const response = await callRoute({
    method: 'POST',
    path: '/api/alerts/webhook',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      checkType: 'bogus',
      metricValue: 7,
      alertMessage: 'Backlog increasing',
      severity: 'warning',
      timestamp: '2026-04-06T00:00:00.000Z',
    }),
  });

  assert.equal(response.handled, true);
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.json, {
    success: false,
    error: 'Unknown checkType: bogus',
  });
});

test('POST /api/alerts/inbox accepts shorthand inbox payload', async () => {
  const response = await callRoute({
    method: 'POST',
    path: '/api/alerts/inbox',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      critical: 1,
      stale: 2,
      unassigned: 0,
      needsReply: 5,
    }),
  });

  assert.equal(response.handled, true);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json, {
    success: true,
    message: 'Alert webhook processed: inbox',
    severity: 'critical',
  });
});
