import type { Logger } from '@slack/bolt';
import { parsePhoneNumberFromString } from 'libphonenumber-js';

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

const deriveErrorMessage = (status: number, payload: unknown): string => {
  if (typeof payload === 'string' && payload.trim().length > 0) {
    return payload.trim();
  }
  if (isObject(payload)) {
    const error = typeof payload.error === 'string' ? payload.error.trim() : '';
    if (error) return error;
    const message = typeof payload.message === 'string' ? payload.message.trim() : '';
    if (message) return message;
    const errors = payload.errors;
    if (isObject(errors)) {
      const flattened = Object.values(errors)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .map((value) => (typeof value === 'string' ? value.trim() : ''))
        .filter((value) => value.length > 0);
      if (flattened.length > 0) {
        return flattened.join('; ');
      }
    }
  }
  return `Aloware request failed (${status})`;
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
    const message = deriveErrorMessage(response.status, parsed);
    logger?.warn?.('Aloware request failed', {
      path: redactSensitiveQueryInPath(path),
      status: response.status,
      body: parsed,
    });
    throw new AlowareClientError(message, response.status, parsed);
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
  const parsed = parsePhoneNumberFromString(phoneNumber, 'US');
  if (parsed?.isValid()) {
    const national = String(parsed.nationalNumber || '').trim();
    if (national.length > 0) return national.length > 10 ? national.slice(-10) : national;
  }
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
  companyName?: string;
  leadSource?: string;
  email?: string;
  timezone?: string;
  address?: string;
  website?: string;
  notes?: string;
  csf1?: string;
  csf2?: string;
  lineId?: string | number;
  sequenceId?: string | number;
  tagId?: string | number;
  dispositionStatusId?: string | number;
  forceUpdateSequence?: boolean;
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
    company_name: input.companyName,
    lead_source: input.leadSource,
    email: input.email,
    timezone: input.timezone,
    address: input.address,
    website: input.website,
    notes: input.notes,
    csf1: input.csf1,
    csf2: input.csf2,
    line_id: input.lineId,
    sequence_id: input.sequenceId,
    tag_id: input.tagId,
    disposition_status_id: input.dispositionStatusId,
    force_update_sequence: input.forceUpdateSequence,
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

export type AlowareSequenceSource = 'phone_number' | 'aloware' | 'hubspot' | 'zoho' | 'guesty' | 'pipedrive';

export type EnrollAlowareSequenceInput = {
  sequenceId: string | number;
  source: AlowareSequenceSource;
  id?: string | number;
  phoneNumber?: string;
  forceEnroll?: boolean;
};

export type DisenrollAlowareSequenceInput = {
  source: AlowareSequenceSource;
  id?: string | number;
  phoneNumber?: string;
};

const coerceSourceId = (value: string | number | undefined): string | number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
};

const buildSequenceIdentityPayload = (input: {
  source: AlowareSequenceSource;
  id?: string | number;
  phoneNumber?: string;
}): { source: AlowareSequenceSource; id?: string | number; phone_number?: string } => {
  if (input.source === 'phone_number') {
    const phone = normalizePhone(input.phoneNumber || '');
    if (!phone) {
      throw new AlowareClientError('phone_number is required when source=phone_number', 400, input);
    }
    return { source: input.source, phone_number: phone };
  }

  const sourceId = coerceSourceId(input.id);
  if (sourceId === null) {
    throw new AlowareClientError(`id is required when source=${input.source}`, 400, input);
  }

  return { source: input.source, id: sourceId };
};

export const enrollAlowareContactToSequence = async (
  input: EnrollAlowareSequenceInput,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<unknown> => {
  const token = getApiToken();
  if (!token) {
    throw new AlowareClientError('ALOWARE_API_TOKEN is not configured', 500, null);
  }

  const sequenceId =
    typeof input.sequenceId === 'number'
      ? input.sequenceId
      : Number.isFinite(Number.parseInt(String(input.sequenceId), 10))
        ? Number.parseInt(String(input.sequenceId), 10)
        : String(input.sequenceId).trim();
  if (!sequenceId) {
    throw new AlowareClientError('sequence_id is required', 400, input);
  }

  const identity = buildSequenceIdentityPayload(input);
  const payload = {
    api_token: token,
    sequence_id: sequenceId,
    force_enroll: input.forceEnroll === true,
    ...identity,
  };

  return requestAloware(
    '/api/v1/webhook/sequence-enroll',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    logger,
  );
};

export const disenrollAlowareContactFromSequence = async (
  input: DisenrollAlowareSequenceInput,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<unknown> => {
  const token = getApiToken();
  if (!token) {
    throw new AlowareClientError('ALOWARE_API_TOKEN is not configured', 500, null);
  }

  const identity = buildSequenceIdentityPayload(input);
  const payload = {
    api_token: token,
    ...identity,
  };

  return requestAloware(
    '/api/v1/webhook/sequence-disenroll',
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
    logger,
  );
};

export type AlowareLrnLookupResult = {
  sid?: string;
  line_type?: string;
  carrier?: string;
  cnam_city?: string;
  cnam_state?: string;
  cnam_country?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
};

export const lookupAlowareNumberLrn = async (
  phoneNumber: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<AlowareLrnLookupResult | null> => {
  const token = getApiToken();
  if (!token) return null;

  const phone = normalizePhone(phoneNumber);
  if (!phone) return null;

  try {
    const payload = await requestAloware(
      '/api/v1/webhook/lookup',
      {
        method: 'POST',
        body: JSON.stringify({
          api_token: token,
          phone_number: phone,
        }),
      },
      logger,
    );

    if (isObject(payload)) {
      return payload as AlowareLrnLookupResult;
    }
    return null;
  } catch (error) {
    if (error instanceof AlowareClientError && (error.status === 404 || error.status === 400 || error.status === 402)) {
      return null;
    }
    throw error;
  }
};
