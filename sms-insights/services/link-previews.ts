import type { Logger } from '@slack/bolt';
import { getLinkPreview } from 'link-preview-js';

export type MessageLinkPreview = {
  url: string;
  hostname: string | null;
  title: string | null;
  description: string | null;
  siteName: string | null;
  image: string | null;
};

const URL_REGEX = /\bhttps?:\/\/[^\s<>"'`]+/gi;
const CACHE_TTL_MS = 1000 * 60 * 10;
const previewCache = new Map<string, { expiresAt: number; value: MessageLinkPreview | null }>();

const parseBoolean = (value: string | undefined, fallback: boolean): boolean => {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};

const getPreviewConfig = () => {
  const maxPerMessage = Number.parseInt(process.env.INBOX_LINK_PREVIEW_MAX_PER_MESSAGE || '', 10);
  const timeoutMs = Number.parseInt(process.env.INBOX_LINK_PREVIEW_TIMEOUT_MS || '', 10);
  return {
    enabled: parseBoolean(process.env.INBOX_LINK_PREVIEWS_ENABLED, true),
    maxPerMessage: Number.isFinite(maxPerMessage) ? Math.max(0, Math.min(maxPerMessage, 5)) : 2,
    timeoutMs: Number.isFinite(timeoutMs) ? Math.max(300, Math.min(timeoutMs, 10_000)) : 2_500,
  };
};

const trimTrailingPunctuation = (value: string): string => value.replace(/[),.;!?]+$/, '');

const isPrivateHostname = (hostname: string): boolean => {
  const lower = hostname.toLowerCase();
  if (!lower) return true;
  if (lower === 'localhost' || lower === '::1' || lower.endsWith('.local')) return true;
  if (lower.startsWith('127.') || lower.startsWith('10.') || lower.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(lower)) return true;
  return false;
};

export const extractUrlsFromText = (body: string | null | undefined): string[] => {
  if (!body) return [];
  const { maxPerMessage } = getPreviewConfig();
  if (maxPerMessage <= 0) return [];
  const found = body.match(URL_REGEX) || [];
  const deduped = new Set<string>();
  for (const raw of found) {
    const candidate = trimTrailingPunctuation(raw);
    try {
      const parsed = new URL(candidate);
      if (!['http:', 'https:'].includes(parsed.protocol)) continue;
      if (isPrivateHostname(parsed.hostname)) continue;
      deduped.add(parsed.toString());
    } catch {
      // Ignore malformed URLs from message text.
    }
  }
  return Array.from(deduped).slice(0, maxPerMessage);
};

const fetchPreview = async (
  url: string,
  logger?: Pick<Logger, 'debug' | 'warn'>,
): Promise<MessageLinkPreview | null> => {
  const now = Date.now();
  const cached = previewCache.get(url);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }
  try {
    const { timeoutMs } = getPreviewConfig();
    const preview = (await getLinkPreview(url, { timeout: timeoutMs })) as {
      title?: unknown;
      description?: unknown;
      siteName?: unknown;
      images?: unknown;
    };
    const hostname = (() => {
      try {
        return new URL(url).hostname;
      } catch {
        return null;
      }
    })();
    const normalized: MessageLinkPreview = {
      url,
      hostname,
      title: typeof preview.title === 'string' && preview.title.trim().length > 0 ? preview.title.trim() : null,
      description:
        typeof preview.description === 'string' && preview.description.trim().length > 0
          ? preview.description.trim()
          : null,
      siteName:
        typeof preview.siteName === 'string' && preview.siteName.trim().length > 0 ? preview.siteName.trim() : null,
      image: Array.isArray(preview.images) && typeof preview.images[0] === 'string' ? preview.images[0] : null,
    };
    previewCache.set(url, { expiresAt: now + CACHE_TTL_MS, value: normalized });
    return normalized;
  } catch (error) {
    logger?.debug?.('link preview fetch failed', { url, error: String(error) });
    previewCache.set(url, { expiresAt: now + CACHE_TTL_MS, value: null });
    return null;
  }
};

export const buildMessageLinkPreviews = async (
  messages: Array<{ id: string; body: string | null }>,
  logger?: Pick<Logger, 'debug' | 'warn'>,
): Promise<Map<string, MessageLinkPreview[]>> => {
  const { enabled } = getPreviewConfig();
  if (!enabled) {
    return new Map(messages.map((message) => [message.id, []]));
  }
  const previewMap = new Map<string, MessageLinkPreview[]>();
  const messageToUrls = new Map<string, string[]>();
  const uniqueUrls = new Set<string>();

  for (const message of messages) {
    const urls = extractUrlsFromText(message.body);
    messageToUrls.set(message.id, urls);
    for (const url of urls) uniqueUrls.add(url);
  }

  const resolved = new Map<string, MessageLinkPreview | null>();
  await Promise.all(
    Array.from(uniqueUrls).map(async (url) => {
      resolved.set(url, await fetchPreview(url, logger));
    }),
  );

  for (const message of messages) {
    const urls = messageToUrls.get(message.id) || [];
    const previews: MessageLinkPreview[] = [];
    for (const url of urls) {
      const item = resolved.get(url) || null;
      if (item) previews.push(item);
    }
    previewMap.set(message.id, previews);
  }

  return previewMap;
};
