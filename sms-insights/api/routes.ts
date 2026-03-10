import { randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Logger } from '@slack/bolt';
import { WebClient } from '@slack/web-api';
import {
  getDraftAIPerformanceAnalytics,
  getFollowUpSLAAnalytics,
  getLinePerformanceAnalytics,
  getQualificationFunnelAnalytics,
} from '../services/advanced-analytics.js';
import {
  disenrollConversationContactFromSequence,
  enrollConversationContactToSequence,
  syncQualificationToAloware,
} from '../services/aloware-contact-sync.js';
import { getAlowareIngestHealthSnapshot } from '../services/aloware-ingest-monitor.js';
import {
  getBookedCallAttributionSources,
  getBookedCallSequenceFromSmsEvents,
  getBookedCallSmsReplyLinks,
  getBookedCallsSummary,
} from '../services/booked-calls.js';
import {
  autoAssignWorkItems,
  bulkInferQualification,
  deduplicateLines,
  getAuditLogs,
  getGoals,
  getLineActivityBalance,
  getResponseTimeStats,
  getTimeToBookingStats,
  getTrendAlerts,
} from '../services/comprehensive-fixes.js';
import { getConversationById, listSmsEventsForConversation } from '../services/conversation-store.js';
import { getCronStatusSnapshot } from '../services/cron-scheduler.js';
import { detectRunOutliers, parseRunMetrics } from '../services/daily-report-summary.js';
import { getChannelsWithRuns, getDailyRunById, getDailyRuns, logDailyRun } from '../services/daily-run-logger.js';
import { getPrisma } from '../services/prisma.js';
import { enrichContactProfileFromAloware } from '../services/inbox-contact-enrichment.js';
import { getInboxContactProfileByKey, upsertInboxContactProfile } from '../services/inbox-contact-profiles.js';
import { generateCrmNotesSuggestion } from '../services/inbox-crm-notes-engine.js';
import { generateDraftSuggestion } from '../services/inbox-draft-engine.js';
import { sendInboxMessage } from '../services/inbox-send.js';
import {
  assignConversation,
  deleteMessageTemplate,
  ensureConversationState,
  getDraftSuggestionById,
  getInboxConversationById,
  getObjectionFrequencyAnalytics,
  getSendAttemptVolumeCounts,
  getSetterAssistPerformanceAnalytics,
  getStageConversionAnalytics,
  incrementGuardrailOverride,
  insertConversationNote,
  insertDraftSuggestion,
  insertMessageTemplate,
  insertSendAttempt,
  listConversationNotes,
  listDraftSuggestionsForConversation,
  listInboxConversations,
  listMessagesForConversation,
  listMessageTemplates,
  listMondayTrailForContactKey,
  snoozeConversation,
  updateCallOutcome,
  updateConversationState,
  updateConversationStatus,
  updateDraftSuggestionFeedback,
  updateObjectionTags,
  upsertConversionExample,
  VALID_CALL_OUTCOMES,
  type InboxMessageRow,
} from '../services/inbox-store.js';
import { buildMessageLinkPreviews } from '../services/link-previews.js';
import {
  getMetricsOverview,
  getSlaMetrics,
  getVolumeByDayMetrics,
  getWorkloadByRepMetrics,
} from '../services/metrics.js';
import {
  getMondayScorecards,
  listMondayBoardCatalog,
  parseBoardIdsQuery,
  parseScope,
} from '../services/monday-governed-analytics.js';
import { getMondayLeadInsights } from '../services/monday-lead-insights.js';
import { getPrismaRuntimeStatus } from '../services/prisma.js';
import { syncQualificationFromConversationText } from '../services/qualification-sync.js';
import { subscribeRealtimeEvents } from '../services/realtime.js';
import { getSlackAuthRuntimeStatus } from '../services/runtime-status.js';
import { getSalesMetricsSummary } from '../services/sales-metrics.js';
import { buildCanonicalSalesMetricsSlice } from '../services/sales-metrics-contract.js';
import { getScoreboardData } from '../services/scoreboard.js';
import { getSequenceKpis } from '../services/sequence-kpis.js';
import { refreshKpiFacts } from '../services/kpi-facts.js';
import { getAttributionLagStatus } from '../services/attribution-health.js';
import { getInsightsSummary } from '../services/insights-summary.js';
import { getSequencesDeep } from '../services/sequences-deep.js';
import { applyRateLimitHeaders, applySecurityHeaders, checkRateLimit } from '../services/security-headers.js';
import { findSendLineOption, listSendLineOptions } from '../services/send-line-catalog.js';
import { attributeSlackBookedCallsToSequences } from '../services/sequence-booked-attribution.js';
import { buildSequenceQualificationBreakdown } from '../services/sequence-qualification-analytics.js';
import { getChangelogTimeline, getChangelogByDateRange } from '../services/changelog-service.js';
import {
  isSequenceVersionStatus,
  listSequenceVersionDecisions,
  upsertSequenceVersionDecision,
} from '../services/sequence-version-decisions.js';
import { getSequenceVersionHistory } from '../services/sequence-version-history.js';
import {
  createDashboardSession,
  type DashboardSession,
  type DashboardSessionUser,
  destroyDashboardSession,
  getDashboardSession,
  getDashboardSessionTtlSeconds,
} from '../services/session-store.js';
import { getStreamTokenSecretConfigStatus, mintStreamToken, verifyStreamToken } from '../services/stream-token.js';
import { DEFAULT_BUSINESS_TIMEZONE, dayKeyInTimeZone, resolveMetricsRange } from '../services/time-range.js';
import { getUserSendPreferences, upsertUserSendPreferences } from '../services/user-send-preferences.js';
import { getWeeklyManagerSummary } from '../services/weekly-manager-summary.js';
import {
  assignWorkItem,
  decodeWorkItemCursor,
  listOpenWorkItems,
  resolveWorkItem,
  type WorkItemCursor,
} from '../services/work-items.js';
import {
  toChannelsV2,
  toEnvelope,
  toRunsListV2,
  toRunV2,
  toSalesMetricsV2,
  toWeeklyManagerSummaryV2,
} from './v2-contract.js';
import {
  createRunSchema,
  formatValidationErrors,
  getRunSchema,
  listRunsSchema,
  salesMetricsSchema,
  validateBody,
  validateQuery,
  workItemsQuerySchema,
} from './validation.js';

type ApiRequest = IncomingMessage & {
  body?: unknown;
  user?: unknown;
  authMode?: 'session' | 'bearer';
  session?: DashboardSession;
};

type RequestHandler = (
  req: ApiRequest,
  res: ServerResponse,
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
  origin?: string,
) => Promise<void>;

const OAUTH_STATE_COOKIE_NAME = 'dashboard_oauth_state';
const SESSION_COOKIE_NAME = 'ptbizsms_session';
const CSRF_COOKIE_NAME = 'ptbizsms_csrf';
const DEFAULT_JSON_BODY_MAX_BYTES = 256 * 1024;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_ALLOWED_ORIGINS = [
  'https://ptbizsms.com',
  'https://www.ptbizsms.com',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:3000',
];

type RateLimitBucket = {
  limit: number;
  windowMs: number;
};

type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
};

const rateLimitState = new Map<string, number[]>();

// TTL-based cleanup for rate limit state to prevent unbounded memory growth
// Runs every 5 minutes and removes entries older than the max window (1 hour)
const RATE_LIMIT_CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX_WINDOW_MS = 60 * 60 * 1000; // 1 hour (max window we use)

const cleanupRateLimitState = (): void => {
  const now = Date.now();
  const cutoff = now - RATE_LIMIT_MAX_WINDOW_MS;
  let cleaned = 0;

  for (const [key, timestamps] of rateLimitState.entries()) {
    const active = timestamps.filter((ts) => ts > cutoff);
    if (active.length === 0) {
      rateLimitState.delete(key);
      cleaned++;
    } else if (active.length !== timestamps.length) {
      rateLimitState.set(key, active);
    }
  }

  if (cleaned > 0) {
    // Use console.warn since logger isn't available at module level
    console.warn(`[RateLimit] Cleaned ${cleaned} stale entries, ${rateLimitState.size} active keys remaining`);
  }
};

// Start periodic cleanup
setInterval(cleanupRateLimitState, RATE_LIMIT_CLEANUP_INTERVAL_MS);

const parseBooleanFlag = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true') return true;
  if (normalized === 'false') return false;
  return fallback;
};

const parsePositiveInteger = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const getMutationRateLimit = (): RateLimitBucket => ({
  limit: parsePositiveInteger(process.env.API_MUTATION_RATE_LIMIT_MAX, 60),
  windowMs: parsePositiveInteger(process.env.API_MUTATION_RATE_LIMIT_WINDOW_MS, 60_000),
});

const getSendRateLimit = (): RateLimitBucket => ({
  limit: parsePositiveInteger(process.env.API_SEND_RATE_LIMIT_MAX, 10),
  windowMs: parsePositiveInteger(process.env.API_SEND_RATE_LIMIT_WINDOW_MS, 60_000),
});

const getSendCapPerHour = (): number => parsePositiveInteger(process.env.SMS_SEND_CAP_PER_HOUR, 250);
const getSendCapPerDay = (): number => parsePositiveInteger(process.env.SMS_SEND_CAP_PER_DAY, 2500);
const getSendCapPerConversationHour = (): number =>
  parsePositiveInteger(process.env.SMS_SEND_CAP_PER_CONVERSATION_HOUR, 20);

const getDashboardPassword = (): string => {
  return (process.env.DASHBOARD_PASSWORD || '').trim();
};

const getPersistentSessionTtlSeconds = (): number =>
  parsePositiveInteger(process.env.DASHBOARD_PERSIST_SESSION_TTL_SECONDS, 60 * 60 * 24 * 30);

const getStreamTokenTtlSeconds = (): number => {
  const raw = (process.env.STREAM_TOKEN_TTL_SECONDS || '').trim();
  const parsed = Number.parseInt(raw || '', 10);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 60;
};

const isDashboardSlackOauthEnabled = (): boolean => parseBooleanFlag(process.env.DASHBOARD_SLACK_OAUTH_ENABLED, false);

const shouldUseSecureCookies = (): boolean =>
  parseBooleanFlag(process.env.COOKIE_SECURE, (process.env.NODE_ENV || '').trim() === 'production');

const getAllowedOrigins = (): Set<string> => {
  const configured = (process.env.ALLOWED_ORIGINS || process.env.CORS_ALLOWED_ORIGINS || '').trim();
  if (!configured) {
    return new Set(DEFAULT_ALLOWED_ORIGINS);
  }

  const values = configured
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  return new Set(values);
};

const resolveCorsOrigin = (requestOrigin?: string): string | undefined => {
  if (!requestOrigin) return undefined;
  return getAllowedOrigins().has(requestOrigin) ? requestOrigin : undefined;
};

const parseCookies = (rawCookies: string | undefined): Record<string, string> => {
  if (!rawCookies) return {};

  const entries = rawCookies.split(';').map((part) => part.trim());
  const cookies: Record<string, string> = {};
  for (const entry of entries) {
    const eq = entry.indexOf('=');
    if (eq < 0) continue;
    const key = entry.slice(0, eq).trim();
    const value = entry.slice(eq + 1).trim();
    if (!key) continue;
    cookies[key] = decodeURIComponent(value);
  }
  return cookies;
};

const buildCookie = (
  name: string,
  value: string,
  options: { maxAgeSeconds: number; httpOnly?: boolean; sameSite?: 'Lax' | 'Strict' | 'None' },
): string => {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    `SameSite=${options.sameSite || 'Lax'}`,
    `Max-Age=${Math.max(0, options.maxAgeSeconds)}`,
  ];
  if (options.httpOnly !== false) {
    parts.push('HttpOnly');
  }
  if (shouldUseSecureCookies()) {
    parts.push('Secure');
  }
  return parts.join('; ');
};

const getMaxJsonBodyBytes = (): number => {
  return parsePositiveInteger(process.env.API_JSON_BODY_MAX_BYTES, DEFAULT_JSON_BODY_MAX_BYTES);
};

class HttpRequestError extends Error {
  statusCode: number;

  constructor(statusCode: number, message: string) {
    super(message);
    this.name = 'HttpRequestError';
    this.statusCode = statusCode;
  }
}

const isUuid = (value: string): boolean => UUID_PATTERN.test(value);

const ensureRateLimit = (bucketKey: string, identifier: string, bucket: RateLimitBucket): RateLimitResult => {
  const now = Date.now();
  const key = `${bucketKey}:${identifier}`;
  const cutoff = now - bucket.windowMs;
  const existing = rateLimitState.get(key) || [];
  const active = existing.filter((value) => value > cutoff);
  const allowed = active.length < bucket.limit;
  if (allowed) {
    active.push(now);
  }
  rateLimitState.set(key, active);
  const oldest = active[0] || now;
  const retryAfterMs = Math.max(0, bucket.windowMs - (now - oldest));

  return {
    allowed,
    remaining: Math.max(0, bucket.limit - active.length),
    retryAfterSeconds: Math.max(1, Math.ceil(retryAfterMs / 1000)),
  };
};

const resolveRateLimitActor = (req: ApiRequest): string => {
  const verified = getVerifiedSlackUser(req);
  const userId = (verified.user_id || verified.user || '').trim();
  if (userId) {
    return `user:${userId}`;
  }
  const dashboardClientId = resolveDashboardClientId(req);
  if (dashboardClientId) {
    return `dashboard:${dashboardClientId}`;
  }
  const forwarded = req.headers['x-forwarded-for'];
  const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = (forwardedIp || req.socket.remoteAddress || 'unknown').split(',')[0]?.trim();
  return `ip:${ip || 'unknown'}`;
};

const handleRateLimitExceeded = (
  res: ServerResponse,
  origin: string | undefined,
  result: RateLimitResult,
  message = 'Rate limit exceeded',
) => {
  sendJson(res, 429, { error: message, retryAfterSeconds: result.retryAfterSeconds }, origin, {
    'Retry-After': String(result.retryAfterSeconds),
  });
};

const getSessionFromRequest = (req: IncomingMessage): DashboardSession | null => {
  const cookies = parseCookies(req.headers.cookie);
  const sessionId = (cookies[SESSION_COOKIE_NAME] || '').trim();
  return getDashboardSession(sessionId);
};

const isDummyTokenAllowed = (): boolean => {
  const requested = parseBooleanFlag(process.env.ALLOW_DUMMY_AUTH_TOKEN, false);
  const environment = (process.env.NODE_ENV || '').trim().toLowerCase();
  return requested && environment !== 'production';
};

const extractBearerToken = (req: IncomingMessage): string | null => {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  if (url.pathname === '/api/stream') {
    const token = (url.searchParams.get('token') || '').trim();
    if (!token) return null;

    // Prefer short-lived signed stream tokens for SSE (works through proxies without cookies).
    const verified = verifyStreamToken(token);
    if (verified.ok) {
      return 'stream-token-ok';
    }

    // Back-compat: allow Slack bearer token via ?token=... for /api/stream.
    return token;
  }
  return null;
};

const validateCsrf = (req: ApiRequest): boolean => {
  if (req.authMode !== 'session') {
    return true;
  }
  const session = req.session;
  if (!session) {
    return false;
  }
  const rawHeader = req.headers['x-csrf-token'];
  const header = (Array.isArray(rawHeader) ? rawHeader[0] : rawHeader || '').trim();
  if (!header) {
    return false;
  }
  return header === session.csrfToken;
};

// Parse JSON body
const parseJsonBody = async (req: IncomingMessage): Promise<unknown> => {
  return new Promise((resolve, reject) => {
    const maxBytes = getMaxJsonBodyBytes();
    let body = '';
    let received = 0;
    let finished = false;

    const fail = (error: Error) => {
      if (finished) return;
      finished = true;
      reject(error);
    };

    req.on('data', (chunk: Buffer | string) => {
      if (finished) return;
      const text = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : chunk;
      received += Buffer.byteLength(text, 'utf8');
      if (received > maxBytes) {
        req.destroy();
        fail(new HttpRequestError(413, 'Payload too large'));
        return;
      }
      body += text;
    });
    req.on('end', () => {
      if (finished) return;
      try {
        finished = true;
        resolve(body ? JSON.parse(body) : {});
      } catch {
        fail(new HttpRequestError(400, 'Invalid JSON'));
      }
    });
    req.on('error', (error) => fail(error instanceof Error ? error : new Error('Request stream failed')));
  });
};

const sendBodyParseError = (res: ServerResponse, origin: string | undefined, error: unknown): void => {
  if (error instanceof HttpRequestError) {
    sendJson(res, error.statusCode, { error: error.message }, origin);
    return;
  }
  sendJson(res, 400, { error: 'Invalid request body' }, origin);
};

// Verify session cookie or bearer token.
const verifyToken = async (req: ApiRequest): Promise<boolean> => {
  const session = getSessionFromRequest(req);
  if (session) {
    req.user = session.user;
    req.authMode = 'session';
    req.session = session;
    return true;
  }

  const token = extractBearerToken(req);
  if (!token) {
    return false;
  }

  // Signed stream token (SSE) path.
  if (token === 'stream-token-ok') {
    req.user = { user_id: 'stream-token', team_id: 'ptbizsms', email: null };
    req.authMode = 'bearer';
    return true;
  }

  if (isDummyTokenAllowed() && token === 'dummy-token-bypass-auth') {
    req.user = { user_id: 'dummy-user', team_id: 'dummy-team', email: null };
    req.authMode = 'bearer';
    return true;
  }

  try {
    const slack = new WebClient(token);
    const auth = await slack.auth.test();
    req.user = auth;
    req.authMode = 'bearer';
    return true;
  } catch {
    return false;
  }
};

const sendJson = (
  res: ServerResponse,
  statusCode: number,
  data: unknown,
  origin?: string,
  extraHeaders?: Record<string, string | string[]>,
) => {
  const securityHeaders: Record<string, string> = {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };

  const headers: Record<string, string | string[]> = {
    'Content-Type': 'application/json',
    Vary: 'Origin',
    ...securityHeaders,
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-CSRF-Token, X-Dashboard-Client-Id';
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  if (extraHeaders) {
    Object.assign(headers, extraHeaders);
  }
  res.writeHead(statusCode, headers);
  res.end(JSON.stringify(data));
};

const repDisplayName = (repId: string | null | undefined): string => {
  if (!repId) return 'Unassigned';

  const normalized = repId.trim();
  const jackId = (process.env.ALOWARE_WATCHER_JACK_USER_ID || '').trim();
  const brandonId = (process.env.ALOWARE_WATCHER_BRANDON_USER_ID || '').trim();

  if (jackId && normalized === jackId) return 'Jack';
  if (brandonId && normalized === brandonId) return 'Brandon';

  if (/jack/i.test(normalized)) return 'Jack';
  if (/brandon/i.test(normalized)) return 'Brandon';

  return normalized;
};

const inferOwnerLabelFromHint = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (/\bjack\b/.test(normalized)) return 'Jack';
  if (/\bbrandon\b/.test(normalized)) return 'Brandon';
  return null;
};

