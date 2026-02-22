import type { Logger } from '@slack/bolt';

const DEFAULT_ALOWARE_BASE_URL = 'https://app.aloware.com';

export class AlowareClientError extends Error {
  status: number;
  body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = 'AlowareClientError';
    this.status = status;
    this.body = body;
  }
}

const getBaseUrl = (): string => {
  return (process.env.ALOWARE_BASE_URL || DEFAULT_ALOWARE_BASE_URL).trim().replace(/\/$/, '');
};

const getApiToken = (): string => {
  return (
    process.env.ALOWARE_API_TOKEN ||
    process.env.ALOWARE_WEBHOOK_API_TOKEN ||
    process.env.ALOWARE_FORM_API_TOKEN ||
    ''
  ).trim();
};

const isObject = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null;
};

const redactSensitiveQueryInPath = (path: string): string => {
  const [basePath, query = ''] = path.split('?', 2);
  if (!query) return path;

  const params = new URLSearchParams(query);
  if (params.has('api_token')) {
    params.set('api_token', '***redacted***');
  }
  const nextQuery = params.toString();
  return nextQuery ? `${basePath}?${nextQuery}` : basePath;
};

const requestAloware = async (
  path: string,
  init: RequestInit,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<unknown> => {
  const token = getApiToken();
  if (!token) {
    throw new AlowareClientError('ALOWARE_API_TOKEN is not configured', 500, null);
  }

  const url = `${getBaseUrl()}${path}`;
  const headers = new Headers(init.headers);
  if (!headers.has('Content-Type') && init.body) headers.set('Content-Type', 'application/json');
  headers.set('Accept', 'application/json');

  const response = await fetch(url, {
    ...init,
    headers,
  });

  const text = await response.text();
  let parsed: unknown = null;
  if (text.trim().length > 0) {
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }
  }

  if (!response.ok) {
    logger?.warn?.('Aloware request failed', {
      path: redactSensitiveQueryInPath(path),
      status: response.status,
      body: parsed,
    });
    throw new AlowareClientError(`Aloware request failed (${response.status})`, response.status, parsed);
  }

  return parsed;
};

export const isAlowareConfigured = (): boolean => getApiToken().length > 0;

export type AlowareContactLookupResult = {
  id?: string;
  phone_number?: string;
  name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  timezone?: string;
  csf1?: string;
  csf2?: string;
  [key: string]: unknown;
};

const normalizePhone = (phoneNumber: string): string => {
  const digits = phoneNumber.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
};

export const lookupAlowareContactByPhone = async (
  phoneNumber: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<AlowareContactLookupResult | null> => {
  const token = getApiToken();
  if (!token) return null;

  const phone = normalizePhone(phoneNumber);
  if (!phone) return null;

  const query = new URLSearchParams({
    api_token: token,
    phone_number: phone,
  });

  try {
    const payload = await requestAloware(
      `/api/v1/webhook/contact/phone-number?${query.toString()}`,
      { method: 'GET' },
      logger,
    );
    if (isObject(payload)) {
      return payload as AlowareContactLookupResult;
    }
    return null;
  } catch (error) {
    if (error instanceof AlowareClientError && (error.status === 404 || error.status === 400)) {
      return null;
    }
    throw error;
  }
};

export type UpsertAlowareContactInput = {
  phoneNumber: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  timezone?: string;
  notes?: string;
  userId?: string | number;
  userEmail?: string;
  forceUpdate?: boolean;
};

export const upsertAlowareContact = async (
  input: UpsertAlowareContactInput,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<unknown> => {
  const token = getApiToken();
  if (!token) {
    throw new AlowareClientError('ALOWARE_API_TOKEN is not configured', 500, null);
  }

  const body = {
    api_token: token,
    phone_number: normalizePhone(input.phoneNumber),
    name: input.name,
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    timezone: input.timezone,
    notes: input.notes,
    user_id: input.userId,
    user_email: input.userEmail,
    force_update: input.forceUpdate ?? true,
  };

  return requestAloware(
    '/api/v1/webhook/forms',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
    logger,
  );
};

export type SendAlowareSmsInput = {
  to: string;
  message: string;
  from?: string;
  lineId?: number;
  userId?: number;
  imageUrl?: string;
  customFields?: Record<string, string>;
};

export type SendAlowareSmsResult = {
  message?: string;
  [key: string]: unknown;
};

export const sendAlowareSms = async (
  input: SendAlowareSmsInput,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SendAlowareSmsResult> => {
  const token = getApiToken();
  if (!token) {
    throw new AlowareClientError('ALOWARE_API_TOKEN is not configured', 500, null);
  }

  const normalizedTo = normalizePhone(input.to);
  if (!normalizedTo) {
    throw new AlowareClientError('Recipient phone number is invalid', 400, { to: input.to });
  }

  const payload: Record<string, unknown> = {
    api_token: token,
    to: normalizedTo.startsWith('1') ? `+${normalizedTo}` : `+1${normalizedTo}`,
    message: input.message,
  };

  if (typeof input.lineId === 'number' && Number.isFinite(input.lineId)) {
    payload.line_id = input.lineId;
  } else if (input.from) {
    payload.from = input.from;
  }

  if (typeof input.userId === 'number' && Number.isFinite(input.userId)) {
    payload.user_id = input.userId;
  }

  if (input.imageUrl) {
    payload.image_url = input.imageUrl;
  }

  if (input.customFields && Object.keys(input.customFields).length > 0) {
    payload.custom_fields = input.customFields;
  }

  const response = await requestAloware(
    '/api/v1/webhook/sms-gateway/send',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    logger,
  );

  if (isObject(response)) {
    return response as SendAlowareSmsResult;
  }

  return { message: 'Message sent.' };
};
