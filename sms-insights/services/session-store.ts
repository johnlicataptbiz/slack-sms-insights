import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

export type DashboardSessionUser = {
  user_id?: string;
  user?: string;
  team_id?: string;
  email?: string;
};

export type DashboardSession = {
  id: string;
  csrfToken: string;
  user: DashboardSessionUser;
  createdAt: number;
  expiresAt: number;
};

type SessionPayload = {
  sid: string;
  csrfToken: string;
  user: DashboardSessionUser;
  createdAt: number;
  expiresAt: number;
};

const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 12;
const revokedSessionIds = new Set<string>();

const resolveSessionTtlSeconds = (): number => {
  const configured = Number.parseInt(process.env.DASHBOARD_SESSION_TTL_SECONDS || '', 10);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return DEFAULT_SESSION_TTL_SECONDS;
};

const nowMs = (): number => Date.now();

const getSessionSecret = (): string => {
  const configured = (process.env.DASHBOARD_SESSION_SECRET || '').trim();
  if (configured.length > 0) return configured;
  // Backwards-compatible fallback so existing envs keep working.
  return 'dev-dashboard-session-secret-change-me';
};

const toBase64Url = (input: Buffer | string): string => {
  const raw = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return raw.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const fromBase64Url = (input: string): Buffer => {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${padding}`, 'base64');
};

const sign = (payloadSegment: string): string => {
  const digest = createHmac('sha256', getSessionSecret()).update(payloadSegment).digest();
  return toBase64Url(digest);
};

const decodeSessionPayload = (id: string): SessionPayload | null => {
  const trimmed = (id || '').trim();
  if (!trimmed) return null;
  const [payloadSegment, signatureSegment] = trimmed.split('.');
  if (!payloadSegment || !signatureSegment) return null;

  const expected = sign(payloadSegment);
  const actualBuf = Buffer.from(signatureSegment, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (actualBuf.length !== expectedBuf.length) return null;
  if (!timingSafeEqual(actualBuf, expectedBuf)) return null;

  try {
    const payload = JSON.parse(fromBase64Url(payloadSegment).toString('utf8')) as SessionPayload;
    if (!payload || typeof payload !== 'object') return null;
    return payload;
  } catch {
    return null;
  }
};

const encodeSessionPayload = (payload: SessionPayload): string => {
  const payloadSegment = toBase64Url(JSON.stringify(payload));
  return `${payloadSegment}.${sign(payloadSegment)}`;
};

const isExpired = (session: DashboardSession, now = nowMs()): boolean => session.expiresAt <= now;

export const createDashboardSession = (
  user: DashboardSessionUser,
  options?: {
    ttlSeconds?: number;
  },
): DashboardSession => {
  const createdAt = nowMs();
  const ttlSeconds =
    options?.ttlSeconds && Number.isFinite(options.ttlSeconds) && options.ttlSeconds > 0
      ? Math.floor(options.ttlSeconds)
      : resolveSessionTtlSeconds();
  const ttlMs = ttlSeconds * 1000;
  const sid = randomBytes(18).toString('hex');
  const csrfToken = randomBytes(24).toString('hex');

  const payload: SessionPayload = {
    sid,
    csrfToken,
    user: {
      user_id: user.user_id,
      user: user.user,
      team_id: user.team_id,
      email: user.email,
    },
    createdAt,
    expiresAt: createdAt + ttlMs,
  };

  const id = encodeSessionPayload(payload);
  return {
    id,
    csrfToken: payload.csrfToken,
    user: payload.user,
    createdAt: payload.createdAt,
    expiresAt: payload.expiresAt,
  };
};

export const getDashboardSession = (id: string | null | undefined): DashboardSession | null => {
  const payload = decodeSessionPayload(id || '');
  if (!payload) return null;
  if (revokedSessionIds.has(payload.sid)) return null;

  const session: DashboardSession = {
    id: id as string,
    csrfToken: payload.csrfToken,
    user: payload.user,
    createdAt: payload.createdAt,
    expiresAt: payload.expiresAt,
  };

  if (isExpired(session)) {
    revokedSessionIds.add(payload.sid);
    return null;
  }
  return session;
};

export const destroyDashboardSession = (id: string | null | undefined): void => {
  const payload = decodeSessionPayload(id || '');
  if (!payload) return;
  revokedSessionIds.add(payload.sid);
};

export const getDashboardSessionTtlSeconds = (): number => resolveSessionTtlSeconds();