const isV2InboxEnabled = (): boolean => parseBooleanFlag(process.env.V2_INBOX_ENABLED, true);
const isAlowareSendEnabled = (): boolean => parseBooleanFlag(process.env.ALOWARE_SEND_ENABLED, true);
const isDraftEngineEnabled = (): boolean => parseBooleanFlag(process.env.AI_DRAFT_ENGINE_ENABLED, true);
const isStrictLintEnabled = (): boolean => parseBooleanFlag(process.env.AI_DRAFT_STRICT_LINT_ENABLED, true);

const handleAuthVerify: RequestHandler = async (req, res, _logger, origin) => {
  sendJson(
    res,
    200,
    {
      ok: true,
      user: req.user || null,
      authMode: req.authMode || null,
      csrfToken: req.authMode === 'session' ? req.session?.csrfToken || null : null,
    },
    origin,
  );
};

const handleAuthPassword: RequestHandler = async (req, res, _logger, origin) => {
  let body: { password?: string; stayLoggedIn?: boolean } = {};
  try {
    body = (await parseJsonBody(req)) as { password?: string; stayLoggedIn?: boolean };
  } catch (error) {
    sendBodyParseError(res, origin, error);
    return;
  }

  const password = (body.password || '').trim();
  if (!password) {
    sendJson(res, 400, { error: 'Password is required' }, origin);
    return;
  }

  const actorIp = (() => {
    const forwarded = req.headers['x-forwarded-for'];
    const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    return (forwardedIp || req.socket.remoteAddress || 'unknown').split(',')[0]?.trim() || 'unknown';
  })();
  const rateLimitResult = ensureRateLimit('password_auth', actorIp, {
    limit: parsePositiveInteger(process.env.PASSWORD_AUTH_RATE_LIMIT_MAX, 10),
    windowMs: parsePositiveInteger(process.env.PASSWORD_AUTH_RATE_LIMIT_WINDOW_MS, 60_000),
  });
  if (!rateLimitResult.allowed) {
    handleRateLimitExceeded(res, origin, rateLimitResult, 'Too many password attempts');
    return;
  }

  const expected = getDashboardPassword();
  if (!expected) {
    _logger?.error('Password auth attempted while DASHBOARD_PASSWORD is not configured');
    sendJson(res, 503, { error: 'Password auth is not configured on the server' }, origin);
    return;
  }
  if (!expected || password !== expected) {
    sendJson(res, 401, { error: 'Invalid password' }, origin);
    return;
  }

  const stayLoggedIn = body.stayLoggedIn !== false;
  const sessionTtlSeconds = stayLoggedIn ? getPersistentSessionTtlSeconds() : getDashboardSessionTtlSeconds();
  const sessionUser: DashboardSessionUser = {
    user_id: 'dashboard-password-user',
    user: 'Dashboard User',
    team_id: 'ptbizsms',
  };

  const cookies = parseCookies(req.headers.cookie);
  const existingSession = (cookies[SESSION_COOKIE_NAME] || '').trim();
  if (existingSession) {
    destroyDashboardSession(existingSession);
  }

  const session = createDashboardSession(sessionUser, { ttlSeconds: sessionTtlSeconds });

  sendJson(
    res,
    200,
    {
      ok: true,
      authMode: 'session',
      user: session.user,
      csrfToken: session.csrfToken,
    },
    origin,
    {
      'Cache-Control': 'no-store',
      'Set-Cookie': [
        buildCookie(OAUTH_STATE_COOKIE_NAME, '', { maxAgeSeconds: 0 }),
        buildCookie(SESSION_COOKIE_NAME, session.id, {
          maxAgeSeconds: sessionTtlSeconds,
          httpOnly: true,
        }),
        buildCookie(CSRF_COOKIE_NAME, session.csrfToken, {
          maxAgeSeconds: sessionTtlSeconds,
          httpOnly: false,
        }),
      ],
    },
  );
};

const handleAuthLogout: RequestHandler = async (req, res, _logger, origin) => {
  const cookies = parseCookies(req.headers.cookie);
  const existingSession = (cookies[SESSION_COOKIE_NAME] || '').trim();
  if (existingSession) {
    destroyDashboardSession(existingSession);
  }
  sendJson(res, 200, { ok: true }, origin, {
    'Cache-Control': 'no-store',
    'Set-Cookie': [
      buildCookie(SESSION_COOKIE_NAME, '', { maxAgeSeconds: 0, httpOnly: true }),
      buildCookie(CSRF_COOKIE_NAME, '', { maxAgeSeconds: 0, httpOnly: false }),
      buildCookie(OAUTH_STATE_COOKIE_NAME, '', { maxAgeSeconds: 0 }),
    ],
  });
};

const getBuildSha = (): string => {
  return (
    (process.env.BUILD_SHA || '').trim() ||
    (process.env.VERCEL_GIT_COMMIT_SHA || '').trim() ||
    (process.env.RAILWAY_GIT_COMMIT_SHA || '').trim() ||
    'unknown'
  );
};

const handleGetRuntimeStatus: RequestHandler = async (_req, res, _logger, origin) => {
  const streamTokenConfig = getStreamTokenSecretConfigStatus();
  const slackAuthRuntime = getSlackAuthRuntimeStatus();
  const prismaRuntime = await getPrismaRuntimeStatus();
  const buildSha = getBuildSha();

  sendJson(
    res,
    200,
    {
      ok: streamTokenConfig.status !== 'error' && slackAuthRuntime.status !== 'error',
      service: 'ptbizsms-api',
      appName: 'ptbizsms',
      time: new Date().toISOString(),
      checks: {
        slack_auth: {
          status: slackAuthRuntime.status,
          detail: slackAuthRuntime.detail,
          updatedAt: slackAuthRuntime.updatedAt,
        },
        stream_token_config: {
          status: streamTokenConfig.status,
          configured: streamTokenConfig.configured,
          detail: streamTokenConfig.reason,
        },
        prisma_accelerate: {
          status: prismaRuntime.status,
          configured: prismaRuntime.configured,
          detail: prismaRuntime.detail,
        },
        build_sha: {
          status: buildSha === 'unknown' ? 'warn' : 'ok',
          value: buildSha,
        },
      },
    },
    origin,
  );
};

const handleApiHealth: RequestHandler = async (_req, res, _logger, origin) => {
  const prisma = getPrisma();
  let dbStatus: 'ok' | 'warn' | 'error' = 'warn';
  let dbDetail = 'Prisma client is not initialized';
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    dbStatus = 'ok';
    dbDetail = 'Prisma query check passed';
  } catch (error) {
    dbStatus = 'error';
    dbDetail = `Prisma query check failed: ${error instanceof Error ? error.message : String(error)}`;
  }

  const prismaRuntime = await getPrismaRuntimeStatus();
  const streamTokenConfig = getStreamTokenSecretConfigStatus();
  const slackAuthRuntime = getSlackAuthRuntimeStatus();
  const alowareIngest = getAlowareIngestHealthSnapshot();
  const buildSha = getBuildSha();
  const hasBuildSha = buildSha !== 'unknown';
  const criticalFailure = dbStatus === 'error' || streamTokenConfig.status === 'error';
  const hasWarnings = (dbStatus as string) === 'warn' || (streamTokenConfig.status as string) === 'warn' || !hasBuildSha;

  const status = criticalFailure ? 'degraded' : hasWarnings ? 'degraded' : 'ok';

  sendJson(
    res,
    200,
    {
      ok: !criticalFailure,
      status,
      service: 'ptbizsms-api',
      appName: 'ptbizsms',
      time: new Date().toISOString(),
      checks: {
        db: {
          status: dbStatus,
          detail: dbDetail,
        },
        prisma_accelerate: {
          status: prismaRuntime.status,
          configured: prismaRuntime.configured,
          detail: prismaRuntime.detail,
        },
        slack_auth: {
          status: slackAuthRuntime.status,
          detail: slackAuthRuntime.detail,
          updatedAt: slackAuthRuntime.updatedAt,
        },
        aloware_ingest: {
          status: alowareIngest.totals.seen === 0 ? 'warn' : alowareIngest.totals.skipRatePct >= 20 ? 'warn' : 'ok',
          detail: `seen=${alowareIngest.totals.seen} ingested=${alowareIngest.totals.ingested} skipped=${alowareIngest.totals.skipped} skipRate=${alowareIngest.totals.skipRatePct}%`,
          metadata: {
            startedAt: alowareIngest.startedAt,
            byReason: alowareIngest.byReason,
            recentSamples: alowareIngest.recentSamples,
          },
        },
        stream_token_config: {
          status: streamTokenConfig.status,
          configured: streamTokenConfig.configured,
          detail: streamTokenConfig.reason,
        },
        auth_mode: {
          status: 'ok',
          value: 'password_only',
        },
        build_sha: {
          status: hasBuildSha ? 'ok' : 'warn',
          value: buildSha,
        },
      },
    },
    origin,
  );
};

const handleOauthStart: RequestHandler = async (_req, res, logger) => {
  if (!isDashboardSlackOauthEnabled()) {
    res.writeHead(302, {
      Location: '/?auth=password&oauth=deprecated',
      Warning: '299 - "Dashboard Slack OAuth is deprecated; use password login"',
      'X-PTBizSMS-Deprecated': 'dashboard-slack-oauth',
      'Cache-Control': 'no-store',
      'Set-Cookie': buildCookie(OAUTH_STATE_COOKIE_NAME, '', { maxAgeSeconds: 0 }),
    });
    res.end();
    logger?.warn('Dashboard OAuth start requested while Slack OAuth is disabled');
    return;
  }

  const clientId = (process.env.SLACK_CLIENT_ID || '').trim();
  const redirectUri = (process.env.DASHBOARD_AUTH_REDIRECT_URI || '').trim();
  const userScopes = (process.env.DASHBOARD_OAUTH_USER_SCOPES || 'users:read').trim();

  if (!clientId || !redirectUri) {
    sendJson(res, 500, { error: 'OAuth is not configured on the server' });
    return;
  }

  const state = randomBytes(16).toString('hex');
  const authorizeUrl = new URL('https://slack.com/oauth/v2/authorize');
  authorizeUrl.searchParams.set('client_id', clientId);
  authorizeUrl.searchParams.set('redirect_uri', redirectUri);
  authorizeUrl.searchParams.set('state', state);
  if (userScopes) {
    authorizeUrl.searchParams.set('user_scope', userScopes);
  }

  const headers: Record<string, string> = {
    Location: authorizeUrl.toString(),
    'Set-Cookie': buildCookie(OAUTH_STATE_COOKIE_NAME, state, { maxAgeSeconds: 600 }),
  };
  res.writeHead(302, headers);
  res.end();
  logger?.info('Started dashboard OAuth flow');
};

const handleOauthCallback: RequestHandler = async (req, res, logger) => {
  if (!isDashboardSlackOauthEnabled()) {
    res.writeHead(302, {
      Location: '/?auth=password&oauth=deprecated',
      Warning: '299 - "Dashboard Slack OAuth is deprecated; use password login"',
      'X-PTBizSMS-Deprecated': 'dashboard-slack-oauth',
      'Cache-Control': 'no-store',
      'Set-Cookie': buildCookie(OAUTH_STATE_COOKIE_NAME, '', { maxAgeSeconds: 0 }),
    });
    res.end();
    logger?.warn('Dashboard OAuth callback requested while Slack OAuth is disabled');
    return;
  }

  const clientId = (process.env.SLACK_CLIENT_ID || '').trim();
  const clientSecret = (process.env.SLACK_CLIENT_SECRET || '').trim();
  const redirectUri = (process.env.DASHBOARD_AUTH_REDIRECT_URI || '').trim();

  if (!clientId || !clientSecret || !redirectUri) {
    sendJson(res, 500, { error: 'OAuth is not configured on the server' });
    return;
  }

  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const code = (url.searchParams.get('code') || '').trim();
  const returnedState = (url.searchParams.get('state') || '').trim();
  const oauthError = (url.searchParams.get('error') || '').trim();
  const cookies = parseCookies(req.headers.cookie);
  const expectedState = (cookies[OAUTH_STATE_COOKIE_NAME] || '').trim();

  if (oauthError) {
    sendJson(res, 400, { error: `OAuth denied: ${oauthError}` });
    return;
  }

  if (!code) {
    sendJson(res, 400, { error: 'Missing OAuth code' });
    return;
  }

  if (!returnedState || !expectedState || returnedState !== expectedState) {
    sendJson(res, 400, { error: 'Invalid OAuth state' });
    return;
  }

  const slack = new WebClient();
  try {
    const response = await slack.oauth.v2.access({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });

    const token = response.authed_user?.access_token || response.access_token;
    if (!token) {
      sendJson(res, 500, { error: 'OAuth succeeded but no user token was returned' });
      return;
    }
    const auth = await slack.auth.test({ token });
    const sessionUser: DashboardSessionUser = {
      user_id: auth.user_id || response.authed_user?.id || undefined,
      user: auth.user || response.authed_user?.id || undefined,
      team_id: auth.team_id || undefined,
    };
    const existingSession = (cookies[SESSION_COOKIE_NAME] || '').trim();
    if (existingSession) {
      destroyDashboardSession(existingSession);
    }
    const session = createDashboardSession(sessionUser);
    const sessionTtlSeconds = getDashboardSessionTtlSeconds();
    const successUrl = (process.env.DASHBOARD_AUTH_SUCCESS_URL || 'https://ptbizsms.com/v2/insights?ui=v2').trim();

    res.writeHead(302, {
      Location: successUrl,
      'Set-Cookie': [
        buildCookie(OAUTH_STATE_COOKIE_NAME, '', { maxAgeSeconds: 0 }),
        buildCookie(SESSION_COOKIE_NAME, session.id, { maxAgeSeconds: sessionTtlSeconds, httpOnly: true }),
        buildCookie(CSRF_COOKIE_NAME, session.csrfToken, { maxAgeSeconds: sessionTtlSeconds, httpOnly: false }),
      ],
      'Cache-Control': 'no-store',
    });
    res.end();
    logger?.info('Completed dashboard OAuth callback');
  } catch (error) {
    logger?.error('OAuth callback failed', error);
    sendJson(res, 500, { error: 'OAuth callback failed' });
  }
};

const handleGetRuns: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);

  const queryParams = {
    daysBack: url.searchParams.get('daysBack') || undefined,
    channelId: url.searchParams.get('channelId') || undefined,
    limit: url.searchParams.get('limit') || undefined,
    offset: url.searchParams.get('offset') || undefined,
    raw: url.searchParams.get('raw') === 'true',
    legacyOnly: url.searchParams.get('legacyOnly') === 'true',
    includeLegacy: url.searchParams.get('includeLegacy') === 'true',
  };

  const validation = validateQuery(listRunsSchema, queryParams);
  if (validation.success === false) {
    sendJson(
      res,
      400,
      { error: 'Invalid query parameters', details: formatValidationErrors(validation.error) },
      origin,
    );
    return;
  }

  const { channelId, limit, offset, daysBack, raw } = validation.data;
  const legacyMode = queryParams.legacyOnly ? 'only' : queryParams.includeLegacy ? 'include' : 'exclude';

  const runs = await getDailyRuns(
    {
      channelId,
      limit,
      offset,
      daysBack,
      raw,
      legacyMode,
    },
    logger,
  );

  sendJson(res, 200, { runs }, origin);
};

const handleGetRunById: RequestHandler = async (req, res, logger, origin) => {
  const id = req.url?.split('/').pop();

  const validation = validateQuery(getRunSchema, { id: id || '' });
  if (!validation.success) {
    sendJson(res, 400, { error: 'Invalid run ID', details: formatValidationErrors(validation.error) }, origin);
    return;
  }

  const run = await getDailyRunById(validation.data.id, logger);
  if (!run) {
    return sendJson(res, 404, { error: 'Run not found' }, origin);
  }

  sendJson(res, 200, { run }, origin);
};

const handlePostRun: RequestHandler = async (req, res, logger, origin) => {
  const botToken = req.headers['x-bot-token'];
  if (!process.env.SLACK_BOT_TOKEN) {
    return sendJson(res, 503, { error: 'Bot token not configured' }, origin);
  }
  if (botToken !== process.env.SLACK_BOT_TOKEN) {
    return sendJson(res, 401, { error: 'Invalid bot token' }, origin);
  }

  let rawBody: unknown;
  try {
    rawBody = await parseJsonBody(req);
  } catch (error) {
    sendBodyParseError(res, origin, error);
    return;
  }

  const validation = validateBody(createRunSchema, rawBody);
  if (!validation.success) {
    sendJson(res, 400, { error: 'Invalid request body', details: formatValidationErrors(validation.error) }, origin);
    return;
  }

  const { channelId, channelName, reportType, status, errorMessage, summaryText, fullReport, durationMs } =
    validation.data;

  try {
    const runId = await logDailyRun(
      {
        channelId,
        channelName: channelName ?? undefined,
        reportType,
        status,
        errorMessage,
        summaryText,
        fullReport,
        durationMs,
      },
      logger,
    );

    if (!runId) {
      return sendJson(res, 500, { error: 'Failed to log run' }, origin);
    }

    sendJson(res, 200, { runId }, origin);
  } catch (error) {
    logger?.error('Failed to post run:', error);
    sendJson(res, 500, { error: 'Failed to log run' }, origin);
  }
};

const handleGetChannels: RequestHandler = async (_req, res, logger, origin) => {
  const channels = await getChannelsWithRuns(logger);
  sendJson(res, 200, { channels }, origin);
};

const handleGetRunsV2: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const channelId = url.searchParams.get('channelId') || undefined;
  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50, 100);
  const offset = Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0;
  const daysBack = Number.parseInt(url.searchParams.get('daysBack') || '7', 10) || 7;
  const includeFullReport = url.searchParams.get('includeFullReport') === 'true';
  const legacyOnly = url.searchParams.get('legacyOnly') === 'true';
  const includeLegacy = url.searchParams.get('includeLegacy') === 'true';
  const legacyMode = legacyOnly ? 'only' : includeLegacy ? 'include' : 'exclude';

  const rows = await getDailyRuns(
    {
      channelId: channelId as string | undefined,
      limit,
      offset,
      daysBack,
      raw: false,
      legacyMode,
    },
    logger,
  );

  const parsedMetrics = rows.map((row) =>
    parseRunMetrics(row.id, row.report_date, row.summary_text, row.duration_ms),
  );
  const outliers = detectRunOutliers(parsedMetrics);

  sendJson(
    res,
    200,
    toEnvelope({
      data: toRunsListV2({ rows, limit, offset, daysBack, channelId, legacyMode, includeFullReport, outliers }),
      timeZone: DEFAULT_BUSINESS_TIMEZONE,
    }),
    origin,
  );
};

