import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { handleApiRoute } from '../../api/routes.js';
import { createDashboardSession, destroyDashboardSession } from '../../services/session-store.js';

type RouteCallInput = {
  method?: 'GET' | 'POST';
  path: string;
  headers?: Record<string, string>;
  body?: string;
};

type RouteCallResult = {
  handled: boolean;
  statusCode: number;
  headers: Record<string, string | string[]>;
  body: string;
  json: unknown;
};

const toCookieHeader = (sessionId: string, csrfToken?: string): string => {
  const parts = [`ptbizsms_session=${encodeURIComponent(sessionId)}`];
  if (csrfToken) {
    parts.push(`ptbizsms_csrf=${encodeURIComponent(csrfToken)}`);
  }
  return parts.join('; ');
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
    headers: Record<string, string | string[]>;
    body: string;
  } = {
    statusCode: 0,
    headers: {},
    body: '',
  };

  const res = {
    writeHead: (statusCode: number, headers: Record<string, string | string[]>) => {
      responseState.statusCode = statusCode;
      responseState.headers = headers || {};
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

  const handled = await handleApiRoute(req as never, res as never, pathUrl.pathname);
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
    headers: responseState.headers,
    body: responseState.body,
    json,
  };
};

test('sensitive v2 routes require authentication by default', async () => {
  const response = await callRoute({
    method: 'GET',
    path: '/api/v2/runs?limit=1',
  });

  assert.equal(response.handled, true);
  assert.equal(response.statusCode, 401);
});

test('auth verify returns session user and csrf token', async () => {
  const session = createDashboardSession({
    user_id: 'U_ROUTE_VERIFY',
    user: 'U_ROUTE_VERIFY',
    team_id: 'T_ROUTE_VERIFY',
  });

  try {
    const response = await callRoute({
      method: 'GET',
      path: '/api/auth/verify',
      headers: {
        cookie: toCookieHeader(session.id, session.csrfToken),
      },
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json as {
      ok: boolean;
      authMode: string;
      csrfToken: string;
      user: { user_id?: string; user?: string; team_id?: string };
    };
    assert.equal(payload.ok, true);
    assert.equal(payload.authMode, 'session');
    assert.equal(payload.csrfToken, session.csrfToken);
    assert.equal(payload.user.user_id, session.user.user_id);
    assert.equal(payload.user.user, session.user.user);
    assert.equal(payload.user.team_id, session.user.team_id);
  } finally {
    destroyDashboardSession(session.id);
  }
});

test('session mutation without csrf token is rejected', async () => {
  const session = createDashboardSession({
    user_id: 'U_ROUTE_NO_CSRF',
    user: 'U_ROUTE_NO_CSRF',
    team_id: 'T_ROUTE_NO_CSRF',
  });

  try {
    const response = await callRoute({
      method: 'POST',
      path: '/api/auth/logout',
      headers: {
        cookie: toCookieHeader(session.id, session.csrfToken),
      },
    });

    assert.equal(response.statusCode, 403);
    assert.deepEqual(response.json, { error: 'CSRF token missing or invalid' });
  } finally {
    destroyDashboardSession(session.id);
  }
});

test('session mutation with csrf token succeeds and clears cookies', async () => {
  const session = createDashboardSession({
    user_id: 'U_ROUTE_LOGOUT',
    user: 'U_ROUTE_LOGOUT',
    team_id: 'T_ROUTE_LOGOUT',
  });

  const response = await callRoute({
    method: 'POST',
    path: '/api/auth/logout',
    headers: {
      cookie: toCookieHeader(session.id, session.csrfToken),
      'x-csrf-token': session.csrfToken,
    },
  });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json, { ok: true });

  const setCookie = response.headers['Set-Cookie'];
  assert.ok(Array.isArray(setCookie));
  assert.ok(setCookie.some((value) => value.startsWith('ptbizsms_session=')));
  assert.ok(setCookie.some((value) => value.startsWith('ptbizsms_csrf=')));
});

test('oversized JSON payloads return 413', async () => {
  const previousMax = process.env.API_JSON_BODY_MAX_BYTES;
  process.env.API_JSON_BODY_MAX_BYTES = '32';

  const session = createDashboardSession({
    user_id: 'U_ROUTE_BODY_LIMIT',
    user: 'U_ROUTE_BODY_LIMIT',
    team_id: 'T_ROUTE_BODY_LIMIT',
  });

  try {
    const body = JSON.stringify({ repId: 'x'.repeat(256) });
    const response = await callRoute({
      method: 'POST',
      path: '/api/work-items/w1/assign',
      headers: {
        cookie: toCookieHeader(session.id, session.csrfToken),
        'x-csrf-token': session.csrfToken,
        'content-type': 'application/json',
      },
      body,
    });

    assert.equal(response.statusCode, 413);
    assert.deepEqual(response.json, { error: 'Payload too large' });
  } finally {
    if (previousMax == null) {
      delete process.env.API_JSON_BODY_MAX_BYTES;
    } else {
      process.env.API_JSON_BODY_MAX_BYTES = previousMax;
    }
    destroyDashboardSession(session.id);
  }
});

test('authenticated mutation routes enforce rate limiting', async () => {
  const previousMax = process.env.API_MUTATION_RATE_LIMIT_MAX;
  const previousWindow = process.env.API_MUTATION_RATE_LIMIT_WINDOW_MS;
  process.env.API_MUTATION_RATE_LIMIT_MAX = '2';
  process.env.API_MUTATION_RATE_LIMIT_WINDOW_MS = '60000';

  const session = createDashboardSession({
    user_id: `U_ROUTE_RATE_LIMIT_${Date.now()}`,
    user: `U_ROUTE_RATE_LIMIT_${Date.now()}`,
    team_id: 'T_ROUTE_RATE_LIMIT',
  });

  try {
    const headers = {
      cookie: toCookieHeader(session.id, session.csrfToken),
      'x-csrf-token': session.csrfToken,
    };

    const first = await callRoute({ method: 'POST', path: '/api/work-items/item-1/resolve', headers });
    const second = await callRoute({ method: 'POST', path: '/api/work-items/item-1/resolve', headers });
    const third = await callRoute({ method: 'POST', path: '/api/work-items/item-1/resolve', headers });

    assert.notEqual(first.statusCode, 429);
    assert.notEqual(second.statusCode, 429);
    assert.equal(third.statusCode, 429);
    assert.deepEqual(third.json, {
      error: 'Rate limit exceeded',
      retryAfterSeconds: 60,
    });
  } finally {
    if (previousMax == null) {
      delete process.env.API_MUTATION_RATE_LIMIT_MAX;
    } else {
      process.env.API_MUTATION_RATE_LIMIT_MAX = previousMax;
    }
    if (previousWindow == null) {
      delete process.env.API_MUTATION_RATE_LIMIT_WINDOW_MS;
    } else {
      process.env.API_MUTATION_RATE_LIMIT_WINDOW_MS = previousWindow;
    }
    destroyDashboardSession(session.id);
  }
});
