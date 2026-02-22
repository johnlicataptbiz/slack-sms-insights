export type ApiClientOptions = {
  baseUrl?: string; // default: '' (same origin / Vite proxy)
  token?: string;
  timeoutMs?: number; // default: 30s
};

export class ApiError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

const dashboardClientIdStorageKey = 'ptbizsms_dashboard_client_id_v1';

const getDashboardClientId = (): string | null => {
  if (typeof window === 'undefined') return null;

  try {
    const existing = localStorage.getItem(dashboardClientIdStorageKey);
    if (existing) return existing;

    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `cid-${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`;
    localStorage.setItem(dashboardClientIdStorageKey, generated);
    return generated;
  } catch {
    return null;
  }
};

const getAuthToken = (explicit?: string): string | null => {
  if (explicit) return explicit;
  try {
    const t = localStorage.getItem('slackToken');
    // Back-compat: older code may have stored the token with quotes.
    if (t && (t.startsWith('"') || t.startsWith("'"))) {
      return t.replace(/^['"]|['"]$/g, '');
    }
    if (t) return t;
    return null;
  } catch {
    return null;
  }
};

export const apiFetch = async <T>(
  path: string,
  init: RequestInit & { token?: string } = {},
  options: ApiClientOptions = {},
): Promise<T> => {
  const baseUrl = options.baseUrl ?? '';
  const token = getAuthToken(init.token ?? options.token ?? undefined);
  const timeoutMs = options.timeoutMs ?? 30_000;

  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const dashboardClientId = getDashboardClientId();
  if (dashboardClientId && !headers.has('X-Dashboard-Client-Id')) {
    headers.set('X-Dashboard-Client-Id', dashboardClientId);
  }

  // Timeout + abort support
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // If caller provided a signal, abort our controller when theirs aborts.
  if (init.signal) {
    if (init.signal.aborted) controller.abort();
    else init.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, { ...init, headers, signal: controller.signal });
  } catch (e) {
    if (controller.signal.aborted) {
      throw new ApiError(`Request timed out after ${timeoutMs}ms`, 408, { timeoutMs, path });
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const isHtml = contentType.includes('text/html');

  const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);

  // Dev guardrail: if we asked for JSON from /api/* but got HTML, it almost always means
  // the Vite dev proxy isn't active (e.g. VITE_DISABLE_PROXY set) or is targeting the wrong backend.
  if (import.meta.env.DEV && path.startsWith('/api/') && isHtml) {
    throw new ApiError(
      'Received HTML for an API request. Vite proxy is likely disabled/misconfigured (check VITE_DISABLE_PROXY / VITE_API_TARGET) or the backend is not reachable.',
      res.status,
      body,
    );
  }

  if (!res.ok) {
    const message =
      typeof body === 'object' && body && 'error' in (body as Record<string, unknown>)
        ? String((body as Record<string, unknown>).error)
        : `Request failed (${res.status})`;
    throw new ApiError(message, res.status, body);
  }

  return body as T;
};

export const client = {
  get: <T>(path: string, options?: RequestInit) => apiFetch<T>(path, { method: 'GET', ...options }),
  post: <T>(path: string, body: unknown, options?: RequestInit) =>
    apiFetch<T>(path, { method: 'POST', body: JSON.stringify(body), ...options }),
  put: <T>(path: string, body: unknown, options?: RequestInit) =>
    apiFetch<T>(path, { method: 'PUT', body: JSON.stringify(body), ...options }),
  delete: <T>(path: string, options?: RequestInit) =>
    apiFetch<T>(path, { method: 'DELETE', ...options }),
};