const handleGetRunByIdV2: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);
  const runId = (parts[3] || '').trim(); // /api/v2/runs/:id
  if (!runId) {
    return sendJson(res, 400, { error: 'Missing run ID' }, origin);
  }
  if (!isUuid(runId)) {
    return sendJson(res, 400, { error: 'Invalid run ID' }, origin);
  }

  const run = await getDailyRunById(runId, logger);
  if (!run) {
    return sendJson(res, 404, { error: 'Run not found' }, origin);
  }

  sendJson(
    res,
    200,
    toEnvelope({
      data: toRunV2(run, { includeFullReport: true }),
      timeZone: DEFAULT_BUSINESS_TIMEZONE,
    }),
    origin,
  );
};

const handleGetChannelsV2: RequestHandler = async (_req, res, logger, origin) => {
  const channels = await getChannelsWithRuns(logger);
  sendJson(
    res,
    200,
    toEnvelope({
      data: toChannelsV2(channels),
      timeZone: DEFAULT_BUSINESS_TIMEZONE,
    }),
    origin,
  );
};

const handleGetScoreboardV2: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const weekStart = (url.searchParams.get('weekStart') || '').trim();
  const tz = (url.searchParams.get('tz') || '').trim();
  const data = await getScoreboardData({ weekStart: weekStart || undefined, timeZone: tz || undefined }, logger);
  sendJson(res, 200, toEnvelope({ data, timeZone: data.window.timeZone }), origin);
};

const handleGetSequenceQualificationV2: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const rangeParam = url.searchParams.get('range') || '7d';
  const timeZone = url.searchParams.get('tz') || DEFAULT_BUSINESS_TIMEZONE;

  const { from, to } = resolveMetricsRange({ range: rangeParam, tz: timeZone });

  try {
    const items = await buildSequenceQualificationBreakdown({
      from: from.toISOString(),
      to: to.toISOString(),
      timezone: timeZone,
      logger,
    });

    sendJson(
      res,
      200,
      toEnvelope({
        data: { items, window: { from: from.toISOString(), to: to.toISOString(), timeZone } },
        timeZone,
      }),
      origin,
    );
  } catch (error) {
    logger?.error('Failed to fetch sequence qualification data:', error);
    sendJson(
      res,
      500,
      {
        error: 'Failed to fetch sequence qualification data',
        details: error instanceof Error ? error.message : String(error),
      },
      origin,
    );
  }
};

const handleGetSequenceKpisV2: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  let resolved: ReturnType<typeof resolveMetricsRange>;
  try {
    resolved = resolveMetricsRange({
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      day: url.searchParams.get('day'),
      range: url.searchParams.get('range') ?? '7d',
      tz: url.searchParams.get('tz'),
    });
  } catch (error) {
    return sendJson(res, 400, { error: error instanceof Error ? error.message : 'Invalid range query' }, origin);
  }

  try {
    const payload = await getSequenceKpis(
      {
        from: resolved.from,
        to: resolved.to,
        timeZone: resolved.timeZone,
      },
      logger,
    );
    sendJson(
      res,
      200,
      toEnvelope({
        data: payload,
        timeZone: resolved.timeZone || DEFAULT_BUSINESS_TIMEZONE,
        requestedMode: resolved.mode,
      }),
      origin,
    );
  } catch (error) {
    logger?.error('Failed to fetch sequence KPIs:', error);
    sendJson(
      res,
      500,
      { error: 'Failed to fetch sequence KPIs', details: error instanceof Error ? error.message : String(error) },
      origin,
    );
  }
};

const shouldRefreshFactsOnRead = (): boolean => {
  const raw = (process.env.KPI_FACT_REFRESH_ON_READ || 'true').trim().toLowerCase();
  return raw !== 'false' && raw !== '0' && raw !== 'off';
};

const handleGetInsightsSummaryV2: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  let resolved: ReturnType<typeof resolveMetricsRange>;
  try {
    resolved = resolveMetricsRange({
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      day: url.searchParams.get('day'),
      range: url.searchParams.get('range') ?? '7d',
      tz: url.searchParams.get('tz'),
    });
  } catch (error) {
    return sendJson(res, 400, { error: error instanceof Error ? error.message : 'Invalid range query' }, origin);
  }

  const repRaw = (url.searchParams.get('rep') || '').trim().toLowerCase();
  const rep = repRaw === 'jack' || repRaw === 'brandon' ? repRaw : null;

  try {
    let refreshInfo:
      | {
          fallbackBookingRows: number;
          fallbackBookedTotal: number;
        }
      | null = null;
    if (shouldRefreshFactsOnRead()) {
      refreshInfo = await refreshKpiFacts(
        {
          from: resolved.from,
          to: resolved.to,
          timeZone: resolved.timeZone || DEFAULT_BUSINESS_TIMEZONE,
        },
        logger,
      );
    }

    const [data, lagStatus] = await Promise.all([
      getInsightsSummary(
        {
          from: resolved.from,
          to: resolved.to,
          timeZone: resolved.timeZone || DEFAULT_BUSINESS_TIMEZONE,
          rep,
        },
        logger,
      ),
      getAttributionLagStatus(24),
    ]);

    const warnings: string[] = [];
    if (refreshInfo && refreshInfo.fallbackBookingRows > 0) {
      warnings.push(
        `Fallback booking attribution applied for ${refreshInfo.fallbackBookingRows} day(s), ${refreshInfo.fallbackBookedTotal} booking(s).`,
      );
    }
    if (lagStatus.isLagging) {
      warnings.push(
        `Booked-call attribution lag is ${lagStatus.lagHours}h behind booked_calls (max attribution ${lagStatus.maxAttributionTs}).`,
      );
    }
    if (warnings.length > 0) {
      data.warnings = warnings;
    }

    sendJson(res, 200, toEnvelope({ data, timeZone: data.window.timeZone, requestedMode: resolved.mode }), origin);
  } catch (error) {
    logger?.error('Failed to fetch insights summary:', error);
    sendJson(
      res,
      500,
      { error: 'Failed to fetch insights summary', details: error instanceof Error ? error.message : String(error) },
      origin,
    );
  }
};

const handleGetSequencesDeepV2: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  let resolved: ReturnType<typeof resolveMetricsRange>;
  try {
    resolved = resolveMetricsRange({
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      day: url.searchParams.get('day'),
      range: url.searchParams.get('range') ?? '30d',
      tz: url.searchParams.get('tz'),
    });
  } catch (error) {
    return sendJson(res, 400, { error: error instanceof Error ? error.message : 'Invalid range query' }, origin);
  }

  const statusRaw = (url.searchParams.get('status') || '').trim().toLowerCase();
  const status = statusRaw === 'active' || statusRaw === 'inactive' ? statusRaw : null;

  try {
    let refreshInfo:
      | {
          fallbackBookingRows: number;
          fallbackBookedTotal: number;
        }
      | null = null;
    if (shouldRefreshFactsOnRead()) {
      refreshInfo = await refreshKpiFacts(
        {
          from: resolved.from,
          to: resolved.to,
          timeZone: resolved.timeZone || DEFAULT_BUSINESS_TIMEZONE,
        },
        logger,
      );
    }

    const [data, lagStatus] = await Promise.all([
      getSequencesDeep(
        {
          from: resolved.from,
          to: resolved.to,
          timeZone: resolved.timeZone || DEFAULT_BUSINESS_TIMEZONE,
          status,
        },
        logger,
      ),
      getAttributionLagStatus(24),
    ]);

    const warnings: string[] = [];
    if (refreshInfo && refreshInfo.fallbackBookingRows > 0) {
      warnings.push(
        `Fallback booking attribution applied for ${refreshInfo.fallbackBookingRows} day(s), ${refreshInfo.fallbackBookedTotal} booking(s).`,
      );
    }
    if (lagStatus.isLagging) {
      warnings.push(
        `Booked-call attribution lag is ${lagStatus.lagHours}h behind booked_calls (max attribution ${lagStatus.maxAttributionTs}).`,
      );
    }
    const verification = data.verification;
    const mondayDeltaAbs = Math.abs(verification.deltaBookedVsMonday);
    const mondayDeltaPct =
      verification.mondayBookedTotal > 0 ? (mondayDeltaAbs / verification.mondayBookedTotal) * 100 : 0;
    if (verification.mondayBookedTotal > 0 && mondayDeltaPct >= 15) {
      warnings.push(
        `Slack-vs-Monday booked delta is ${verification.deltaBookedVsMonday} (${mondayDeltaPct.toFixed(1)}% of Monday booked).`,
      );
    }
    if (verification.manualDirectSharePct >= 35) {
      warnings.push(
        `Manual/direct booked share is high (${verification.manualDirectSharePct.toFixed(1)}%). Sequence attribution likely still under-mapped.`,
      );
    }
    if (verification.attributionConversationMappedPct < 40) {
      warnings.push(
        `Conversation linkage on booked_call_attribution is low (${verification.attributionConversationMappedPct.toFixed(1)}%).`,
      );
    }
    if (warnings.length > 0) {
      data.warnings = warnings;
    }

    sendJson(res, 200, toEnvelope({ data, timeZone: data.window.timeZone, requestedMode: resolved.mode }), origin);
  } catch (error) {
    logger?.error('Failed to fetch sequences deep analytics:', error);
    sendJson(
      res,
      500,
      {
        error: 'Failed to fetch sequences deep analytics',
        details: error instanceof Error ? error.message : String(error),
      },
      origin,
    );
  }
};

const handleGetSequenceVersionHistoryV2: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const lookbackDaysRaw = Number.parseInt(url.searchParams.get('lookbackDays') || '365', 10);
  const lookbackDays = Number.isFinite(lookbackDaysRaw) ? lookbackDaysRaw : 365;
  try {
    const [items, decisions] = await Promise.all([
      getSequenceVersionHistory({ lookbackDays }, logger),
      listSequenceVersionDecisions(logger),
    ]);
    const statusByLabel = new Map<string, string>();
    for (const decision of decisions) {
      statusByLabel.set(decision.sequence_label, decision.status);
    }
    sendJson(
      res,
      200,
      toEnvelope({
        data: {
          items: items.map((item) => ({
            ...item,
            status: statusByLabel.get(item.label) || 'testing',
          })),
          lookbackDays,
        },
        timeZone: DEFAULT_BUSINESS_TIMEZONE,
      }),
      origin,
    );
  } catch (error) {
    logger?.error('Failed to fetch sequence version history:', error);
    sendJson(
      res,
      500,
      {
        error: 'Failed to fetch sequence version history',
        details: error instanceof Error ? error.message : String(error),
      },
      origin,
    );
  }
};

const handlePostSequenceVersionDecisionV2: RequestHandler = async (req, res, logger, origin) => {
  let body: { label?: string; status?: string; updatedBy?: string } = {};
  try {
    body = (await parseJsonBody(req)) as typeof body;
  } catch (error) {
    sendBodyParseError(res, origin, error);
    return;
  }

  const label = body.label?.trim() || '';
  const status = body.status?.trim() || '';
  if (!label) {
    return sendJson(res, 400, { error: 'label is required' }, origin);
  }
  if (!isSequenceVersionStatus(status)) {
    return sendJson(res, 400, { error: 'status must be one of: active, testing, rewrite, archived' }, origin);
  }

  try {
    const decision = await upsertSequenceVersionDecision(label, status, body.updatedBy?.trim() || null, logger);
    sendJson(
      res,
      200,
      toEnvelope({
        data: {
          label: decision.sequence_label,
          status: decision.status,
          updatedBy: decision.updated_by,
          updatedAt: decision.updated_at,
        },
        timeZone: DEFAULT_BUSINESS_TIMEZONE,
      }),
      origin,
    );
  } catch (error) {
    logger?.error('Failed to save sequence version decision:', error);
    sendJson(
      res,
      500,
      {
        error: 'Failed to save sequence version decision',
        details: error instanceof Error ? error.message : String(error),
      },
      origin,
    );
  }
};

const handleGetWeeklySummaryV2: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const weekStartRaw = (url.searchParams.get('weekStart') || '').trim();
  const timeZoneRaw = (url.searchParams.get('tz') || '').trim();

  if (weekStartRaw && !/^\d{4}-\d{2}-\d{2}$/.test(weekStartRaw)) {
    sendJson(res, 400, { error: 'Invalid weekStart format. Expected YYYY-MM-DD' }, origin);
    return;
  }

  try {
    const summary = await getWeeklyManagerSummary(
      {
        weekStart: weekStartRaw || undefined,
        timeZone: timeZoneRaw || undefined,
      },
      logger,
    );
    sendJson(
      res,
      200,
      toEnvelope({
        data: toWeeklyManagerSummaryV2(summary),
        timeZone: summary.window.timeZone || DEFAULT_BUSINESS_TIMEZONE,
      }),
      origin,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isValidationError = /Invalid timezone|Invalid day format|Invalid weekStart|expected YYYY-MM-DD/i.test(
      message,
    );
    if (isValidationError) {
      sendJson(res, 400, { error: message }, origin);
      return;
    }
    logger?.error('Failed to fetch v2 weekly summary:', error);
    sendJson(res, 500, { error: 'Failed to fetch v2 weekly summary', details: message }, origin);
  }
};

const handleGetConversationById: RequestHandler = async (req, res, logger, origin) => {
  const id = req.url?.split('/').pop();
  if (!id) {
    return sendJson(res, 400, { error: 'Missing conversation ID' }, origin);
  }
  if (!isUuid(id)) {
    return sendJson(res, 400, { error: 'Invalid conversation ID' }, origin);
  }

  const conversation = await getConversationById(id, logger);
  if (!conversation) {
    return sendJson(res, 404, { error: 'Conversation not found' }, origin);
  }

  // Fetch recent events to satisfy the frontend Conversation detail view
  const events = await listSmsEventsForConversation(
    { id: conversation.id, contact_id: conversation.contact_id, contact_phone: conversation.contact_phone },
    50,
    logger,
  );

  // Map to frontend format
  const frontendConversation = {
    id: conversation.id,
    contactId: conversation.contact_id,
    contactName: conversation.contact_phone, // Fallback
    repId: conversation.current_rep_id,
    repName: conversation.current_rep_id ? repDisplayName(conversation.current_rep_id) : null,
    lastMessageAt: conversation.last_touch_at,
    lastInboundAt: conversation.last_inbound_at,
    lastOutboundAt: conversation.last_outbound_at,
    firstResponseAt: null, // Calculate if needed
    source: 'inbound',
    stage: 'active',
    events: events.map((e) => ({
      id: e.id,
      direction: e.direction,
      body: e.body,
      createdAt: e.event_ts,
    })),
  };

  sendJson(res, 200, frontendConversation, origin);
};

const handleGetConversationEvents: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);
  const id = parts[2]; // /api/conversations/:id/events
  if (!id) {
    return sendJson(res, 400, { error: 'Missing conversation ID' }, origin);
  }
  if (!isUuid(id)) {
    return sendJson(res, 400, { error: 'Invalid conversation ID' }, origin);
  }

  const limit = Math.min(Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200);

  const conversation = await getConversationById(id, logger);
  if (!conversation) {
    return sendJson(res, 404, { error: 'Conversation not found' }, origin);
  }

  const events = await listSmsEventsForConversation(
    { id: conversation.id, contact_id: conversation.contact_id, contact_phone: conversation.contact_phone },
    limit,
    logger,
  );

  sendJson(res, 200, { events }, origin);
};

const handleGetMetrics: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  let resolved: ReturnType<typeof resolveMetricsRange>;
  try {
    resolved = resolveMetricsRange({
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      day: url.searchParams.get('day'),
      range: url.searchParams.get('range'),
      tz: url.searchParams.get('tz'),
    });
  } catch (error) {
    return sendJson(res, 400, { error: error instanceof Error ? error.message : 'Invalid range query' }, origin);
  }

  const from = resolved.from;
  const to = resolved.to;
  const days = Math.ceil((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24));
  const windowDays = Math.max(1, Math.min(days, 90));

  const [overview, sla, workload, volume] = await Promise.all([
    getMetricsOverview({ windowDays, repId: undefined }, logger),
    // Pass empty string instead of undefined to avoid pg "could not determine data type of parameter $1"
    // in some environments when the first param is omitted.
    getSlaMetrics({ windowDays, repId: '' }, logger),
    getWorkloadByRepMetrics({ windowDays }, logger),
    getVolumeByDayMetrics({ windowDays }, logger),
  ]).catch((err) => {
    logger?.error('Failed to fetch metrics:', err);
    sendJson(
      res,
      500,
      { error: 'Failed to fetch metrics', details: err instanceof Error ? err.message : String(err) },
      origin,
    );
    return [null, null, null, null] as const;
  });

  if (!overview || !sla || !workload || !volume) {
    return;
  }

  // Definitions are still being normalized in this endpoint; avoid rough proxy totals.
  // Return nullable values + explicit metadata instead of misleading approximations.
  const summary = {
    timeRange: { from: from.toISOString(), to: to.toISOString() },
    totalConversations: null,
    newConversations: null,
    reps: workload.rows.map((r) => ({
      repId: r.repId || 'unassigned',
      repName: repDisplayName(r.repId),
      conversationsHandled: r.conversationsWithOpenItems,
      avgFirstResponseMinutes: null,
      p90FirstResponseMinutes: null,
      followupLagMinutesAvg: null,
      openWorkItems: r.openWorkItems,
      overdueWorkItems: r.overdueWorkItems,
      conversionRate: null,
    })),
    pipelineVelocity: {
      avgTimeToFirstResponseMinutes: sla.p50Minutes,
      avgTimeToQualifiedMinutes: null,
      avgTimeToCloseWonMinutes: null,
    },
    responseTimeBuckets: sla.buckets,
    openWorkItems: overview.openWorkItems,
    overdueWorkItems: overview.overdueWorkItems,
    meta: {
      timeZone: resolved.timeZone,
      definitionStatus: 'experimental',
      definitions: {
        totalConversations: 'experimental-null',
        newConversations: 'experimental-null',
        responseTimeBuckets: 'inbound->first outbound approximation',
        reps: 'open work-item workload by rep_id',
      },
      requestedMode: resolved.mode,
    },
  };

  sendJson(res, 200, summary, origin);
};

