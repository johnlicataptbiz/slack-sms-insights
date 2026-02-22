import { randomBytes } from 'node:crypto';

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

const sessions = new Map<string, DashboardSession>();

const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 12;

const resolveSessionTtlSeconds = (): number => {
  const configured = Number.parseInt(process.env.DASHBOARD_SESSION_TTL_SECONDS || '', 10);
  if (Number.isFinite(configured) && configured > 0) {
    return configured;
  }
  return DEFAULT_SESSION_TTL_SECONDS;
};

const nowMs = (): number => Date.now();

const isExpired = (session: DashboardSession, now = nowMs()): boolean => session.expiresAt <= now;

const pruneExpiredSessions = (): void => {
  const now = nowMs();
  for (const [id, session] of sessions) {
    if (isExpired(session, now)) {
      sessions.delete(id);
    }
  }
};

export const createDashboardSession = (
  user: DashboardSessionUser,
  options?: {
    ttlSeconds?: number;
  },
): DashboardSession => {
  pruneExpiredSessions();

  const id = randomBytes(24).toString('hex');
  const csrfToken = randomBytes(24).toString('hex');
  const createdAt = nowMs();
  const ttlSeconds =
    options?.ttlSeconds && Number.isFinite(options.ttlSeconds) && options.ttlSeconds > 0
      ? Math.floor(options.ttlSeconds)
      : resolveSessionTtlSeconds();
  const ttlMs = ttlSeconds * 1000;
  const session: DashboardSession = {
    id,
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

  sessions.set(id, session);
  return session;
};

export const getDashboardSession = (id: string | null | undefined): DashboardSession | null => {
  if (!id) return null;
  const session = sessions.get(id);
  if (!session) return null;
  if (isExpired(session)) {
    sessions.delete(id);
    return null;
  }
  return session;
};

export const destroyDashboardSession = (id: string | null | undefined): void => {
  if (!id) return;
  sessions.delete(id);
};

export const getDashboardSessionTtlSeconds = (): number => resolveSessionTtlSeconds();
