export type ApiClientOptions = {
  baseUrl?: string; // default: '' (same origin / Vite proxy)
  token?: string;
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

const getAuthToken = (explicit?: string): string | null => {
  if (explicit) return explicit;
  try {
    const t = localStorage.getItem('slackToken');
    // Back-compat: older code may have stored the token with quotes.
    if (t && (t.startsWith('"') || t.startsWith("'"))) {
      return t.replace(/^['"]|['"]$/g, '');
    }
    if (t) return t;

    // Local dev convenience: allow hitting the local API without a real Slack token.
    // The backend explicitly accepts this token as an auth bypass.
    if (import.meta.env.DEV) return 'dummy-token-bypass-auth';

    return null;
  } catch {
    // If localStorage is unavailable (e.g. privacy mode), still allow local dev.
    if (import.meta.env.DEV) return 'dummy-token-bypass-auth';
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

  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  if (token) headers.set('Authorization', `Bearer ${token}`);

  const res = await fetch(`${baseUrl}${path}`, { ...init, headers });

  const contentType = res.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const body = isJson ? await res.json().catch(() => null) : await res.text().catch(() => null);

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
