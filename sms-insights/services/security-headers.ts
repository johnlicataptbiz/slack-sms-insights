import type { ServerResponse } from 'node:http';

/**
 * Security headers middleware
 * Addresses OWASP recommendations for HTTP security headers
 */

export type SecurityHeadersConfig = {
  /** Content Security Policy - restricts resource loading */
  csp?: string;
  /** X-Frame-Options - prevents clickjacking */
  frameOptions?: 'DENY' | 'SAMEORIGIN';
  /** Strict-Transport-Security - enforces HTTPS */
  hsts?: {
    maxAge: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
  /** X-Content-Type-Options - prevents MIME sniffing */
  noSniff?: boolean;
  /** X-XSS-Protection - XSS filter (legacy but still useful) */
  xssProtection?: boolean;
  /** Referrer-Policy - controls referrer information */
  referrerPolicy?: 'no-referrer' | 'same-origin' | 'strict-origin-when-cross-origin';
  /** Permissions-Policy - restricts browser features */
  permissionsPolicy?: string;
};

const DEFAULT_CONFIG: SecurityHeadersConfig = {
  csp: [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'", // Needed for React
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: https: blob:",
    "connect-src 'self' https://api.openai.com https://*.railway.app wss://*.railway.app",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; '),
  frameOptions: 'DENY',
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  noSniff: true,
  xssProtection: true,
  referrerPolicy: 'strict-origin-when-cross-origin',
  permissionsPolicy: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
};

/**
 * Apply security headers to response
 */
export function applySecurityHeaders(
  res: ServerResponse,
  config: SecurityHeadersConfig = DEFAULT_CONFIG
): void {
  // Content Security Policy
  if (config.csp) {
    res.setHeader('Content-Security-Policy', config.csp);
  }

  // X-Frame-Options
  if (config.frameOptions) {
    res.setHeader('X-Frame-Options', config.frameOptions);
  }

  // Strict-Transport-Security
  if (config.hsts) {
    let hstsValue = `max-age=${config.hsts.maxAge}`;
    if (config.hsts.includeSubDomains) {
      hstsValue += '; includeSubDomains';
    }
    if (config.hsts.preload) {
      hstsValue += '; preload';
    }
    res.setHeader('Strict-Transport-Security', hstsValue);
  }

  // X-Content-Type-Options
  if (config.noSniff) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
  }

  // X-XSS-Protection (legacy but still helps older browsers)
  if (config.xssProtection) {
    res.setHeader('X-XSS-Protection', '1; mode=block');
  }

  // Referrer-Policy
  if (config.referrerPolicy) {
    res.setHeader('Referrer-Policy', config.referrerPolicy);
  }

  // Permissions-Policy
  if (config.permissionsPolicy) {
    res.setHeader('Permissions-Policy', config.permissionsPolicy);
  }
}

/**
 * Rate limiting state (in-memory, per-process)
 */
const rateLimitState = new Map<string, { count: number; resetAt: number }>();

export type RateLimitConfig = {
  /** Requests per window */
  limit: number;
  /** Window duration in milliseconds */
  windowMs: number;
  /** Key extractor function */
  keyBy?: (req: { headers: Record<string, string | string[] | undefined> }) => string;
};

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  limit: 100,
  windowMs: 60 * 1000, // 1 minute
  keyBy: (req) => {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    return 'unknown';
  },
};

/**
 * Check rate limit for a request
 * Returns true if request should be allowed, false if rate limited
 */
export function checkRateLimit(
  req: { headers: Record<string, string | string[] | undefined> },
  config: RateLimitConfig = DEFAULT_RATE_LIMIT
): { allowed: boolean; remaining: number; resetIn: number } {
  const key = config.keyBy?.(req) ?? 'default';
  const now = Date.now();

  let state = rateLimitState.get(key);

  // Clean expired entries
  if (state && state.resetAt <= now) {
    rateLimitState.delete(key);
    state = undefined;
  }

  if (!state) {
    state = { count: 0, resetAt: now + config.windowMs };
    rateLimitState.set(key, state);
  }

  state.count++;

  return {
    allowed: state.count <= config.limit,
    remaining: Math.max(0, config.limit - state.count),
    resetIn: Math.max(0, state.resetAt - now),
  };
}

/**
 * Apply rate limit headers to response
 */
export function applyRateLimitHeaders(
  res: ServerResponse,
  limit: number,
  remaining: number,
  resetIn: number
): void {
  res.setHeader('X-RateLimit-Limit', limit.toString());
  res.setHeader('X-RateLimit-Remaining', remaining.toString());
  res.setHeader('X-RateLimit-Reset', Math.ceil(resetIn / 1000).toString());
}
