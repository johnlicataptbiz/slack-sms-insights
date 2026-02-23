import { createHmac, timingSafeEqual } from 'node:crypto';

type StreamTokenPayload = {
  sub: string;
  exp: number; // unix seconds
  nonce: string;
};

const base64UrlEncode = (input: Buffer | string): string => {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(input, 'utf8');
  return buf.toString('base64').replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};

const base64UrlDecodeToBuffer = (input: string): Buffer => {
  const normalized = input.replaceAll('-', '+').replaceAll('_', '/');
  const pad = normalized.length % 4 === 0 ? '' : '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(`${normalized}${pad}`, 'base64');
};

const sign = (secret: string, data: string): string => {
  return base64UrlEncode(createHmac('sha256', secret).update(data).digest());
};

const safeEqual = (a: string, b: string): boolean => {
  const ab = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
};

export const getStreamTokenSecret = (): string => {
  const secret = (process.env.STREAM_TOKEN_SECRET || '').trim();
  if (secret) return secret;

  // Dev fallback only. In production, set STREAM_TOKEN_SECRET.
  const env = (process.env.NODE_ENV || '').trim().toLowerCase();
  if (env === 'production') {
    throw new Error('STREAM_TOKEN_SECRET is required in production');
  }
  return 'dev-stream-token-secret-change-me';
};

export const mintStreamToken = (params: {
  subject: string;
  ttlSeconds: number;
  now?: Date;
  nonce?: string;
}): string => {
  const now = params.now ?? new Date();
  const exp = Math.floor(now.getTime() / 1000) + Math.max(1, Math.floor(params.ttlSeconds));
  const payload: StreamTokenPayload = {
    sub: params.subject,
    exp,
    nonce: params.nonce || base64UrlEncode(Buffer.from(String(Math.random()))).slice(0, 16),
  };

  const payloadJson = JSON.stringify(payload);
  const payloadB64 = base64UrlEncode(payloadJson);
  const sig = sign(getStreamTokenSecret(), payloadB64);
  return `${payloadB64}.${sig}`;
};

export const verifyStreamToken = (
  token: string,
  now = new Date(),
): { ok: true; payload: StreamTokenPayload } | { ok: false } => {
  const trimmed = (token || '').trim();
  const parts = trimmed.split('.');
  if (parts.length !== 2) return { ok: false };

  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return { ok: false };

  const expected = sign(getStreamTokenSecret(), payloadB64);
  if (!safeEqual(expected, sig)) return { ok: false };

  let payload: StreamTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecodeToBuffer(payloadB64).toString('utf8')) as StreamTokenPayload;
  } catch {
    return { ok: false };
  }

  if (
    !payload ||
    typeof payload.sub !== 'string' ||
    typeof payload.exp !== 'number' ||
    typeof payload.nonce !== 'string'
  ) {
    return { ok: false };
  }

  const nowSec = Math.floor(now.getTime() / 1000);
  if (payload.exp <= nowSec) return { ok: false };

  return { ok: true, payload };
};