const buildSalesMetricsPayload = async (params: {
  from: Date;
  to: Date;
  timeZone: string;
  requestedMode: 'day' | 'range' | 'from-to';
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>;
}) => {
  const [summary, bookedCalls, bookedAttributionSources] = await Promise.all([
    getSalesMetricsSummary({ from: params.from, to: params.to, timeZone: params.timeZone }, params.logger),
    getBookedCallsSummary(
      { from: params.from, to: params.to, channelId: process.env.BOOKED_CALLS_CHANNEL_ID, timeZone: params.timeZone },
      params.logger,
    ),
    getBookedCallAttributionSources({
      from: params.from,
      to: params.to,
      channelId: process.env.BOOKED_CALLS_CHANNEL_ID,
    }),
  ]);

  const [smsReplyLinks, smsSequenceLookup] = await Promise.all([
    getBookedCallSmsReplyLinks(bookedAttributionSources, params.logger),
    getBookedCallSequenceFromSmsEvents(bookedAttributionSources, params.logger),
  ]);
  const canonical = buildCanonicalSalesMetricsSlice(summary, bookedCalls);
  const sequenceBookedAttribution = attributeSlackBookedCallsToSequences(
    canonical.topSequences,
    bookedAttributionSources,
    smsReplyLinks,
    smsSequenceLookup,
  );
  const topSequences = canonical.topSequences.map((row) => {
    const booked = sequenceBookedAttribution.byLabel.get(row.label);
    return {
      ...row,
      slackBookedCalls: booked?.booked ?? 0,
      slackBookedAfterSmsReply: booked?.bookedAfterSmsReply ?? 0,
      slackBookedJack: booked?.jack ?? 0,
      slackBookedBrandon: booked?.brandon ?? 0,
      slackBookedSelf: booked?.selfBooked ?? 0,
      slackBookedAuditRows: booked?.auditRows ?? [],
    };
  });
  if (!canonical.consistency.totalsBookedMatches) {
    params.logger?.warn('Booked consistency mismatch', {
      bookedCallsTotal: bookedCalls.totals.booked,
      totalsBooked: canonical.totals.booked,
    });
  }
  if (!canonical.consistency.trendBookedMatches) {
    params.logger?.warn('Booked consistency mismatch', {
      bookedCallsTotal: bookedCalls.totals.booked,
      trendBookedSum: canonical.consistency.trendBookedSum,
    });
  }

  return {
    ...summary,
    timeRange: { from: params.from.toISOString(), to: params.to.toISOString() },
    totals: canonical.totals,
    trendByDay: canonical.trendByDay,
    topSequences,
    repLeaderboard: canonical.repLeaderboard,
    bookedCalls: canonical.bookedCalls,
    meta: {
      bookedSource: 'slack' as const,
      timeZone: params.timeZone || DEFAULT_BUSINESS_TIMEZONE,
      legacySignalsAvailable: true,
      sequenceLabelPolicy: 'preserve-exact' as const,
      sequenceBookedAttribution: {
        source: 'slack_booked_calls' as const,
        model: 'sms_phone_match_v2_with_fuzzy_fallback',
        totalCalls: sequenceBookedAttribution.totals.totalCalls,
        matchedCalls: sequenceBookedAttribution.totals.matchedCalls,
        unattributedCalls: sequenceBookedAttribution.totals.unattributedCalls,
        manualCalls: sequenceBookedAttribution.totals.manualCalls,
        strictSmsReplyLinkedCalls: sequenceBookedAttribution.totals.bookedAfterSmsReply,
        smsPhoneMatchedCalls: sequenceBookedAttribution.totals.smsPhoneMatchedCalls,
        fuzzyTextMatchedCalls: sequenceBookedAttribution.totals.fuzzyTextMatchedCalls,
        nonSmsOrUnknownCalls: Math.max(
          0,
          sequenceBookedAttribution.totals.totalCalls - sequenceBookedAttribution.totals.bookedAfterSmsReply,
        ),
        unattributedAuditRows: sequenceBookedAttribution.unattributedAuditRows,
      },
      deprecations: {
        topSequencesBookedAlias: true,
        repLeaderboardBookedAlias: true,
      },
      requestedMode: params.requestedMode,
    },
  };
};

const handleGetSalesMetrics: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);

  const queryParams = {
    from: url.searchParams.get('from') || undefined,
    to: url.searchParams.get('to') || undefined,
    day: url.searchParams.get('day') || undefined,
    range: url.searchParams.get('range') || undefined,
    tz: url.searchParams.get('tz') || undefined,
  };

  const validation = validateQuery(salesMetricsSchema, queryParams);
  if (validation.success === false) {
    sendJson(
      res,
      400,
      { error: 'Invalid query parameters', details: formatValidationErrors(validation.error) },
      origin,
    );
    return;
  }

  let resolved: ReturnType<typeof resolveMetricsRange>;
  try {
    resolved = resolveMetricsRange(validation.data);
  } catch (error) {
    return sendJson(res, 400, { error: error instanceof Error ? error.message : 'Invalid range query' }, origin);
  }

  try {
    const payload = await buildSalesMetricsPayload({
      from: resolved.from,
      to: resolved.to,
      timeZone: resolved.timeZone,
      requestedMode: resolved.mode,
      logger,
    });
    sendJson(res, 200, payload, origin);
  } catch (err) {
    logger?.error('Failed to fetch sales metrics:', err);
    sendJson(
      res,
      500,
      { error: 'Failed to fetch sales metrics', details: err instanceof Error ? err.message : String(err) },
      origin,
    );
  }
};

const handleGetSalesMetricsV2: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  let resolved: ReturnType<typeof resolveMetricsRange>;
  try {
    resolved = resolveMetricsRange({
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      day: url.searchParams.get('day'),
      // Default to '7d' when no range/day/from/to is provided (preserves backward compat)
      range: url.searchParams.get('range') ?? '7d',
      tz: url.searchParams.get('tz'),
    });
  } catch (error) {
    return sendJson(res, 400, { error: error instanceof Error ? error.message : 'Invalid range query' }, origin);
  }

  try {
    const payload = await buildSalesMetricsPayload({
      from: resolved.from,
      to: resolved.to,
      timeZone: resolved.timeZone,
      requestedMode: resolved.mode,
      logger,
    });
    const v2Payload = toSalesMetricsV2(payload);
    sendJson(
      res,
      200,
      toEnvelope({
        data: v2Payload,
        timeZone: resolved.timeZone || DEFAULT_BUSINESS_TIMEZONE,
        requestedMode: resolved.mode,
      }),
      origin,
    );
  } catch (err) {
    logger?.error('Failed to fetch v2 sales metrics:', err);
    sendJson(
      res,
      500,
      { error: 'Failed to fetch v2 sales metrics', details: err instanceof Error ? err.message : String(err) },
      origin,
    );
  }
};

const handleGetSalesMetricsBatchV2: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const rawDays = [
    ...(url.searchParams.get('days') || '')
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
    ...url.searchParams
      .getAll('day')
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  ];

  const uniqueDays = [...new Set(rawDays)].sort((a, b) => a.localeCompare(b));
  if (uniqueDays.length === 0) {
    return sendJson(res, 400, { error: 'Provide at least one day (YYYY-MM-DD) via days or day params' }, origin);
  }
  if (uniqueDays.length > 31) {
    return sendJson(res, 400, { error: 'Batch day limit exceeded (max 31)' }, origin);
  }
  for (const day of uniqueDays) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
      return sendJson(res, 400, { error: `Invalid day format: ${day}` }, origin);
    }
  }

  const tz = (url.searchParams.get('tz') || '').trim();
  try {
    const items = await Promise.all(
      uniqueDays.map(async (day) => {
        const resolved = resolveMetricsRange({
          day,
          tz,
          from: null,
          to: null,
          range: null,
        });
        const payload = await buildSalesMetricsPayload({
          from: resolved.from,
          to: resolved.to,
          timeZone: resolved.timeZone,
          requestedMode: 'day',
          logger,
        });
        return {
          day,
          metrics: toSalesMetricsV2(payload),
        };
      }),
    );

    sendJson(
      res,
      200,
      toEnvelope({
        data: { items },
        timeZone: tz || DEFAULT_BUSINESS_TIMEZONE,
        requestedMode: 'day',
      }),
      origin,
    );
  } catch (error) {
    logger?.error('Failed to fetch v2 sales metrics batch:', error);
    sendJson(
      res,
      500,
      {
        error: 'Failed to fetch v2 sales metrics batch',
        details: error instanceof Error ? error.message : String(error),
      },
      origin,
    );
  }
};

const handleGetStreamToken: RequestHandler = async (req, res, _logger, origin) => {
  const user = getVerifiedSlackUser(req);
  const userId = user.user_id || user.user || 'unknown';
  const ttl = getStreamTokenTtlSeconds();
  let token = '';
  try {
    token = mintStreamToken({ subject: userId, ttlSeconds: ttl });
  } catch (error) {
    _logger?.error('Failed to mint stream token', error);
    sendJson(res, 503, { error: 'Realtime token service is not configured', code: 'stream_token_unavailable' }, origin);
    return;
  }

  sendJson(res, 200, { token, ttlSeconds: ttl }, origin);
};

const handleGetStream: RequestHandler = async (req, res, _logger, origin) => {
  // SSE endpoint for realtime invalidation.
  // Note: we intentionally do not use sendJson here.
  const headers: Record<string, string> = {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  };
  if (origin) {
    headers['Access-Control-Allow-Origin'] = origin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization, X-CSRF-Token, X-Dashboard-Client-Id';
    headers['Access-Control-Allow-Credentials'] = 'true';
  }

  res.writeHead(200, headers);

  const writeEvent = (event: unknown) => {
    res.write('event: message\n');
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  };

  // initial hello
  writeEvent({ type: 'hello', ts: new Date().toISOString() });

  const unsubscribe = subscribeRealtimeEvents((event) => {
    // Map internal event types to frontend event types if needed
    // Currently they match or are compatible
    if (event.type === 'work-item-updated') {
      res.write('event: work-item-updated\n');
      res.write(`data: ${JSON.stringify(event.payload)}\n\n`);
    } else if (event.type === 'work-item-created') {
      res.write('event: work-item-created\n');
      res.write(`data: ${JSON.stringify(event.payload)}\n\n`);
    } else if (event.type === 'runs-updated') {
      res.write('event: runs-updated\n');
      res.write(`data: ${JSON.stringify(event.payload)}\n\n`);
    } else if (event.type === 'metrics-updated') {
      res.write('event: metrics-updated\n');
      res.write('data: {}\n\n');
    } else {
      writeEvent(event);
    }
  });

  const ping = setInterval(() => {
    writeEvent({ type: 'ping', ts: new Date().toISOString() });
  }, 25_000);

  req.on('close', () => {
    clearInterval(ping);
    unsubscribe();
    res.end();
  });
};

const handleGetWorkItems: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);

  const queryParams = {
    type: url.searchParams.get('type') || undefined,
    repId: url.searchParams.get('repId') || undefined,
    severity: url.searchParams.get('severity') || undefined,
    overdueOnly: url.searchParams.get('overdueOnly') === 'true',
    dueBefore: url.searchParams.get('dueBefore') || undefined,
    limit: url.searchParams.get('limit') || undefined,
    offset: url.searchParams.get('offset') || undefined,
    cursor: url.searchParams.get('cursor') || undefined,
  };

  const validation = validateQuery(workItemsQuerySchema, queryParams);
  if (validation.success === false) {
    sendJson(
      res,
      400,
      { error: 'Invalid query parameters', details: formatValidationErrors(validation.error) },
      origin,
    );
    return;
  }

  const { type, repId, severity, overdueOnly, dueBefore, limit, offset, cursor } = validation.data;
  const authUser = getVerifiedSlackUser(req);
  const meRepId = (authUser.user_id || authUser.user || '').trim() || undefined;

  // Decode cursor string to WorkItemCursor object if provided
  let decodedCursor: WorkItemCursor | undefined;
  if (cursor) {
    try {
      decodedCursor = decodeWorkItemCursor(cursor);
    } catch {
      sendJson(res, 400, { error: 'Invalid cursor format' }, origin);
      return;
    }
  }

  const { items, nextCursor: _nextCursor } = await listOpenWorkItems(
    {
      type: type === 'ALL' ? undefined : type,
      repId: repId === 'all' ? undefined : repId === 'me' ? meRepId : repId, // Handle 'me' and 'all'
      severity,
      overdueOnly,
      dueBefore,
      limit,
      offset: decodedCursor ? undefined : offset, // prefer cursor when provided
      cursor: decodedCursor,
    },
    logger,
  );

  // Transform to frontend WorkItem format
  const frontendItems = items.map((item) => ({
    id: item.id,
    type: item.type,
    status: item.resolved_at ? 'resolved' : 'open',
    conversationId: item.conversation_id,
    contactName: item.contact_phone || 'Unknown', // Use phone as name fallback
    repId: item.rep_id,
    repName: item.rep_id ? repDisplayName(item.rep_id) : null,
    createdAt: item.created_at,
    dueAt: item.due_at,
    priority: item.severity === 'med' ? 'medium' : item.severity,
    slaMinutes: null,
    currentLagMinutes: null, // Calculate if needed
    tags: [],
    slackPermalink: undefined, // Add if available
  }));

  sendJson(res, 200, frontendItems, origin);
};

const handleResolveWorkItem: RequestHandler = async (req, res, logger, origin) => {
  const id = req.url?.split('/')[3]; // /api/work-items/:id/resolve
  if (!id) {
    return sendJson(res, 400, { error: 'Missing work item ID' }, origin);
  }

  const success = await resolveWorkItem(id, logger);
  if (!success) {
    return sendJson(res, 404, { error: 'Work item not found or already resolved' }, origin);
  }

  sendJson(res, 200, { success: true }, origin);
};

const handleAssignWorkItem: RequestHandler = async (req, res, logger, origin) => {
  const id = req.url?.split('/')[3]; // /api/work-items/:id/assign
  if (!id) {
    return sendJson(res, 400, { error: 'Missing work item ID' }, origin);
  }

  try {
    const body = (await parseJsonBody(req)) as { repId: string };
    if (!body.repId) {
      return sendJson(res, 400, { error: 'Missing repId' }, origin);
    }

    const success = await assignWorkItem(id, body.repId, logger);
    if (!success) {
      return sendJson(res, 404, { error: 'Work item not found' }, origin);
    }

    sendJson(res, 200, { success: true }, origin);
  } catch (error) {
    sendBodyParseError(res, origin, error);
  }
};

type VerifiedSlackUser = {
  user_id?: string;
  user?: string;
  team_id?: string;
  email?: string;
};

const getVerifiedSlackUser = (req: ApiRequest): VerifiedSlackUser => {
  const user = req.user;
  if (!user || typeof user !== 'object') return {};
  return user as VerifiedSlackUser;
};

const isEmploymentStatus = (value: string): value is 'full_time' | 'part_time' | 'unknown' => {
  return value === 'full_time' || value === 'part_time' || value === 'unknown';
};

const isRevenueMix = (value: string): value is 'mostly_cash' | 'mostly_insurance' | 'balanced' | 'unknown' => {
  return value === 'mostly_cash' || value === 'mostly_insurance' || value === 'balanced' || value === 'unknown';
};

const isCoachingInterest = (value: string): value is 'high' | 'medium' | 'low' | 'unknown' => {
  return value === 'high' || value === 'medium' || value === 'low' || value === 'unknown';
};

const isCadenceStatus = (value: string): value is 'idle' | 'podcast_sent' | 'call_offered' | 'nurture_pool' => {
  return value === 'idle' || value === 'podcast_sent' || value === 'call_offered' || value === 'nurture_pool';
};

const resolveQualificationProgressStep = (params: {
  fullOrPartTime: 'full_time' | 'part_time' | 'unknown';
  niche: string | null;
  revenueMix: 'mostly_cash' | 'mostly_insurance' | 'balanced' | 'unknown';
  coachingInterest: 'high' | 'medium' | 'low' | 'unknown';
}): number => {
  let score = 0;
  if (params.fullOrPartTime !== 'unknown') score += 1;
  if (params.niche && params.niche.trim().length > 0) score += 1;
  if (params.revenueMix !== 'unknown') score += 1;
  if (params.coachingInterest !== 'unknown') score += 1;
  return score;
};

const toInboxConversationV2 = (row: {
  id: string;
  contact_key: string;
  profile_name: string | null;
  contact_phone: string | null;
  profile_phone: string | null;
  current_rep_id: string | null;
  status: 'open' | 'closed' | 'dnc';
  profile_dnc: boolean | null;
  last_inbound_at: string | Date | null;
  last_outbound_at: string | Date | null;
  last_touch_at: string | Date | null;
  unreplied_inbound_count: number;
  open_needs_reply_count: number;
  needs_reply_due_at: string | Date | null;
  last_message_direction: 'inbound' | 'outbound' | 'unknown' | null;
  last_message_body: string | null;
  last_message_at: string | Date | null;
  latest_outbound_user: string | null;
  latest_outbound_line: string | null;
  state_qualification_full_or_part_time: 'full_time' | 'part_time' | 'unknown' | null;
  state_qualification_niche: string | null;
  state_qualification_revenue_mix: 'mostly_cash' | 'mostly_insurance' | 'balanced' | 'unknown' | null;
  state_qualification_coaching_interest: 'high' | 'medium' | 'low' | 'unknown' | null;
  state_qualification_progress_step: number | null;
  state_escalation_level: number | null;
  state_escalation_reason: string | null;
  state_escalation_overridden: boolean | null;
  state_cadence_status: 'idle' | 'podcast_sent' | 'call_offered' | 'nurture_pool' | null;
  state_next_followup_due_at: string | Date | null;
  state_last_podcast_sent_at: string | Date | null;
  state_objection_tags?: string[] | null;
  state_call_outcome?: string | null;
  state_guardrail_override_count?: number | null;
  monday_booked?: boolean | null;
}) => {
  const toIso = (val: string | Date | null) => {
    if (!val) return null;
    if (val instanceof Date) return val.toISOString();
    return val;
  };
  const ownerFromRep = repDisplayName(row.current_rep_id);
  const ownerFromUser = inferOwnerLabelFromHint(row.latest_outbound_user);
  const ownerFromLine = inferOwnerLabelFromHint(row.latest_outbound_line);
  const ownerLabel = ownerFromRep !== 'Unassigned' ? ownerFromRep : ownerFromUser || ownerFromLine || null;
  const ownerSource =
    ownerFromRep !== 'Unassigned'
      ? 'rep'
      : ownerFromUser
        ? 'latest_outbound_user'
        : ownerFromLine
          ? 'latest_outbound_line'
          : 'unknown';

  return {
    id: row.id,
    contactKey: row.contact_key,
    contactName: row.profile_name,
    contactPhone: row.profile_phone || row.contact_phone,
    repId: row.current_rep_id,
    ownerLabel,
    ownerSource,
    status: row.status,
    dnc: row.status === 'dnc' || row.profile_dnc === true,
    lastInboundAt: toIso(row.last_inbound_at),
    lastOutboundAt: toIso(row.last_outbound_at),
    lastTouchAt: toIso(row.last_touch_at),
    unrepliedInboundCount: row.unreplied_inbound_count,
    openNeedsReplyCount: row.open_needs_reply_count,
    needsReplyDueAt: toIso(row.needs_reply_due_at),
    lastMessage: {
      direction: row.last_message_direction,
      body: row.last_message_body,
      createdAt: toIso(row.last_message_at),
    },
    qualification: {
      fullOrPartTime: row.state_qualification_full_or_part_time || 'unknown',
      niche: row.state_qualification_niche || null,
      revenueMix: row.state_qualification_revenue_mix || 'unknown',
      coachingInterest: row.state_qualification_coaching_interest || 'unknown',
      progressStep: row.state_qualification_progress_step || 0,
    },
    escalation: {
      level: (row.state_escalation_level && row.state_escalation_level >= 1 && row.state_escalation_level <= 4
        ? row.state_escalation_level
        : 1) as 1 | 2 | 3 | 4,
      reason: row.state_escalation_reason || null,
      overridden: row.state_escalation_overridden === true,
      cadenceStatus: row.state_cadence_status || 'idle',
      nextFollowupDueAt: toIso(row.state_next_followup_due_at),
      lastPodcastSentAt: toIso(row.state_last_podcast_sent_at),
    },
    objectionTags: row.state_objection_tags || [],
    callOutcome: row.state_call_outcome || null,
    guardrailOverrideCount: row.state_guardrail_override_count || 0,
    mondayBooked: row.monday_booked === true,
  };
};

