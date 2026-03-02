type LoggerLike = {
  info?: (message: string, ...args: unknown[]) => void;
  warn?: (message: string, ...args: unknown[]) => void;
  error?: (message: string, ...args: unknown[]) => void;
};

type AccelerateApiKeyPayload = {
  tenant_id?: string;
  secure_key?: string;
};

const decodeBase64Url = (value: string): string => {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  return Buffer.from(normalized + padding, 'base64').toString('utf8');
};

const decodeAccelerateApiKey = (apiKey: string): AccelerateApiKeyPayload => {
  const parts = apiKey.split('.');
  if (parts.length < 2) {
    throw new Error('Accelerate api_key is not a JWT-like token');
  }

  const payloadRaw = decodeBase64Url(parts[1]);
  return JSON.parse(payloadRaw) as AccelerateApiKeyPayload;
};

export const resolveNodePostgresConnectionString = (databaseUrl: string, logger?: LoggerLike): string => {
  if (!databaseUrl.startsWith('prisma+postgres://')) {
    return databaseUrl;
  }

  const parsed = new URL(databaseUrl);
  if (parsed.protocol !== 'prisma+postgres:') {
    return databaseUrl;
  }

  const apiKey = parsed.searchParams.get('api_key');
  if (!apiKey) {
    throw new Error('Missing `api_key` query parameter for Prisma Accelerate URL');
  }

  const payload = decodeAccelerateApiKey(apiKey);
  if (!payload.tenant_id || !payload.secure_key) {
    throw new Error('Accelerate api_key payload missing tenant_id/secure_key');
  }

  logger?.info?.('Using Prisma Accelerate URL with direct Postgres adapter for pg pool');

  const tenantId = encodeURIComponent(payload.tenant_id);
  const secureKey = encodeURIComponent(payload.secure_key);
  return `postgresql://${tenantId}:${secureKey}@db.prisma.io:5432/postgres?sslmode=require`;
};