const toInboxMessageV2 = (row: InboxMessageRow) => ({
  id: row.id,
  conversation_id: row.conversation_id,
  event_ts: row.event_ts instanceof Date ? row.event_ts.toISOString() : row.event_ts,
  direction: row.direction,
  body: row.body,
  sequence: row.sequence,
  line: row.line,
  aloware_user: row.aloware_user,
  slack_channel_id: row.slack_channel_id,
  slack_message_ts: row.slack_message_ts,
});

const getConversationIdFromPath = (req: IncomingMessage): string | null => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);
  // /api/v2/inbox/conversations/:id
  const id = (parts[4] || '').trim();
  if (!id) return null;
  if (!isUuid(id)) {
    return null;
  }
  return id;
};

const parseLineIdInput = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value.trim(), 10);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const normalizeFromInput = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
};

const resolveSlackUserId = (user: VerifiedSlackUser): string | null => {
  const id = (user.user_id || user.user || '').trim();
  return id.length > 0 ? id : null;
};

const resolveDashboardClientId = (req: IncomingMessage): string | null => {
  const rawHeader = req.headers['x-dashboard-client-id'];
  const value = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  const normalized = (value || '').trim();
  if (!normalized) return null;
  if (!/^[a-zA-Z0-9_-]{8,120}$/.test(normalized)) return null;
  return normalized;
};

const resolveInboxActorId = (req: ApiRequest): string | null => {
  const slackUserId = resolveSlackUserId(getVerifiedSlackUser(req));
  if (slackUserId) return slackUserId;

  const dashboardClientId = resolveDashboardClientId(req);
  if (dashboardClientId) return `dashboard:${dashboardClientId}`;

  return null;
};

const resolveSendLineSelection = async (
  params: {
    userId: string | null;
    requestedLineId: number | null;
    requestedFromNumber: string | null;
  },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<{
  lineId: number | null;
  fromNumber: string | null;
  label: string | null;
  key: string | null;
  error: string | null;
}> => {
  const options = listSendLineOptions();

  if (params.requestedLineId != null || params.requestedFromNumber) {
    if (options.length > 0) {
      const selectedOption = findSendLineOption({
        lineId: params.requestedLineId,
        fromNumber: params.requestedFromNumber,
      });
      if (!selectedOption) {
        return {
          lineId: null,
          fromNumber: null,
          label: null,
          key: null,
          error: 'Requested line is not in allowed outbound line catalog.',
        };
      }

      return {
        lineId: selectedOption.lineId,
        fromNumber: selectedOption.fromNumber,
        label: selectedOption.label,
        key: selectedOption.key,
        error: null,
      };
    }

    return {
      lineId: params.requestedLineId,
      fromNumber: params.requestedFromNumber,
      label: null,
      key: null,
      error: null,
    };
  }

  if (params.userId) {
    const preference = await getUserSendPreferences(params.userId, logger);
    if (preference && (preference.default_line_id != null || preference.default_from_number)) {
      if (options.length > 0) {
        const preferredOption = findSendLineOption({
          lineId: preference.default_line_id,
          fromNumber: preference.default_from_number,
        });
        if (preferredOption) {
          return {
            lineId: preferredOption.lineId,
            fromNumber: preferredOption.fromNumber,
            label: preferredOption.label,
            key: preferredOption.key,
            error: null,
          };
        }
      } else {
        return {
          lineId: preference.default_line_id,
          fromNumber: preference.default_from_number,
          label: null,
          key: null,
          error: null,
        };
      }
    }
  }

  if (options.length === 1) {
    return {
      lineId: options[0].lineId,
      fromNumber: options[0].fromNumber,
      label: options[0].label,
      key: options[0].key,
      error: null,
    };
  }

  if (options.length > 1) {
    return {
      lineId: null,
      fromNumber: null,
      label: null,
      key: null,
      error: 'Select a send line or save a default line before sending.',
    };
  }

  return {
    lineId: null,
    fromNumber: null,
    label: null,
    key: null,
    error: null,
  };
};

type SendCapDecision = {
  allowed: boolean;
  reason: string | null;
  retryAfterSeconds: number;
  totals: {
    sentLastHour: number;
    sentLastDay: number;
    conversationSentLastHour: number;
  };
  limits: {
    perHour: number;
    perDay: number;
    perConversationHour: number;
  };
};

const evaluateSendCaps = async (
  conversationId: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SendCapDecision> => {
  const limits = {
    perHour: getSendCapPerHour(),
    perDay: getSendCapPerDay(),
    perConversationHour: getSendCapPerConversationHour(),
  };

  try {
    const totals = await getSendAttemptVolumeCounts(conversationId, logger);

    if (totals.sentLastHour >= limits.perHour) {
      return {
        allowed: false,
        reason: 'Global hourly SMS send cap reached',
        retryAfterSeconds: 60,
        totals,
        limits,
      };
    }
    if (totals.sentLastDay >= limits.perDay) {
      return {
        allowed: false,
        reason: 'Global daily SMS send cap reached',
        retryAfterSeconds: 300,
        totals,
        limits,
      };
    }
    if (totals.conversationSentLastHour >= limits.perConversationHour) {
      return {
        allowed: false,
        reason: 'Conversation hourly SMS send cap reached',
        retryAfterSeconds: 60,
        totals,
        limits,
      };
    }

    return {
      allowed: true,
      reason: null,
      retryAfterSeconds: 1,
      totals,
      limits,
    };
  } catch (error) {
    logger?.error?.('Failed to evaluate send cap guardrails; allowing request', error);
    return {
      allowed: true,
      reason: null,
      retryAfterSeconds: 1,
      totals: { sentLastHour: 0, sentLastDay: 0, conversationSentLastHour: 0 },
      limits,
    };
  }
};

const handleGetInboxSendConfigV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }

  const actorId = resolveInboxActorId(req);
  const options = listSendLineOptions();
  const preference = actorId ? await getUserSendPreferences(actorId, logger) : null;
  const preferredOption =
    preference && (preference.default_line_id != null || preference.default_from_number)
      ? findSendLineOption({
          lineId: preference.default_line_id,
          fromNumber: preference.default_from_number,
        })
      : null;

  const payload = {
    lines: options.map((option) => ({
      key: option.key,
      label: option.label,
      lineId: option.lineId,
      fromNumber: option.fromNumber,
    })),
    defaultSelection: preferredOption
      ? {
          key: preferredOption.key,
          label: preferredOption.label,
          lineId: preferredOption.lineId,
          fromNumber: preferredOption.fromNumber,
        }
      : preference
        ? {
            key:
              preference.default_line_id != null
                ? `line:${preference.default_line_id}`
                : preference.default_from_number
                  ? `from:${preference.default_from_number}`
                  : 'none',
            label: 'Saved Default',
            lineId: preference.default_line_id,
            fromNumber: preference.default_from_number,
          }
        : null,
    requiresSelection: options.length > 1 && !preferredOption,
  };

  sendJson(res, 200, toEnvelope({ data: payload, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handlePostInboxSendDefaultV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }

  const actorId = resolveInboxActorId(req);
  if (!actorId) {
    return sendJson(res, 400, { error: 'Client identity header missing' }, origin);
  }

  let body: {
    lineId?: number | string | null;
    fromNumber?: string | null;
    clear?: boolean;
  } = {};
  try {
    body = (await parseJsonBody(req)) as typeof body;
  } catch (error) {
    sendBodyParseError(res, origin, error);
    return;
  }

  if (body.clear === true) {
    const updated = await upsertUserSendPreferences(
      {
        userId: actorId,
        defaultLineId: null,
        defaultFromNumber: null,
      },
      logger,
    );
    return sendJson(
      res,
      200,
      toEnvelope({
        data: {
          success: true,
          defaultSelection: {
            lineId: updated.default_line_id,
            fromNumber: updated.default_from_number,
          },
        },
        timeZone: DEFAULT_BUSINESS_TIMEZONE,
      }),
      origin,
    );
  }

  const lineId = parseLineIdInput(body.lineId);
  const fromNumber = normalizeFromInput(body.fromNumber);
  const options = listSendLineOptions();

  if (lineId == null && !fromNumber) {
    return sendJson(res, 400, { error: 'Provide lineId or fromNumber, or use clear=true.' }, origin);
  }

  if (options.length > 0) {
    const selectedOption = findSendLineOption({ lineId, fromNumber });
    if (!selectedOption) {
      return sendJson(res, 400, { error: 'Selected default line is not in allowed line catalog.' }, origin);
    }

    const updated = await upsertUserSendPreferences(
      {
        userId: actorId,
        defaultLineId: selectedOption.lineId,
        defaultFromNumber: selectedOption.fromNumber,
      },
      logger,
    );

    return sendJson(
      res,
      200,
      toEnvelope({
        data: {
          success: true,
          defaultSelection: {
            key: selectedOption.key,
            label: selectedOption.label,
            lineId: updated.default_line_id,
            fromNumber: updated.default_from_number,
          },
        },
        timeZone: DEFAULT_BUSINESS_TIMEZONE,
      }),
      origin,
    );
  }

  const updated = await upsertUserSendPreferences(
    {
      userId: actorId,
      defaultLineId: lineId,
      defaultFromNumber: fromNumber,
    },
    logger,
  );

  sendJson(
    res,
    200,
    toEnvelope({
      data: {
        success: true,
        defaultSelection: {
          lineId: updated.default_line_id,
          fromNumber: updated.default_from_number,
        },
      },
      timeZone: DEFAULT_BUSINESS_TIMEZONE,
    }),
    origin,
  );
};

const handleGetInboxConversationsV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }

  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const statusRaw = (url.searchParams.get('status') || '').trim();
  const status =
    statusRaw === 'open' || statusRaw === 'closed' || statusRaw === 'dnc'
      ? (statusRaw as 'open' | 'closed' | 'dnc')
      : undefined;
  const needsReplyOnly = url.searchParams.get('needsReplyOnly') === 'true';
  const search = (url.searchParams.get('search') || '').trim() || undefined;
  const limit = Math.max(1, Math.min(Number.parseInt(url.searchParams.get('limit') || '50', 10) || 50, 200));
  const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') || '0', 10) || 0);

  const authUser = getVerifiedSlackUser(req);
  const repRaw = (url.searchParams.get('repId') || '').trim();
  const repId = repRaw === 'me' ? authUser.user_id || undefined : repRaw || undefined;

  const rows = await listInboxConversations(
    {
      limit,
      offset,
      status,
      repId,
      needsReplyOnly,
      search,
    },
    logger,
  );

  const payload = {
    items: rows.map((row) => toInboxConversationV2(row)),
    pagination: {
      limit,
      offset,
      count: rows.length,
    },
    filters: {
      status: status || null,
      repId: repId || null,
      needsReplyOnly,
      search: search || null,
    },
  };

  sendJson(res, 200, toEnvelope({ data: payload, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handleGetInboxConversationDetailV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }

  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const syncParam = (url.searchParams.get('sync') || '').trim().toLowerCase();
  const forceSyncFromThread = syncParam === '1' || syncParam === 'true' || syncParam === 'force';

  const conversationId = getConversationIdFromPath(req);
  if (!conversationId) {
    return sendJson(res, 400, { error: 'Missing conversation ID' }, origin);
  }

  const conversation = await getInboxConversationById(conversationId, logger);
  if (!conversation) {
    return sendJson(res, 404, { error: 'Conversation not found' }, origin);
  }

  let ensuredState = await ensureConversationState(conversationId, logger);

  let profile = await getInboxContactProfileByKey(conversation.contact_key, logger);
  if (!profile && conversation.contact_phone) {
    profile = await enrichContactProfileFromAloware(
      {
        contactKey: conversation.contact_key,
        conversationId,
        phoneNumber: conversation.contact_phone,
        fallbackName: conversation.profile_name,
        contactId: conversation.contact_id,
      },
      logger,
    );
  }

  let messages = await listMessagesForConversation(conversationId, 250, logger);
  if (messages.length === 0) {
    const legacy = await listSmsEventsForConversation(
      {
        id: conversationId,
        contact_id: conversation.contact_id,
        contact_phone: conversation.contact_phone,
      },
      250,
      logger,
    );
    messages = legacy.map((event) => ({
      id: event.id,
      conversation_id: conversationId,
      event_ts: event.event_ts,
      direction: event.direction,
      body: event.body,
      sequence: null,
      line: null,
      aloware_user: null,
      slack_channel_id: event.slack_channel_id,
      slack_message_ts: event.slack_message_ts,
    }));
    messages.sort((a, b) => {
      const byTime = a.event_ts.getTime() - b.event_ts.getTime();
      if (!Number.isNaN(byTime) && byTime !== 0) return byTime;
      return a.id.localeCompare(b.id);
    });
  }
  const inferredStateResult = await syncQualificationFromConversationText(
    {
      conversationId,
      contactKey: conversation.contact_key,
      contactId: conversation.contact_id,
      triggerDirection: 'inbound',
      allowOverwriteKnown: forceSyncFromThread,
      currentState: ensuredState,
      messages,
    },
    logger,
  );
  ensuredState = inferredStateResult.state || ensuredState;
  const drafts = await listDraftSuggestionsForConversation(conversationId, 20, logger);
  const mondayTrail = await listMondayTrailForContactKey(conversation.contact_key, 10, logger);
  const messageLinkPreviews = await buildMessageLinkPreviews(
    messages.map((msg) => ({ id: msg.id, body: msg.body })),
    logger,
  );

  const mergedRow = {
    ...conversation,
    state_qualification_full_or_part_time: ensuredState.qualification_full_or_part_time,
    state_qualification_niche: ensuredState.qualification_niche,
    state_qualification_revenue_mix: ensuredState.qualification_revenue_mix,
    state_qualification_coaching_interest: ensuredState.qualification_coaching_interest,
    state_qualification_progress_step: ensuredState.qualification_progress_step,
    state_escalation_level: ensuredState.escalation_level,
    state_escalation_reason: ensuredState.escalation_reason,
    state_escalation_overridden: ensuredState.escalation_overridden,
    state_last_podcast_sent_at: ensuredState.last_podcast_sent_at,
    state_cadence_status: ensuredState.cadence_status,
    state_next_followup_due_at: ensuredState.next_followup_due_at,
    state_objection_tags: ensuredState.objection_tags ?? conversation.state_objection_tags ?? [],
    state_call_outcome: ensuredState.call_outcome ?? conversation.state_call_outcome ?? null,
    state_guardrail_override_count:
      ensuredState.guardrail_override_count ?? conversation.state_guardrail_override_count ?? 0,
  };

  const contactTags = Array.isArray(profile?.tags)
    ? profile.tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
    : [];

  const payload = {
    conversation: toInboxConversationV2(mergedRow),
    contactCard: {
      contactKey: conversation.contact_key,
      contactId: profile?.contact_id || conversation.contact_id,
      alowareContactId: profile?.aloware_contact_id || null,
      name: profile?.name || conversation.profile_name || null,
      phone: profile?.phone || conversation.profile_phone || conversation.contact_phone || null,
      email: profile?.email || conversation.profile_email || null,
      timezone: profile?.timezone || conversation.profile_timezone || null,
      niche: profile?.niche || conversation.profile_niche || ensuredState.qualification_niche || null,
      dnc: conversation.status === 'dnc' || profile?.dnc === true,
      leadSource: profile?.lead_source || null,
      sequenceId: profile?.sequence_id || null,
      dispositionStatusId: profile?.disposition_status_id || null,
      tags: contactTags,
      textAuthorized: profile?.text_authorized ?? null,
      isBlocked: profile?.is_blocked ?? null,
      cnamCity: profile?.cnam_city || null,
      cnamState: profile?.cnam_state || null,
      cnamCountry: profile?.cnam_country || null,
      lrnLineType: profile?.lrn_line_type || null,
      lrnCarrier: profile?.lrn_carrier || null,
      lrnLastCheckedAt: profile?.lrn_last_checked_at || null,
      lastEngagementAt: profile?.last_engagement_at || null,
      unreadCount: profile?.unread_count ?? null,
      inboundSmsCount: profile?.inbound_sms_count ?? null,
      outboundSmsCount: profile?.outbound_sms_count ?? null,
      inboundCallCount: profile?.inbound_call_count ?? null,
      outboundCallCount: profile?.outbound_call_count ?? null,
    },
    messages: messages.map((msg) => ({
      id: msg.id,
      conversationId: msg.conversation_id,
      direction: msg.direction,
      body: msg.body,
      sequence: msg.sequence,
      line: msg.line,
      alowareUser: msg.aloware_user,
      createdAt: msg.event_ts,
      slackChannelId: msg.slack_channel_id,
      slackMessageTs: msg.slack_message_ts,
      linkPreviews: messageLinkPreviews.get(msg.id) || [],
    })),
    drafts: drafts.map((draft) => ({
      id: draft.id,
      text: draft.generated_text,
      lintScore: draft.lint_score,
      structuralScore: draft.structural_score,
      accepted: draft.accepted,
      edited: draft.edited,
      createdAt: draft.created_at,
    })),
    mondayTrail,
  };

  sendJson(res, 200, toEnvelope({ data: payload, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handlePostInboxDraftV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }
  if (!isDraftEngineEnabled()) {
    return sendJson(res, 403, { error: 'Draft engine is disabled' }, origin);
  }

  const conversationId = getConversationIdFromPath(req);
  if (!conversationId) {
    return sendJson(res, 400, { error: 'Missing conversation ID' }, origin);
  }

  const conversation = await getInboxConversationById(conversationId, logger);
  if (!conversation) {
    return sendJson(res, 404, { error: 'Conversation not found' }, origin);
  }

  let body: { bookedCallLabel?: string } = {};
  try {
    body = (await parseJsonBody(req)) as { bookedCallLabel?: string };
  } catch (error) {
    sendBodyParseError(res, origin, error);
    return;
  }

  let state = await ensureConversationState(conversationId, logger);
  let messages = await listMessagesForConversation(conversationId, 250, logger);
  if (messages.length === 0) {
    const legacy = await listSmsEventsForConversation(
      {
        id: conversationId,
        contact_id: conversation.contact_id,
        contact_phone: conversation.contact_phone,
      },
      250,
      logger,
    );
    messages = legacy.map((event) => ({
      id: event.id,
      conversation_id: conversationId,
      event_ts: event.event_ts,
      direction: event.direction,
      body: event.body,
      sequence: null,
      line: null,
      aloware_user: null,
      slack_channel_id: event.slack_channel_id,
      slack_message_ts: event.slack_message_ts,
    }));
    messages.sort((a, b) => {
      const byTime = a.event_ts.getTime() - b.event_ts.getTime();
      if (!Number.isNaN(byTime) && byTime !== 0) return byTime;
      return a.id.localeCompare(b.id);
    });
  }
  const draftInferenceStateResult = await syncQualificationFromConversationText(
    {
      conversationId,
      contactKey: conversation.contact_key,
      contactId: conversation.contact_id,
      triggerDirection: 'inbound',
      currentState: state,
      messages,
    },
    logger,
  );
  state = draftInferenceStateResult.state || state;
  const ownerLabel = toInboxConversationV2(conversation).ownerLabel || null;

  const draft = await generateDraftSuggestion(
    {
      conversationId,
      messages,
      state,
      bookedCallLabel: body.bookedCallLabel,
      contact: {
        name: conversation.profile_name,
        phone: conversation.profile_phone || conversation.contact_phone,
        timezone: conversation.profile_timezone,
        ownerLabel,
        profileNiche: conversation.profile_niche,
      },
    },
    logger,
  );

  const storedDraft = await insertDraftSuggestion(
    {
      conversationId,
      promptSnapshotHash: draft.promptSnapshotHash,
      retrievedExemplarIds: draft.retrievedExamples.map((example) => example.id),
      generatedText: draft.text,
      lintScore: draft.lint.score,
      structuralScore: draft.lint.structuralScore,
      lintIssues: draft.lint.issues.map((issue) => issue.code),
      raw: {
        attempts: draft.attempts,
        escalationReason: draft.escalationReason,
        generationMode: draft.generationMode,
        generationWarnings: draft.generationWarnings,
        genericToneDetected: draft.genericToneDetected,
        styleAnchorCount: draft.styleAnchors.length,
        styleAnchorUsers: draft.styleAnchors
          .map((anchor) => anchor.aloware_user || '')
          .filter((value) => value.length > 0)
          .slice(0, 5),
      },
    },
    logger,
  );

  if (!state.escalation_overridden) {
    await updateConversationState(
      conversationId,
      {
        escalationLevel: draft.escalationLevel,
        escalationReason: draft.escalationReason,
      },
      logger,
    );
  }

  const payload = {
    id: storedDraft.id,
    conversationId,
    text: storedDraft.generated_text,
    lint: {
      passed: draft.lint.passed,
      score: draft.lint.score,
      structuralScore: draft.lint.structuralScore,
      issues: draft.lint.issues,
    },
    escalation: {
      level: draft.escalationLevel,
      reason: draft.escalationReason,
    },
    qualification: {
      step: draft.qualificationStep,
      missing: draft.qualificationMissing,
    },
    attempts: draft.attempts,
    generationMode: draft.generationMode,
    generationWarnings: draft.generationWarnings,
    createdAt: storedDraft.created_at,
  };

  sendJson(res, 200, toEnvelope({ data: payload, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handlePostInboxCrmNotesV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }

  const conversationId = getConversationIdFromPath(req);
  if (!conversationId) {
    return sendJson(res, 400, { error: 'Missing conversation ID' }, origin);
  }

  const conversation = await getInboxConversationById(conversationId, logger);
  if (!conversation) {
    return sendJson(res, 404, { error: 'Conversation not found' }, origin);
  }

  const profile = await getInboxContactProfileByKey(conversation.contact_key, logger);
  const ownerLabel = toInboxConversationV2(conversation).ownerLabel || null;

  let messages: InboxMessageRow[] = [];
  try {
    const rawMessages = await listMessagesForConversation(conversationId, 250, logger);
    messages = rawMessages;
  } catch (error) {
    logger?.warn?.('CRM notes: failed to load v2 message rows; falling back to legacy events', {
      conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  if (messages.length === 0) {
    try {
      const legacy = await listSmsEventsForConversation(
        {
          id: conversationId,
          contact_id: conversation.contact_id,
          contact_phone: conversation.contact_phone,
        },
        250,
        logger,
      );
      messages = legacy.map((event) => {
        const eventTs = event.event_ts instanceof Date ? event.event_ts : new Date(event.event_ts);
        return {
          id: event.id,
          conversation_id: conversationId,
          event_ts: eventTs,
          direction: event.direction,
          body: event.body,
          sequence: null,
          line: null,
          aloware_user: null,
          slack_channel_id: event.slack_channel_id,
          slack_message_ts: event.slack_message_ts,
        };
      });
      messages.sort((a, b) => {
        const aTime = a.event_ts.getTime();
        const bTime = b.event_ts.getTime();
        const byTime = aTime - bTime;
        if (!Number.isNaN(byTime) && byTime !== 0) return byTime;
        return a.id.localeCompare(b.id);
      });
    } catch (error) {
      logger?.warn?.('CRM notes: failed to load legacy sms_events; proceeding with empty transcript', {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  let mondayTrail = [] as Awaited<ReturnType<typeof listMondayTrailForContactKey>>;
  try {
    mondayTrail = await listMondayTrailForContactKey(conversation.contact_key, 10, logger);
  } catch (error) {
    logger?.warn?.('CRM notes: failed to load monday trail; continuing without monday context', {
      conversationId,
      contactKey: conversation.contact_key,
      error: error instanceof Error ? error.message : String(error),
    });
  }

  const result = await generateCrmNotesSuggestion(
    {
      conversationId,
      contactName: profile?.name || conversation.profile_name || null,
      contactPhone: profile?.phone || conversation.profile_phone || conversation.contact_phone || null,
      contactEmail: profile?.email || conversation.profile_email || null,
      leadSource: profile?.lead_source || null,
      timezone: profile?.timezone || conversation.profile_timezone || null,
      ownerLabel,
      mondayTrail,
      messages,
    },
    logger,
  );

  sendJson(res, 200, toEnvelope({ data: result, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handlePostInboxSendV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }
  if (!isAlowareSendEnabled()) {
    return sendJson(res, 403, { error: 'Outbound send is disabled' }, origin);
  }

  const conversationId = getConversationIdFromPath(req);
  if (!conversationId) {
    return sendJson(res, 400, { error: 'Missing conversation ID' }, origin);
  }

  const conversation = await getConversationById(conversationId, logger);
  if (!conversation) {
    return sendJson(res, 404, { error: 'Conversation not found' }, origin);
  }

  let body: {
    body?: string;
    idempotencyKey?: string;
    lineId?: number | string | null;
    fromNumber?: string;
    senderIdentity?: string;
    draftId?: string;
    setterAssist?: {
      chipLabel?: string;
      intent?: string;
    } | null;
  } = {};
  try {
    body = (await parseJsonBody(req)) as typeof body;
  } catch (error) {
    sendBodyParseError(res, origin, error);
    return;
  }

  const messageBody = (body.body || '').trim();
  if (!messageBody) {
    return sendJson(res, 400, { error: 'Missing message body' }, origin);
  }
  const setterAssist =
    body.setterAssist &&
    typeof body.setterAssist.chipLabel === 'string' &&
    body.setterAssist.chipLabel.trim().length > 0 &&
    typeof body.setterAssist.intent === 'string' &&
    body.setterAssist.intent.trim().length > 0
      ? {
          chipLabel: body.setterAssist.chipLabel.trim().slice(0, 120),
          intent: body.setterAssist.intent.trim().slice(0, 60),
        }
      : null;

  if (body.draftId && isStrictLintEnabled()) {
    const linkedDraft = await getDraftSuggestionById(body.draftId, logger);
    if (linkedDraft) {
      const unchangedFromDraft = linkedDraft.generated_text.trim() === messageBody;
      const lintFailed = linkedDraft.lint_score < 80;
      if (unchangedFromDraft && lintFailed) {
        return sendJson(res, 400, { error: 'Draft failed strict lint. Edit the message before sending.' }, origin);
      }
    }
  }

  const profile = await getInboxContactProfileByKey(conversation.contact_key, logger);
  const authUser = getVerifiedSlackUser(req);
  const requestedLineId = parseLineIdInput(body.lineId);
  const requestedFromNumber = normalizeFromInput(body.fromNumber);
  const sendLineSelection = await resolveSendLineSelection(
    {
      userId: resolveSlackUserId(authUser),
      requestedLineId,
      requestedFromNumber,
    },
    logger,
  );

  if (sendLineSelection.error) {
    return sendJson(res, 400, { error: sendLineSelection.error }, origin);
  }

  const sendCaps = await evaluateSendCaps(conversationId, logger);
  if (!sendCaps.allowed) {
    const blockedAttempt = await insertSendAttempt(
      {
        conversationId,
        messageBody,
        senderIdentity: body.senderIdentity || authUser.user_id || authUser.user || null,
        lineId: sendLineSelection.lineId != null ? String(sendLineSelection.lineId) : null,
        fromNumber: sendLineSelection.fromNumber ?? null,
        allowlistDecision: true,
        dncDecision: conversation.status === 'dnc' || profile?.dnc === true,
        idempotencyKey: body.idempotencyKey || null,
        status: 'blocked',
        requestPayload: {
          sendCaps: sendCaps.limits,
          currentVolume: sendCaps.totals,
          setterAssist,
        },
        responsePayload: null,
        errorMessage: sendCaps.reason || 'SMS send cap reached',
      },
      logger,
    );

    return sendJson(
      res,
      429,
      toEnvelope({
        data: {
          status: 'blocked',
          reason: sendCaps.reason || 'SMS send cap reached',
          sendAttemptId: blockedAttempt.id,
          outboundEventId: null,
          lineSelection: {
            key: sendLineSelection.key,
            label: sendLineSelection.label,
            lineId: sendLineSelection.lineId,
            fromNumber: sendLineSelection.fromNumber,
          },
        },
        timeZone: DEFAULT_BUSINESS_TIMEZONE,
      }),
      origin,
      { 'Retry-After': String(sendCaps.retryAfterSeconds) },
    );
  }

  const result = await sendInboxMessage(
    {
      conversation,
      profile,
      body: messageBody,
      lineId: sendLineSelection.lineId,
      fromNumber: sendLineSelection.fromNumber,
      senderUserId: authUser.user_id || authUser.user || null,
      senderEmail: authUser.email || null,
      senderIdentity: body.senderIdentity || null,
      idempotencyKey: body.idempotencyKey || null,
      setterAssist,
    },
    logger,
  );

  if (body.draftId && result.outboundEvent?.id) {
    await updateDraftSuggestionFeedback(
      body.draftId,
      {
        accepted: true,
        sendLinkedEventId: result.outboundEvent.id,
      },
      logger,
    );
  }

  const payload = {
    status: result.status,
    reason: result.reason,
    sendAttemptId: result.sendAttempt.id,
    outboundEventId: result.outboundEvent?.id || null,
    lineSelection: {
      key: sendLineSelection.key,
      label: sendLineSelection.label,
      lineId: sendLineSelection.lineId,
      fromNumber: sendLineSelection.fromNumber,
    },
  };

  sendJson(res, 200, toEnvelope({ data: payload, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handlePostInboxQualificationV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }

  const conversationId = getConversationIdFromPath(req);
  if (!conversationId) {
    return sendJson(res, 400, { error: 'Missing conversation ID' }, origin);
  }

  const conversation = await getConversationById(conversationId, logger);
  if (!conversation) {
    return sendJson(res, 404, { error: 'Conversation not found' }, origin);
  }

  let body: {
    fullOrPartTime?: string;
    niche?: string | null;
    revenueMix?: string;
    coachingInterest?: string;
  } = {};
  try {
    body = (await parseJsonBody(req)) as typeof body;
  } catch (error) {
    sendBodyParseError(res, origin, error);
    return;
  }

  const currentState = await ensureConversationState(conversationId, logger);
  const fullOrPartTime: 'full_time' | 'part_time' | 'unknown' = isEmploymentStatus(body.fullOrPartTime || '')
    ? ((body.fullOrPartTime || 'unknown') as 'full_time' | 'part_time' | 'unknown')
    : currentState.qualification_full_or_part_time;
  const niche = typeof body.niche === 'string' ? body.niche.trim() : currentState.qualification_niche;
  const revenueMix: 'mostly_cash' | 'mostly_insurance' | 'balanced' | 'unknown' = isRevenueMix(body.revenueMix || '')
    ? ((body.revenueMix || 'unknown') as 'mostly_cash' | 'mostly_insurance' | 'balanced' | 'unknown')
    : currentState.qualification_revenue_mix;
  const coachingInterest: 'high' | 'medium' | 'low' | 'unknown' = isCoachingInterest(body.coachingInterest || '')
    ? ((body.coachingInterest || 'unknown') as 'high' | 'medium' | 'low' | 'unknown')
    : currentState.qualification_coaching_interest;

  const progressStep = resolveQualificationProgressStep({
    fullOrPartTime,
    niche,
    revenueMix,
    coachingInterest,
  });

  const nextState = await updateConversationState(
    conversationId,
    {
      fullOrPartTime,
      niche,
      revenueMix,
      coachingInterest,
      progressStep,
    },
    logger,
  );

  await upsertInboxContactProfile(
    {
      contactKey: conversation.contact_key,
      conversationId,
      contactId: conversation.contact_id,
      niche,
      employmentStatus: fullOrPartTime,
      revenueMixCategory: revenueMix,
      coachingInterest,
    },
    logger,
  );

  const profileForSync = await getInboxContactProfileByKey(conversation.contact_key, logger);
  let alowareQualificationSync: { status: 'synced' | 'skipped'; reason: string } | null = null;
  try {
    alowareQualificationSync = await syncQualificationToAloware(
      {
        contactPhone: conversation.contact_phone,
        profile: profileForSync,
        fullOrPartTime,
        niche,
        revenueMix,
        coachingInterest,
      },
      logger,
    );
  } catch (error) {
    logger?.warn?.('Failed to sync qualification update to Aloware contact', error);
    alowareQualificationSync = { status: 'skipped', reason: 'sync_error' };
  }

  const payload = {
    fullOrPartTime: nextState.qualification_full_or_part_time,
    niche: nextState.qualification_niche,
    revenueMix: nextState.qualification_revenue_mix,
    coachingInterest: nextState.qualification_coaching_interest,
    progressStep: nextState.qualification_progress_step,
    alowareSync: alowareQualificationSync,
  };

  sendJson(res, 200, toEnvelope({ data: payload, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handlePostInboxEscalationOverrideV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }

  const conversationId = getConversationIdFromPath(req);
  if (!conversationId) {
    return sendJson(res, 400, { error: 'Missing conversation ID' }, origin);
  }

  const conversation = await getConversationById(conversationId, logger);
  if (!conversation) {
    return sendJson(res, 404, { error: 'Conversation not found' }, origin);
  }

  let body: {
    level?: number;
    reason?: string | null;
    cadenceStatus?: string;
    nextFollowupDueAt?: string | null;
    lastPodcastSentAt?: string | null;
  } = {};
  try {
    body = (await parseJsonBody(req)) as typeof body;
  } catch (error) {
    sendBodyParseError(res, origin, error);
    return;
  }

  if (!body.level || body.level < 1 || body.level > 4) {
    return sendJson(res, 400, { error: 'level must be between 1 and 4' }, origin);
  }

  const cadenceStatus = body.cadenceStatus && isCadenceStatus(body.cadenceStatus) ? body.cadenceStatus : undefined;

  const nextState = await updateConversationState(
    conversationId,
    {
      escalationLevel: body.level as 1 | 2 | 3 | 4,
      escalationReason: typeof body.reason === 'string' ? body.reason : body.reason === null ? null : undefined,
      escalationOverridden: true,
      cadenceStatus,
      nextFollowupDueAt: typeof body.nextFollowupDueAt === 'string' ? body.nextFollowupDueAt : undefined,
      lastPodcastSentAt: typeof body.lastPodcastSentAt === 'string' ? body.lastPodcastSentAt : undefined,
    },
    logger,
  );

  const payload = {
    level: nextState.escalation_level,
    reason: nextState.escalation_reason,
    overridden: nextState.escalation_overridden,
    cadenceStatus: nextState.cadence_status,
    nextFollowupDueAt: nextState.next_followup_due_at,
    lastPodcastSentAt: nextState.last_podcast_sent_at,
  };

  sendJson(res, 200, toEnvelope({ data: payload, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handlePostInboxStatusV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }

  const conversationId = getConversationIdFromPath(req);
  if (!conversationId) {
    return sendJson(res, 400, { error: 'Missing conversation ID' }, origin);
  }

  let body: { status?: string } = {};
  try {
    body = (await parseJsonBody(req)) as { status?: string };
  } catch (error) {
    sendBodyParseError(res, origin, error);
    return;
  }

  const status = body.status;
  if (status !== 'open' && status !== 'closed' && status !== 'dnc') {
    return sendJson(res, 400, { error: 'status must be one of: open, closed, dnc' }, origin);
  }

  const conversation = await getConversationById(conversationId, logger);
  if (!conversation) {
    return sendJson(res, 404, { error: 'Conversation not found' }, origin);
  }

  const updated = await updateConversationStatus(conversationId, status, logger);
  if (!updated) {
    return sendJson(res, 404, { error: 'Conversation not found' }, origin);
  }

  let alowareSequenceSync: { status: 'synced' | 'skipped'; reason: string } | null = null;
  if (status === 'dnc') {
    const profile = await getInboxContactProfileByKey(conversation.contact_key, logger);
    try {
      alowareSequenceSync = await disenrollConversationContactFromSequence(
        {
          contactPhone: conversation.contact_phone,
          contactId: conversation.contact_id,
          alowareContactId: profile?.aloware_contact_id || null,
        },
        logger,
      );
    } catch (error) {
      logger?.warn?.('Failed to auto-disenroll Aloware sequence on DNC status update', error);
      alowareSequenceSync = { status: 'skipped', reason: 'sync_error' };
    }
  }

  sendJson(
    res,
    200,
    toEnvelope({
      data: { id: updated.id, status: updated.status, alowareSequenceSync },
      timeZone: DEFAULT_BUSINESS_TIMEZONE,
    }),
    origin,
  );
};

const handlePostInboxSequenceEnrollV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }

  const conversationId = getConversationIdFromPath(req);
  if (!conversationId) {
    return sendJson(res, 400, { error: 'Missing conversation ID' }, origin);
  }

  const conversation = await getConversationById(conversationId, logger);
  if (!conversation) {
    return sendJson(res, 404, { error: 'Conversation not found' }, origin);
  }

  let body: { sequenceId?: unknown; forceEnroll?: unknown } = {};
  try {
    body = (await parseJsonBody(req)) as typeof body;
  } catch (error) {
    sendBodyParseError(res, origin, error);
    return;
  }

  const sequenceIdRaw = body.sequenceId;
  const sequenceId =
    typeof sequenceIdRaw === 'number'
      ? sequenceIdRaw
      : typeof sequenceIdRaw === 'string' && sequenceIdRaw.trim().length > 0
        ? sequenceIdRaw.trim()
        : null;
  if (sequenceId === null) {
    return sendJson(res, 400, { error: 'sequenceId is required' }, origin);
  }

  const profile = await getInboxContactProfileByKey(conversation.contact_key, logger);

  try {
    const result = await enrollConversationContactToSequence(
      {
        sequenceId,
        forceEnroll: body.forceEnroll === true,
        contactPhone: conversation.contact_phone,
        contactId: conversation.contact_id,
        alowareContactId: profile?.aloware_contact_id || null,
      },
      logger,
    );
    sendJson(
      res,
      200,
      toEnvelope({
        data: {
          conversationId,
          sequenceId,
          alowareSequenceSync: result,
        },
        timeZone: DEFAULT_BUSINESS_TIMEZONE,
      }),
      origin,
    );
  } catch (error) {
    logger?.warn?.('Failed to enroll conversation contact into Aloware sequence', error);
    sendJson(res, 502, { error: 'Aloware sequence enroll failed' }, origin);
  }
};

const handlePostInboxSequenceDisenrollV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }

  const conversationId = getConversationIdFromPath(req);
  if (!conversationId) {
    return sendJson(res, 400, { error: 'Missing conversation ID' }, origin);
  }

  const conversation = await getConversationById(conversationId, logger);
  if (!conversation) {
    return sendJson(res, 404, { error: 'Conversation not found' }, origin);
  }

  const profile = await getInboxContactProfileByKey(conversation.contact_key, logger);
  try {
    const result = await disenrollConversationContactFromSequence(
      {
        contactPhone: conversation.contact_phone,
        contactId: conversation.contact_id,
        alowareContactId: profile?.aloware_contact_id || null,
      },
      logger,
    );
    sendJson(
      res,
      200,
      toEnvelope({
        data: {
          conversationId,
          alowareSequenceSync: result,
        },
        timeZone: DEFAULT_BUSINESS_TIMEZONE,
      }),
      origin,
    );
  } catch (error) {
    logger?.warn?.('Failed to disenroll conversation contact from Aloware sequence', error);
    sendJson(res, 502, { error: 'Aloware sequence disenroll failed' }, origin);
  }
};

const handlePostInboxDraftFeedbackV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }

  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);
  const draftId = parts[4];
  if (!draftId) {
    return sendJson(res, 400, { error: 'Missing draft ID' }, origin);
  }

  let body: {
    accepted?: boolean;
    edited?: boolean;
    sendLinkedEventId?: string;
    sourceOutboundEventId?: string;
    bookedCallLabel?: string;
    closedWonLabel?: string;
    escalationLevel?: number;
    structureSignature?: string;
    qualifierSnapshot?: unknown;
  } = {};
  try {
    body = (await parseJsonBody(req)) as typeof body;
  } catch (error) {
    sendBodyParseError(res, origin, error);
    return;
  }

  const updatedDraft = await updateDraftSuggestionFeedback(
    draftId,
    {
      accepted: typeof body.accepted === 'boolean' ? body.accepted : undefined,
      edited: typeof body.edited === 'boolean' ? body.edited : undefined,
      sendLinkedEventId: body.sendLinkedEventId || undefined,
    },
    logger,
  );

  if (!updatedDraft) {
    return sendJson(res, 404, { error: 'Draft not found' }, origin);
  }

  const sourceOutboundEventId =
    body.sourceOutboundEventId || body.sendLinkedEventId || updatedDraft.send_linked_event_id;
  if (
    sourceOutboundEventId &&
    (body.bookedCallLabel || body.closedWonLabel || body.structureSignature || body.escalationLevel)
  ) {
    await upsertConversionExample(
      {
        sourceOutboundEventId,
        bookedCallLabel: body.bookedCallLabel || null,
        closedWonLabel: body.closedWonLabel || null,
        escalationLevel:
          body.escalationLevel && body.escalationLevel >= 1 && body.escalationLevel <= 4
            ? (body.escalationLevel as 1 | 2 | 3 | 4)
            : 1,
        structureSignature: body.structureSignature || null,
        qualifierSnapshot: body.qualifierSnapshot ?? null,
        channelMarker: 'sms',
      },
      logger,
    );
  }

  sendJson(
    res,
    200,
    toEnvelope({
      data: {
        success: true,
        draft: {
          id: updatedDraft.id,
          accepted: updatedDraft.accepted,
          edited: updatedDraft.edited,
          sendLinkedEventId: updatedDraft.send_linked_event_id,
          updatedAt: updatedDraft.updated_at,
        },
      },
      timeZone: DEFAULT_BUSINESS_TIMEZONE,
    }),
    origin,
  );
};

// ── Phase 2: Notes ───────────────────────────────────────────────────────────

const handleGetInboxNotesV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }
  const conversationId = getConversationIdFromPath(req);
  if (!conversationId) {
    return sendJson(res, 400, { error: 'Missing conversation ID' }, origin);
  }
  const notes = await listConversationNotes(conversationId, logger);
  sendJson(
    res,
    200,
    toEnvelope({
      data: { notes: notes.map((n) => ({ id: n.id, author: n.author, text: n.text, createdAt: n.created_at })) },
      timeZone: DEFAULT_BUSINESS_TIMEZONE,
    }),
    origin,
  );
};

const handlePostInboxNoteV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }
  const conversationId = getConversationIdFromPath(req);
  if (!conversationId) {
    return sendJson(res, 400, { error: 'Missing conversation ID' }, origin);
  }
  let body: { author?: string; text?: string } = {};
  try {
    body = (await parseJsonBody(req)) as typeof body;
  } catch (error) {
    sendBodyParseError(res, origin, error);
    return;
  }
  if (!body.author || !body.text?.trim()) {
    return sendJson(res, 400, { error: 'author and text are required' }, origin);
  }
  const note = await insertConversationNote(conversationId, body.author, body.text.trim(), logger);
  sendJson(
    res,
    201,
    toEnvelope({
      data: { id: note.id, author: note.author, text: note.text, createdAt: note.created_at },
      timeZone: DEFAULT_BUSINESS_TIMEZONE,
    }),
    origin,
  );
};

// ── Phase 2: Snooze ───────────────────────────────────────────────────────────

const handlePostInboxSnoozeV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }
  const conversationId = getConversationIdFromPath(req);
  if (!conversationId) {
    return sendJson(res, 400, { error: 'Missing conversation ID' }, origin);
  }
  let body: { snoozedUntil?: string | null } = {};
  try {
    body = (await parseJsonBody(req)) as typeof body;
  } catch (error) {
    sendBodyParseError(res, origin, error);
    return;
  }
  const snoozedUntil = body.snoozedUntil ?? null;
  if (snoozedUntil !== null && Number.isNaN(new Date(snoozedUntil).getTime())) {
    return sendJson(res, 400, { error: 'snoozedUntil must be a valid ISO timestamp or null' }, origin);
  }
  const updated = await snoozeConversation(conversationId, snoozedUntil, logger);
  if (!updated) {
    return sendJson(res, 404, { error: 'Conversation not found' }, origin);
  }
  sendJson(
    res,
    200,
    toEnvelope({
      data: { id: updated.id, nextFollowupDueAt: updated.next_followup_due_at },
      timeZone: DEFAULT_BUSINESS_TIMEZONE,
    }),
    origin,
  );
};

// ── Phase 2: Assign ───────────────────────────────────────────────────────────

const handlePostInboxAssignV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }
  const conversationId = getConversationIdFromPath(req);
  if (!conversationId) {
    return sendJson(res, 400, { error: 'Missing conversation ID' }, origin);
  }
  let body: { ownerLabel?: string | null } = {};
  try {
    body = (await parseJsonBody(req)) as typeof body;
  } catch (error) {
    sendBodyParseError(res, origin, error);
    return;
  }
  const updated = await assignConversation(conversationId, body.ownerLabel ?? null, logger);
  if (!updated) {
    return sendJson(res, 404, { error: 'Conversation not found' }, origin);
  }
  sendJson(
    res,
    200,
    toEnvelope({
      data: { id: updated.id, ownerLabel: updated.owner_label },
      timeZone: DEFAULT_BUSINESS_TIMEZONE,
    }),
    origin,
  );
};

// ── Phase 2: Templates ────────────────────────────────────────────────────────

const handleGetInboxTemplatesV2: RequestHandler = async (_req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }
  const templates = await listMessageTemplates(logger);
  sendJson(
    res,
    200,
    toEnvelope({
      data: {
        templates: templates.map((t) => ({
          id: t.id,
          name: t.name,
          body: t.body,
          createdBy: t.created_by,
          createdAt: t.created_at,
          updatedAt: t.updated_at,
        })),
      },
      timeZone: DEFAULT_BUSINESS_TIMEZONE,
    }),
    origin,
  );
};

const handlePostInboxTemplateV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }
  let body: { name?: string; body?: string; createdBy?: string } = {};
  try {
    body = (await parseJsonBody(req)) as typeof body;
  } catch (error) {
    sendBodyParseError(res, origin, error);
    return;
  }
  if (!body.name?.trim() || !body.body?.trim()) {
    return sendJson(res, 400, { error: 'name and body are required' }, origin);
  }
  const template = await insertMessageTemplate(
    body.name.trim(),
    body.body.trim(),
    body.createdBy?.trim() ?? 'unknown',
    logger,
  );
  sendJson(
    res,
    201,
    toEnvelope({
      data: {
        id: template.id,
        name: template.name,
        body: template.body,
        createdBy: template.created_by,
        createdAt: template.created_at,
      },
      timeZone: DEFAULT_BUSINESS_TIMEZONE,
    }),
    origin,
  );
};

// ─── Phase 3: Objection Tags ──────────────────────────────────────────────────

const handlePostObjectionTagsV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }
  const conversationId = getConversationIdFromPath(req);
  if (!conversationId) {
    return sendJson(res, 400, { error: 'Missing conversation ID' }, origin);
  }
  let body: { tags?: unknown } = {};
  try {
    body = (await parseJsonBody(req)) as typeof body;
  } catch (error) {
    sendBodyParseError(res, origin, error);
    return;
  }
  const { tags } = body;
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) {
    return sendJson(res, 400, { error: 'tags must be an array of strings' }, origin);
  }
  try {
    const result = await updateObjectionTags(conversationId, tags as string[], logger);
    sendJson(
      res,
      200,
      toEnvelope({
        data: { conversationId: result.conversation_id, objectionTags: result.objection_tags },
        timeZone: DEFAULT_BUSINESS_TIMEZONE,
      }),
      origin,
    );
  } catch {
    return sendJson(res, 404, { error: 'Conversation not found' }, origin);
  }
};

// ─── Phase 3: Call Outcome ────────────────────────────────────────────────────

const handlePostCallOutcomeV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }
  const conversationId = getConversationIdFromPath(req);
  if (!conversationId) {
    return sendJson(res, 400, { error: 'Missing conversation ID' }, origin);
  }
  let body: { outcome?: unknown } = {};
  try {
    body = (await parseJsonBody(req)) as typeof body;
  } catch (error) {
    sendBodyParseError(res, origin, error);
    return;
  }
  const { outcome } = body;
  if (outcome !== null && outcome !== undefined && !VALID_CALL_OUTCOMES.includes(outcome as never)) {
    return sendJson(res, 400, { error: `outcome must be one of: ${VALID_CALL_OUTCOMES.join(', ')} or null` }, origin);
  }
  try {
    const result = await updateCallOutcome(conversationId, (outcome as string | null) ?? null, logger);
    sendJson(
      res,
      200,
      toEnvelope({
        data: { conversationId: result.conversation_id, callOutcome: result.call_outcome },
        timeZone: DEFAULT_BUSINESS_TIMEZONE,
      }),
      origin,
    );
  } catch {
    return sendJson(res, 404, { error: 'Conversation not found' }, origin);
  }
};

// ─── Phase 3: Guardrail Override ─────────────────────────────────────────────

const handlePostGuardrailOverrideV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }
  const conversationId = getConversationIdFromPath(req);
  if (!conversationId) {
    return sendJson(res, 400, { error: 'Missing conversation ID' }, origin);
  }
  try {
    const result = await incrementGuardrailOverride(conversationId, logger);
    sendJson(
      res,
      200,
      toEnvelope({
        data: { conversationId: result.conversation_id, guardrailOverrideCount: result.guardrail_override_count },
        timeZone: DEFAULT_BUSINESS_TIMEZONE,
      }),
      origin,
    );
  } catch {
    return sendJson(res, 404, { error: 'Conversation not found' }, origin);
  }
};

// ─── Phase 3: Analytics ───────────────────────────────────────────────────────

const handleGetStageConversionV2: RequestHandler = async (_req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }
  const rows = await getStageConversionAnalytics(logger);
  sendJson(res, 200, toEnvelope({ data: rows, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handleGetObjectionFrequencyV2: RequestHandler = async (_req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }
  const rows = await getObjectionFrequencyAnalytics(logger);
  sendJson(res, 200, toEnvelope({ data: rows, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handleGetSetterAssistPerformanceV2: RequestHandler = async (_req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }
  const rows = await getSetterAssistPerformanceAnalytics(logger);
  sendJson(res, 200, toEnvelope({ data: rows, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handleGetLinePerformanceV2: RequestHandler = async (req, res, _logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const rangeParam = url.searchParams.get('range') || '7d';
  const timeZone = url.searchParams.get('tz') || DEFAULT_BUSINESS_TIMEZONE;

  const { from, to } = resolveMetricsRange({ range: rangeParam, tz: timeZone });
  const data = await getLinePerformanceAnalytics({ from, to, timeZone });
  sendJson(res, 200, toEnvelope({ data, timeZone }), origin);
};

const handleGetQualificationFunnelV2: RequestHandler = async (_req, res, _logger, origin) => {
  const data = await getQualificationFunnelAnalytics();
  sendJson(res, 200, toEnvelope({ data, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handleGetDraftAIPerformanceV2: RequestHandler = async (req, res, _logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const rangeParam = url.searchParams.get('range') || '30d';
  const timeZone = url.searchParams.get('tz') || DEFAULT_BUSINESS_TIMEZONE;

  const { from, to } = resolveMetricsRange({ range: rangeParam, tz: timeZone });
  const data = await getDraftAIPerformanceAnalytics({ from, to });
  sendJson(res, 200, toEnvelope({ data, timeZone }), origin);
};

const handleGetFollowupSLAV2: RequestHandler = async (req, res, _logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const rangeParam = url.searchParams.get('range') || '7d';
  const timeZone = url.searchParams.get('tz') || DEFAULT_BUSINESS_TIMEZONE;

  const { from, to } = resolveMetricsRange({ range: rangeParam, tz: timeZone });
  const data = await getFollowUpSLAAnalytics({ from, to });
  sendJson(res, 200, toEnvelope({ data, timeZone }), origin);
};

// ─── Phase 4: Sales Metrics Dashboard ──────────────────────────────────────────

const handleGetSalesMetricsDashboardV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }

  const url = new URL(req.url || '', `http://${req.headers.host}`);
  let resolved: ReturnType<typeof resolveMetricsRange>;
  try {
    resolved = resolveMetricsRange({
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      day: url.searchParams.get('day'),
      range: url.searchParams.get('range') ?? '30d',
      tz: url.searchParams.get('tz'),
    });
  } catch (error) {
    return sendJson(res, 400, { error: error instanceof Error ? error.message : 'Invalid range query' }, origin);
  }

  const fromDay = dayKeyInTimeZone(resolved.from, resolved.timeZone);
  const toDay = dayKeyInTimeZone(resolved.to, resolved.timeZone);
  if (!fromDay || !toDay) {
    return sendJson(res, 400, { error: 'Failed to resolve timezone day range' }, origin);
  }

  try {
    // Get the sales metrics summary
    const from = new Date(resolved.from);
    const to = new Date(resolved.to);
    const timeZone = resolved.timeZone || DEFAULT_BUSINESS_TIMEZONE;

    const salesMetrics = await getSalesMetricsSummary({ from, to, timeZone }, logger);

    sendJson(
      res,
      200,
      toEnvelope({
        data: {
          summary: salesMetrics.totals,
          trendByDay: salesMetrics.trendByDay,
          topSequences: salesMetrics.topSequences,
          repLeaderboard: salesMetrics.repLeaderboard,
          timeRange: salesMetrics.timeRange,
        },
        timeZone: resolved.timeZone || DEFAULT_BUSINESS_TIMEZONE,
        requestedMode: resolved.mode,
      }),
      origin,
    );
  } catch (error) {
    logger?.error('Failed to fetch sales metrics dashboard data:', error);
    sendJson(
      res,
      500,
      {
        error: 'Failed to fetch sales metrics dashboard data',
        details: error instanceof Error ? error.message : String(error),
      },
      origin,
    );
  }
};

// ─── Phase 4: Extended Analytics & Fixes ─────────────────────────────────────

const handleGetGoalsV2: RequestHandler = async (_req, res, _logger, origin) => {
  const data = await getGoals();
  sendJson(res, 200, toEnvelope({ data, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handleGetTrendAlertsV2: RequestHandler = async (_req, res, _logger, origin) => {
  const data = await getTrendAlerts();
  sendJson(res, 200, toEnvelope({ data, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handleGetTimeToBookingV2: RequestHandler = async (_req, res, _logger, origin) => {
  const data = await getTimeToBookingStats();
  sendJson(res, 200, toEnvelope({ data, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handleGetResponseTimeV2: RequestHandler = async (req, res, _logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const rangeParam = url.searchParams.get('range') || '7d';
  const timeZone = url.searchParams.get('tz') || DEFAULT_BUSINESS_TIMEZONE;

  const { from, to } = resolveMetricsRange({ range: rangeParam, tz: timeZone });
  const data = await getResponseTimeStats({ from, to });
  sendJson(res, 200, toEnvelope({ data, timeZone }), origin);
};

const handleGetLineBalanceV2: RequestHandler = async (_req, res, _logger, origin) => {
  const data = await getLineActivityBalance();
  sendJson(res, 200, toEnvelope({ data, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handlePostAutoAssignV2: RequestHandler = async (_req, res, _logger, origin) => {
  const result = await autoAssignWorkItems();
  sendJson(res, 200, toEnvelope({ data: result, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handlePostBulkInferQualificationV2: RequestHandler = async (req, res, _logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const limit = Number.parseInt(url.searchParams.get('limit') || '100', 10);
  const result = await bulkInferQualification(limit);
  sendJson(res, 200, toEnvelope({ data: result, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handlePostDeduplicateLinesV2: RequestHandler = async (_req, res, _logger, origin) => {
  const result = await deduplicateLines();
  sendJson(res, 200, toEnvelope({ data: result, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handleGetAuditLogsV2: RequestHandler = async (req, res, _logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const action = url.searchParams.get('action') || undefined;
  const resourceType = url.searchParams.get('resourceType') || undefined;
  const userId = url.searchParams.get('userId') || undefined;
  const limit = Number.parseInt(url.searchParams.get('limit') || '100', 10);

  const data = await getAuditLogs({ action, resourceType, userId, limit });
  sendJson(res, 200, toEnvelope({ data, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handleGetCronStatus: RequestHandler = async (_req, res, _logger, origin) => {
  const data = getCronStatusSnapshot();
  sendJson(res, 200, toEnvelope({ data, timeZone: DEFAULT_BUSINESS_TIMEZONE }), origin);
};

const handleGetMondayLeadInsightsV2: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  let resolved: ReturnType<typeof resolveMetricsRange>;
  try {
    resolved = resolveMetricsRange({
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      day: url.searchParams.get('day'),
      range: url.searchParams.get('range') ?? '30d',
      tz: url.searchParams.get('tz'),
    });
  } catch (error) {
    return sendJson(res, 400, { error: error instanceof Error ? error.message : 'Invalid range query' }, origin);
  }

  const fromDay = dayKeyInTimeZone(resolved.from, resolved.timeZone);
  const toDay = dayKeyInTimeZone(resolved.to, resolved.timeZone);
  if (!fromDay || !toDay) {
    return sendJson(res, 400, { error: 'Failed to resolve timezone day range' }, origin);
  }
  const scopeParam = url.searchParams.get('scope');
  let scope = parseScope(scopeParam);
  const boardIds = parseBoardIdsQuery(url.searchParams.get('boardIds'));
  const boardId = (url.searchParams.get('boardId') || '').trim();
  if (boardId && !boardIds.includes(boardId)) boardIds.unshift(boardId);
  if (!scopeParam && boardIds.length > 0) scope = 'board_ids';
  const sourceLimitRaw = Number.parseInt(url.searchParams.get('sourceLimit') || '12', 10);
  const setterLimitRaw = Number.parseInt(url.searchParams.get('setterLimit') || '12', 10);
  const sourceLimit = Number.isFinite(sourceLimitRaw) ? Math.max(1, Math.min(50, sourceLimitRaw)) : 12;
  const setterLimit = Number.isFinite(setterLimitRaw) ? Math.max(1, Math.min(50, setterLimitRaw)) : 12;

  try {
    const data = await getMondayLeadInsights(
      {
        fromDay,
        toDay,
        timeZone: resolved.timeZone,
        scope,
        boardIds,
        sourceLimit,
        setterLimit,
      },
      logger,
    );
    sendJson(
      res,
      200,
      toEnvelope({
        data,
        timeZone: resolved.timeZone || DEFAULT_BUSINESS_TIMEZONE,
        requestedMode: resolved.mode,
      }),
      origin,
    );
  } catch (error) {
    logger?.error('Failed to fetch monday lead insights:', error);
    sendJson(
      res,
      500,
      {
        error: 'Failed to fetch monday lead insights',
        details: error instanceof Error ? error.message : String(error),
      },
      origin,
    );
  }
};

const handleGetMondayBoardCatalogV2: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const staleThresholdHoursRaw = Number.parseInt(url.searchParams.get('staleThresholdHours') || '24', 10);
  const staleThresholdHours = Number.isFinite(staleThresholdHoursRaw)
    ? Math.max(1, Math.min(240, staleThresholdHoursRaw))
    : 24;
  try {
    const data = await listMondayBoardCatalog({ staleThresholdHours }, logger);
    sendJson(
      res,
      200,
      toEnvelope({
        data,
        timeZone: DEFAULT_BUSINESS_TIMEZONE,
      }),
      origin,
    );
  } catch (error) {
    logger?.error('Failed to fetch monday board catalog:', error);
    sendJson(
      res,
      500,
      {
        error: 'Failed to fetch monday board catalog',
        details: error instanceof Error ? error.message : String(error),
      },
      origin,
    );
  }
};

const handleGetChangelogV2: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const daysRaw = Number.parseInt(url.searchParams.get('days') || '30', 10);
  const days = Number.isFinite(daysRaw) ? Math.max(1, Math.min(365, daysRaw)) : 30;

  try {
    const timeline = await getChangelogByDateRange({ days, logger });
    sendJson(
      res,
      200,
      toEnvelope({
        data: timeline,
        timeZone: DEFAULT_BUSINESS_TIMEZONE,
      }),
      origin,
    );
  } catch (error) {
    logger?.error('Failed to fetch changelog:', error);
    sendJson(
      res,
      500,
      {
        error: 'Failed to fetch changelog',
        details: error instanceof Error ? error.message : String(error),
      },
      origin,
    );
  }
};

const handleGetMondayScorecardsV2: RequestHandler = async (req, res, logger, origin) => {
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  let resolved: ReturnType<typeof resolveMetricsRange>;
  try {
    resolved = resolveMetricsRange({
      from: url.searchParams.get('from'),
      to: url.searchParams.get('to'),
      day: url.searchParams.get('day'),
      range: url.searchParams.get('range') ?? '30d',
      tz: url.searchParams.get('tz'),
    });
  } catch (error) {
    return sendJson(res, 400, { error: error instanceof Error ? error.message : 'Invalid range query' }, origin);
  }

  const fromDay = dayKeyInTimeZone(resolved.from, resolved.timeZone);
  const toDay = dayKeyInTimeZone(resolved.to, resolved.timeZone);
  if (!fromDay || !toDay) {
    return sendJson(res, 400, { error: 'Failed to resolve timezone day range' }, origin);
  }

  const boardClass = (url.searchParams.get('boardClass') || '').trim() || null;
  const metricOwner = (url.searchParams.get('metricOwner') || '').trim() || null;
  const metricName = (url.searchParams.get('metricName') || '').trim() || null;

  try {
    const data = await getMondayScorecards(
      {
        fromDay,
        toDay,
        timeZone: resolved.timeZone,
        boardClass,
        metricOwner,
        metricName,
      },
      logger,
    );
    sendJson(
      res,
      200,
      toEnvelope({
        data,
        timeZone: resolved.timeZone || DEFAULT_BUSINESS_TIMEZONE,
        requestedMode: resolved.mode,
      }),
      origin,
    );
  } catch (error) {
    logger?.error('Failed to fetch monday scorecards:', error);
    sendJson(
      res,
      500,
      { error: 'Failed to fetch monday scorecards', details: error instanceof Error ? error.message : String(error) },
      origin,
    );
  }
};

const handleDeleteInboxTemplateV2: RequestHandler = async (req, res, logger, origin) => {
  if (!isV2InboxEnabled()) {
    return sendJson(res, 404, { error: 'Inbox is disabled' }, origin);
  }
  const url = new URL(req.url || '', `http://${req.headers.host}`);
  const parts = url.pathname.split('/').filter(Boolean);
  // /api/v2/inbox/templates/:id → parts[4]
  const templateId = parts[4];
  if (!templateId) {
    return sendJson(res, 400, { error: 'Missing template ID' }, origin);
  }
  const deleted = await deleteMessageTemplate(templateId, logger);
  if (!deleted) {
    return sendJson(res, 404, { error: 'Template not found' }, origin);
  }
  sendJson(
    res,
    200,
    toEnvelope({ data: { id: templateId, deleted: true }, timeZone: DEFAULT_BUSINESS_TIMEZONE }),
    origin,
  );
};

type ApiRoute = {
  method: 'GET' | 'POST' | 'DELETE';
  path: string;
  public?: boolean;
  csrf?: boolean;
  rateLimitBucket?: 'mutation' | 'send' | 'none';
  handler: RequestHandler;
};

const routeMatches = (pathname: string, pattern: string): boolean => {
  const patternRegex = pattern.replace(/:[^\s/]+/g, '[^\\/]+');
  return new RegExp(`^${patternRegex}$`).test(pathname);
};

const apiRoutes: ApiRoute[] = [
  { method: 'GET', path: '/api/health', public: true, handler: handleApiHealth },
  { method: 'GET', path: '/api/runtime-status', public: true, handler: handleGetRuntimeStatus },
  { method: 'GET', path: '/api/oauth/start', public: true, handler: handleOauthStart },
  { method: 'GET', path: '/api/oauth/callback', public: true, handler: handleOauthCallback },
  { method: 'POST', path: '/api/runs', public: true, csrf: false, rateLimitBucket: 'mutation', handler: handlePostRun },

  { method: 'POST', path: '/api/auth/password', public: true, csrf: false, handler: handleAuthPassword },
  { method: 'GET', path: '/api/auth/verify', handler: handleAuthVerify },
  { method: 'POST', path: '/api/auth/logout', handler: handleAuthLogout },

  { method: 'GET', path: '/api/metrics', handler: handleGetMetrics },
  { method: 'GET', path: '/api/sales-metrics', handler: handleGetSalesMetrics },
  { method: 'GET', path: '/api/runs', handler: handleGetRuns },
  { method: 'GET', path: '/api/runs/:id', handler: handleGetRunById },
  { method: 'GET', path: '/api/channels', handler: handleGetChannels },
  { method: 'GET', path: '/api/v2/sales-metrics', handler: handleGetSalesMetricsV2 },
  { method: 'GET', path: '/api/v2/sales-metrics/batch', handler: handleGetSalesMetricsBatchV2 },
  { method: 'GET', path: '/api/v2/runs', handler: handleGetRunsV2 },
  { method: 'GET', path: '/api/v2/runs/:id', handler: handleGetRunByIdV2 },
  { method: 'GET', path: '/api/v2/channels', handler: handleGetChannelsV2 },
  { method: 'GET', path: '/api/v2/weekly-summary', handler: handleGetWeeklySummaryV2 },
  { method: 'GET', path: '/api/v2/insights/summary', handler: handleGetInsightsSummaryV2 },
  { method: 'GET', path: '/api/v2/scoreboard', handler: handleGetScoreboardV2 },
  { method: 'GET', path: '/api/v2/sequences/kpis', handler: handleGetSequenceKpisV2 },
  { method: 'GET', path: '/api/v2/sequences/deep', handler: handleGetSequencesDeepV2 },
  { method: 'GET', path: '/api/v2/sequences/qualification', handler: handleGetSequenceQualificationV2 },
  { method: 'GET', path: '/api/v2/sequences/version-history', handler: handleGetSequenceVersionHistoryV2 },
  { method: 'POST', path: '/api/v2/sequences/version-decisions', handler: handlePostSequenceVersionDecisionV2 },
  { method: 'GET', path: '/api/v2/changelog', handler: handleGetChangelogV2 },
  { method: 'GET', path: '/api/v2/inbox/send-config', handler: handleGetInboxSendConfigV2 },
  { method: 'POST', path: '/api/v2/inbox/send-config/default', handler: handlePostInboxSendDefaultV2 },
  { method: 'GET', path: '/api/v2/inbox/conversations', handler: handleGetInboxConversationsV2 },
  {
    method: 'GET',
    path: '/api/v2/inbox/conversations/:id',
    handler: handleGetInboxConversationDetailV2,
  },
  {
    method: 'POST',
    path: '/api/v2/inbox/conversations/:id/draft',
    handler: handlePostInboxDraftV2,
  },
  {
    method: 'POST',
    path: '/api/v2/inbox/conversations/:id/crm-notes',
    handler: handlePostInboxCrmNotesV2,
  },
  {
    method: 'POST',
    path: '/api/v2/inbox/conversations/:id/send',
    rateLimitBucket: 'send',
    handler: handlePostInboxSendV2,
  },
  {
    method: 'POST',
    path: '/api/v2/inbox/conversations/:id/qualification',
    handler: handlePostInboxQualificationV2,
  },
  {
    method: 'POST',
    path: '/api/v2/inbox/conversations/:id/escalation-override',
    handler: handlePostInboxEscalationOverrideV2,
  },
  {
    method: 'POST',
    path: '/api/v2/inbox/conversations/:id/status',
    handler: handlePostInboxStatusV2,
  },
  {
    method: 'POST',
    path: '/api/v2/inbox/conversations/:id/sequence-enroll',
    handler: handlePostInboxSequenceEnrollV2,
  },
  {
    method: 'POST',
    path: '/api/v2/inbox/conversations/:id/sequence-disenroll',
    handler: handlePostInboxSequenceDisenrollV2,
  },
  {
    method: 'POST',
    path: '/api/v2/inbox/drafts/:id/feedback',
    handler: handlePostInboxDraftFeedbackV2,
  },
  {
    method: 'GET',
    path: '/api/v2/inbox/conversations/:id/notes',
    handler: handleGetInboxNotesV2,
  },
  {
    method: 'POST',
    path: '/api/v2/inbox/conversations/:id/notes',
    handler: handlePostInboxNoteV2,
  },
  {
    method: 'POST',
    path: '/api/v2/inbox/conversations/:id/snooze',
    handler: handlePostInboxSnoozeV2,
  },
  {
    method: 'POST',
    path: '/api/v2/inbox/conversations/:id/assign',
    handler: handlePostInboxAssignV2,
  },
  { method: 'GET', path: '/api/v2/inbox/templates', handler: handleGetInboxTemplatesV2 },
  { method: 'POST', path: '/api/v2/inbox/templates', handler: handlePostInboxTemplateV2 },
  { method: 'DELETE', path: '/api/v2/inbox/templates/:id', handler: handleDeleteInboxTemplateV2 },
  {
    method: 'POST',
    path: '/api/v2/inbox/conversations/:id/objection-tags',
    handler: handlePostObjectionTagsV2,
  },
  {
    method: 'POST',
    path: '/api/v2/inbox/conversations/:id/call-outcome',
    handler: handlePostCallOutcomeV2,
  },
  {
    method: 'POST',
    path: '/api/v2/inbox/conversations/:id/guardrail-override',
    handler: handlePostGuardrailOverrideV2,
  },
  { method: 'GET', path: '/api/v2/inbox/analytics/stage-conversion', handler: handleGetStageConversionV2 },
  { method: 'GET', path: '/api/v2/inbox/analytics/objection-frequency', handler: handleGetObjectionFrequencyV2 },
  {
    method: 'GET',
    path: '/api/v2/inbox/analytics/setter-assist-performance',
    handler: handleGetSetterAssistPerformanceV2,
  },
  { method: 'GET', path: '/api/v2/analytics/line-performance', handler: handleGetLinePerformanceV2 },
  { method: 'GET', path: '/api/v2/analytics/qualification-funnel', handler: handleGetQualificationFunnelV2 },
  { method: 'GET', path: '/api/v2/analytics/draft-ai-performance', handler: handleGetDraftAIPerformanceV2 },
  { method: 'GET', path: '/api/v2/analytics/followup-sla', handler: handleGetFollowupSLAV2 },
  { method: 'GET', path: '/api/v2/analytics/goals', handler: handleGetGoalsV2 },
  { method: 'GET', path: '/api/v2/analytics/trend-alerts', handler: handleGetTrendAlertsV2 },
  { method: 'GET', path: '/api/v2/analytics/time-to-booking', handler: handleGetTimeToBookingV2 },
  { method: 'GET', path: '/api/v2/analytics/response-time', handler: handleGetResponseTimeV2 },
  { method: 'GET', path: '/api/v2/analytics/line-balance', handler: handleGetLineBalanceV2 },
  { method: 'GET', path: '/api/v2/analytics/sales-metrics', handler: handleGetSalesMetricsDashboardV2 },
  { method: 'POST', path: '/api/v2/admin/auto-assign', handler: handlePostAutoAssignV2 },
  { method: 'POST', path: '/api/v2/admin/bulk-infer-qualification', handler: handlePostBulkInferQualificationV2 },
  { method: 'POST', path: '/api/v2/admin/deduplicate-lines', handler: handlePostDeduplicateLinesV2 },
  { method: 'GET', path: '/api/v2/admin/audit-logs', handler: handleGetAuditLogsV2 },
  { method: 'GET', path: '/api/v2/admin/cron-status', handler: handleGetCronStatus },
  { method: 'GET', path: '/api/v2/admin/monday/board-catalog', handler: handleGetMondayBoardCatalogV2 },
  { method: 'GET', path: '/api/v2/admin/monday/scorecards', handler: handleGetMondayScorecardsV2 },
  { method: 'GET', path: '/api/v2/admin/monday/lead-insights', handler: handleGetMondayLeadInsightsV2 },
  { method: 'GET', path: '/api/admin/cron-status', handler: handleGetCronStatus },
  { method: 'GET', path: '/api/admin/monday/board-catalog', handler: handleGetMondayBoardCatalogV2 },
  { method: 'GET', path: '/api/admin/monday/scorecards', handler: handleGetMondayScorecardsV2 },
  { method: 'GET', path: '/api/admin/monday/lead-insights', handler: handleGetMondayLeadInsightsV2 },

  { method: 'GET', path: '/api/conversations/:id', handler: handleGetConversationById },
  { method: 'GET', path: '/api/conversations/:id/events', handler: handleGetConversationEvents },
  { method: 'GET', path: '/api/stream-token', handler: handleGetStreamToken },
  { method: 'GET', path: '/api/stream', handler: handleGetStream },
  { method: 'GET', path: '/api/work-items', handler: handleGetWorkItems },
  { method: 'POST', path: '/api/work-items/:id/resolve', handler: handleResolveWorkItem },
  { method: 'POST', path: '/api/work-items/:id/assign', handler: handleAssignWorkItem },
];

export const handleApiRoute = async (
  req: ApiRequest,
  res: ServerResponse,
  pathname: string,
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<boolean> => {
  const method = req.method?.toUpperCase() || 'GET';
  const requestOrigin = req.headers.origin;
  const origin = resolveCorsOrigin(requestOrigin);

  // Apply security headers to all responses
  applySecurityHeaders(res);

  // Apply rate limiting
  const rateLimitResult = checkRateLimit(req as { headers: Record<string, string | string[] | undefined> });
  applyRateLimitHeaders(res, 100, rateLimitResult.remaining, rateLimitResult.resetIn);

  if (!rateLimitResult.allowed) {
    sendJson(res, 429, { error: 'Too many requests. Please try again later.' }, origin);
    return true;
  }

  if (requestOrigin && !origin) {
    sendJson(res, 403, { error: 'Origin is not allowed' });
    return true;
  }

  // Handle CORS preflight requests
  if (method === 'OPTIONS') {
    sendJson(res, 200, {}, origin);
    return true;
  }

  for (const route of apiRoutes) {
    if (route.method !== method || !routeMatches(pathname, route.path)) {
      continue;
    }

    const requiresAuth = route.public !== true;
    if (requiresAuth) {
      const isValid = await verifyToken(req);
      if (!isValid) {
        sendJson(res, 401, { error: 'Unauthorized' }, origin);
        return true;
      }
    }

    if (method === 'POST' && requiresAuth) {
      const requiresCsrf = route.csrf !== false;
      if (requiresCsrf && !validateCsrf(req)) {
        sendJson(res, 403, { error: 'CSRF token missing or invalid' }, origin);
        return true;
      }

      const bucket = route.rateLimitBucket || 'mutation';
      if (bucket !== 'none') {
        const result = ensureRateLimit(
          bucket,
          resolveRateLimitActor(req),
          bucket === 'send' ? getSendRateLimit() : getMutationRateLimit(),
        );
        if (!result.allowed) {
          handleRateLimitExceeded(res, origin, result);
          return true;
        }
      }
    }

    try {
      await route.handler(req, res, logger, origin);
    } catch (error) {
      logger?.error('API route error:', error);
      sendJson(res, 500, { error: 'Internal server error' }, origin);
    }
    return true;
  }

  return false;
};
