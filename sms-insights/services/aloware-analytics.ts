/* biome-ignore-all lint/correctness/noUnusedVariables: legacy analytics helpers retained for report evolution */
import type { Logger } from '@slack/bolt';
import type { Block, KnownBlock } from '@slack/types';
import type { WebClient } from '@slack/web-api';
import { timeOperation } from './telemetry.js';

const DAY_SECONDS = 24 * 60 * 60;
const WEEK_SECONDS = 7 * DAY_SECONDS;
const DEFAULT_TRACKED_KEYWORDS = [
  'interested',
  'not interested',
  'price',
  'cost',
  'stop',
  'wrong number',
  'booked',
  'callback',
];
const DEFAULT_INBOUND_PATTERN = '\\b(has\\s+received\\s+an\\s+sms|received\\s+an\\s+sms|inbound|incoming)\\b';
const DEFAULT_OUTBOUND_PATTERN = '\\b(has\\s+sent\\s+an\\s+sms|sent\\s+an\\s+sms|outbound|outgoing)\\b';
const DEFAULT_KEYWORD_SOURCE = 'inbound';
const DEFAULT_REPLY_WINDOW_HOURS = 48;
const DEFAULT_KEYWORD_MIN_SAMPLES = 2;
const DEFAULT_PHRASE_MIN_SAMPLES = 2;
const DEFAULT_PHRASE_LIMIT = 6;
const DEFAULT_PHRASE_MIN_WORDS = 2;
const DEFAULT_PHRASE_MAX_WORDS = 3;
const DEFAULT_ANALYTICS_CACHE_TTL_SECONDS = 45;
const DEFAULT_ANALYTICS_CACHE_MAX_STALE_SECONDS = 300;
const DEFAULT_DAILY_SEQUENCE_KPI_LIMIT = 8;
const DEFAULT_REP_SECTION_MIN_OUTBOUND_CONVERSATIONS = 1;
const DEFAULT_REPORT_TIMEZONE = 'America/Chicago';
const DEFAULT_DAILY_WINDOW_START_HOUR = 4;
const DEFAULT_DAILY_WINDOW_END_HOUR = 23;
const DEFAULT_SEQUENCE_ATTRIBUTION_LOOKBACK_DAYS = 30;
const DUPLICATE_EVENT_WINDOW_SECONDS = 20;
const DEFAULT_DEDUPE_SMS_EVENTS = false;
const DASHBOARD_SEQUENCE_DISPLAY_LIMIT = 20;
const DASHBOARD_MESSAGE_REPLY_RATE_LIMIT = 8;
const NO_SEQUENCE_LABEL = 'No sequence (manual/direct)';
const EXPLICIT_AB_VERSION_PATTERN = /\b(?:version\s*([AB])|([AB])\s*version)\b/i;
const TRAILING_SEQUENCE_VERSION_PATTERN = /\s*-\s*20\d{2}\s*v?\d+(?:\.\d+)*\s*$/i;
const TRAILING_GENERIC_VERSION_PATTERN = /\s*v?\d+(?:\.\d+){1,}\s*$/i;
const TRAILING_YEAR_PATTERN = /\s*-\s*20\d{2}\s*$/i;

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'he',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'that',
  'the',
  'to',
  'was',
  'were',
  'will',
  'with',
  'you',
  'your',
  'this',
  'they',
  'their',
  'them',
  'our',
  'outbound',
  'inbound',
  'incoming',
  'outgoing',
  'message',
  'sms',
  'text',
]);

type Direction = 'inbound' | 'outbound' | 'unknown';

type HistoryMessage = {
  attachments?: Array<{
    title?: string;
    fallback?: string;
    fields?: Array<{
      title?: string;
      value?: string;
    }>;
  }>;
  subtype?: string;
  text?: string;
  ts?: string;
  thread_ts?: string;
};

type MessagePoint = {
  direction: Direction;
  text: string;
  body: string;
  contactName: string;
  contactPhone: string;
  lineName: string;
  userName: string;
  sequenceName: string;
  conversationId: string;
  threadId: string;
  ts: number;
};

type WindowStats = {
  inbound: number;
  outbound: number;
  unknown: number;
  replyRatePct: number;
  repliedThreads: number;
  outboundThreads: number;
};

type OutreachTouch = {
  conversationId: string;
  body: string;
  lineName: string;
  sequenceName: string;
  stage: 'Cold' | 'Warm' | 'Inbound magnet';
  offerType: string;
  positioningType: string;
  styleType: string;
  touchNumber: number;
  ts: number;
  replied: boolean;
};

type PerformanceRow = {
  label: string;
  touches: number;
  replies: number;
  replyRatePct: number;
};

type ThemeRow = {
  label: string;
  messages: number;
  conversations: number;
  sample: string;
};

type IntentTier = 'High intent' | 'Growth-oriented' | 'Curiosity / early stage' | 'Negative / misaligned';

type ConversationSummary = {
  conversationId: string;
  contactLabel: string;
  sequenceName: string;
  firstOutboundTs?: number;
  lastOutboundTs?: number;
  firstInboundAfterOutboundTs?: number;
  firstBookingTs?: number;
  outboundCount: number;
  inboundCount: number;
  replied: boolean;
  booked: boolean;
  optOut: boolean;
  scheduleChange: boolean;
  hasHighIntent: boolean;
  hasGrowthIntent: boolean;
  hasCuriositySignal: boolean;
  hasNegativeSignal: boolean;
  hasPositiveReply: boolean;
  firstOptOutTouch?: number;
  firstOptOutTs?: number;
  messagesToBook?: number;
  latestInbound?: MessagePoint;
};

type SequencePerformanceRow = {
  label: string;
  conversations: number;
  replies: number;
  highIntent: number;
  positiveReplies: number;
  booked: number;
  optOuts: number;
  replyRatePct: number;
  optOutRatePct: number;
};

type SequenceAttributionMode = 'touch' | 'origin';

type SequenceVolumeRow = {
  label: string;
  conversations: number;
  outboundTexts: number;
  inboundTexts: number;
  totalTexts: number;
};

type SequenceVolumeTotals = {
  sequences: number;
  conversations: number;
  outboundTexts: number;
  inboundTexts: number;
  totalTexts: number;
};

type RequiredStructureDefinition = {
  label: string;
  matches: (touch: OutreachTouch) => boolean;
};

type RequiredStructureMetric = {
  label: string;
  conversations: number;
  repliedConversations: number;
  bookedWhenReplied: number;
  replyRatePct: number;
  bookingWhenRepliedRatePct: number;
};

type LocalTimeParts = {
  dateKey: string;
  hour: number;
  minute: number;
  second: number;
};

type DailyWindowContext = {
  dateKey: string;
  endHour: number;
  label: string;
  startHour: number;
  timezone: string;
  windowStartTs: number;
};

type DailySnapshotSummaryMetrics = {
  bookingRatePerConversationPct: number;
  bookingRatePerReplyPct: number;
  bookings: number;
  outboundConversations: number;
  optOuts: number;
  replies: number;
  replyRatePct: number;
  rolling7DayBookingPer100: number;
  topBookingDriver?: {
    bookingWhenRepliedRatePct: number;
    conversations: number;
    label: string;
    repliedConversations: number;
    replyRatePct: number;
  };
  topPerformingSequence?: {
    bookings: number;
    conversations: number;
    label: string;
    replyRatePct: number;
  };
  optOutRiskSequence?: {
    label: string;
    optOutRatePct: number;
    optOuts: number;
  };
};

export type DailySnapshotSummary = DailySnapshotSummaryMetrics & {
  dateLabel: string;
  timezone: string;
  windowLabel: string;
};

type AnalyticsReportBundle = {
  isDaily: boolean;
  reportText: string;
  summary?: DailySnapshotSummary;
};

const REQUIRED_MESSAGE_STRUCTURE_DEFINITIONS: RequiredStructureDefinition[] = [
  {
    label: 'Opening Curiosity Hook',
    matches: (touch) => touch.positioningType === 'Curiosity hook',
  },
  {
    label: 'Qualification Question',
    matches: (touch) => touch.styleType === 'Qualification question',
  },
  {
    label: 'Direct Call Invite',
    matches: (touch) => touch.positioningType === 'Call invite',
  },
  {
    label: 'Follow-Up Reminder',
    matches: (touch) => touch.styleType === 'Follow-up reminder',
  },
];

type QueueBucket = {
  label: string;
  rows: LeadRow[];
};

type DirectionPatternCache = {
  inboundPattern: RegExp;
  inboundRaw: string;
  outboundPattern: RegExp;
  outboundRaw: string;
};

type HistoryCacheEntry = {
  fetchedAt: number;
  inFlight?: Promise<HistoryMessage[]>;
  messages: HistoryMessage[];
};

const historyCache = new Map<string, HistoryCacheEntry>();
let directionPatternCache: DirectionPatternCache | undefined;

const escapeRegExp = (value: string): string => {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const compilePattern = (patternText: string): RegExp => {
  return new RegExp(patternText, 'i');
};

const getDirectionPatternCache = (): DirectionPatternCache => {
  const inboundRaw = process.env.ALOWARE_INBOUND_PATTERN?.trim() || DEFAULT_INBOUND_PATTERN;
  const outboundRaw = process.env.ALOWARE_OUTBOUND_PATTERN?.trim() || DEFAULT_OUTBOUND_PATTERN;

  if (
    directionPatternCache &&
    directionPatternCache.inboundRaw === inboundRaw &&
    directionPatternCache.outboundRaw === outboundRaw
  ) {
    return directionPatternCache;
  }

  directionPatternCache = {
    inboundRaw,
    outboundRaw,
    inboundPattern: compilePattern(inboundRaw),
    outboundPattern: compilePattern(outboundRaw),
  };

  return directionPatternCache;
};

const parseCustomKeywords = (prompt: string): string[] => {
  const match = prompt.match(/\bkeywords?\s*:\s*([^\n]+)/i);
  if (!match?.[1]) {
    return [];
  }

  return match[1]
    .split(',')
    .map((keyword) => keyword.trim().toLowerCase())
    .filter((keyword) => keyword.length > 0);
};

const getTrackedKeywords = (prompt: string): string[] => {
  const configured = (process.env.ALOWARE_TRACKED_KEYWORDS || '')
    .split(',')
    .map((keyword) => keyword.trim().toLowerCase())
    .filter((keyword) => keyword.length > 0);

  const merged = [...DEFAULT_TRACKED_KEYWORDS, ...configured, ...parseCustomKeywords(prompt)];
  return [...new Set(merged)];
};

const getKeywordSource = (): 'inbound' | 'all' => {
  const configured = process.env.ALOWARE_KEYWORD_SOURCE?.trim().toLowerCase() || DEFAULT_KEYWORD_SOURCE;
  return configured === 'all' ? 'all' : 'inbound';
};

const parsePositiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    return fallback;
  }
  return parsed;
};

const getReplyWindowSeconds = (): number => {
  const hours = parsePositiveInt(process.env.ALOWARE_REPLY_WINDOW_HOURS, DEFAULT_REPLY_WINDOW_HOURS);
  return hours * 60 * 60;
};

const getPhraseMinSamples = (): number => {
  return parsePositiveInt(process.env.ALOWARE_PHRASE_MIN_SAMPLES, DEFAULT_PHRASE_MIN_SAMPLES);
};

const getKeywordMinSamples = (): number => {
  return parsePositiveInt(process.env.ALOWARE_KEYWORD_MIN_SAMPLES, DEFAULT_KEYWORD_MIN_SAMPLES);
};

const getPhraseLimit = (): number => {
  return parsePositiveInt(process.env.ALOWARE_PHRASE_LIMIT, DEFAULT_PHRASE_LIMIT);
};

const getPhraseWordBounds = (): { minWords: number; maxWords: number } => {
  const minWords = parsePositiveInt(process.env.ALOWARE_PHRASE_MIN_WORDS, DEFAULT_PHRASE_MIN_WORDS);
  const maxWords = parsePositiveInt(process.env.ALOWARE_PHRASE_MAX_WORDS, DEFAULT_PHRASE_MAX_WORDS);
  return {
    minWords: Math.min(minWords, maxWords),
    maxWords: Math.max(minWords, maxWords),
  };
};

const getAnalyticsCacheTtlSeconds = (): number => {
  return parsePositiveInt(process.env.ALOWARE_ANALYTICS_CACHE_TTL_SECONDS, DEFAULT_ANALYTICS_CACHE_TTL_SECONDS);
};

const getAnalyticsCacheMaxStaleSeconds = (): number => {
  return parsePositiveInt(
    process.env.ALOWARE_ANALYTICS_CACHE_MAX_STALE_SECONDS,
    DEFAULT_ANALYTICS_CACHE_MAX_STALE_SECONDS,
  );
};

const getDailySequenceKpiLimit = (): number => {
  return parsePositiveInt(process.env.ALOWARE_DAILY_SEQUENCE_KPI_LIMIT, DEFAULT_DAILY_SEQUENCE_KPI_LIMIT);
};

const getRepSectionMinOutboundConversations = (): number => {
  return parsePositiveInt(
    process.env.ALOWARE_REP_SECTION_MIN_OUTBOUND_CONVERSATIONS,
    DEFAULT_REP_SECTION_MIN_OUTBOUND_CONVERSATIONS,
  );
};

const getReportTimezone = (): string => {
  const configured = process.env.ALOWARE_REPORT_TIMEZONE?.trim();
  return configured && configured.length > 0 ? configured : DEFAULT_REPORT_TIMEZONE;
};

const parseHour = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt(value || '', 10);
  if (Number.isNaN(parsed)) {
    return fallback;
  }
  return Math.min(23, Math.max(0, parsed));
};

const getDailyWindowStartHour = (): number => {
  return parseHour(process.env.ALOWARE_DAILY_WINDOW_START_HOUR, DEFAULT_DAILY_WINDOW_START_HOUR);
};

const getDailyWindowEndHour = (): number => {
  return parseHour(process.env.ALOWARE_DAILY_WINDOW_END_HOUR, DEFAULT_DAILY_WINDOW_END_HOUR);
};

const formatHourLabel = (hour24: number): string => {
  const suffix = hour24 >= 12 ? 'PM' : 'AM';
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return `${hour12}:00 ${suffix}`;
};

const getLocalTimeParts = (ts: number, timezone: string): LocalTimeParts => {
  const parts = new Intl.DateTimeFormat('en-US', {
    hour: '2-digit',
    hour12: false,
    minute: '2-digit',
    second: '2-digit',
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(ts * 1000));

  const year = parts.find((part) => part.type === 'year')?.value || '0000';
  const month = parts.find((part) => part.type === 'month')?.value || '00';
  const day = parts.find((part) => part.type === 'day')?.value || '00';
  const hour = Number.parseInt(parts.find((part) => part.type === 'hour')?.value || '', 10);
  const minute = Number.parseInt(parts.find((part) => part.type === 'minute')?.value || '', 10);
  const second = Number.parseInt(parts.find((part) => part.type === 'second')?.value || '', 10);

  return {
    dateKey: `${year}-${month}-${day}`,
    hour: Number.isNaN(hour) ? 0 : hour,
    minute: Number.isNaN(minute) ? 0 : minute,
    second: Number.isNaN(second) ? 0 : second,
  };
};

const DATE_KEY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const SLASH_DATE_PATTERN = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/;
const ISO_DATE_PATTERN = /\b(\d{4})-(\d{1,2})-(\d{1,2})\b/;
const MONTH_NAME_DATE_PATTERN =
  /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+(\d{1,2})(?:,?\s*(\d{2,4}))?\b/i;

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

const toDateKey = (year: number, month: number, day: number): string => {
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
};

const parseDateKey = (dateKey: string): { day: number; month: number; year: number } | undefined => {
  const match = dateKey.match(DATE_KEY_PATTERN);
  if (!match) {
    return undefined;
  }
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if ([year, month, day].some((value) => Number.isNaN(value))) {
    return undefined;
  }
  return { day, month, year };
};

const isValidDate = (year: number, month: number, day: number): boolean => {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() + 1 === month && parsed.getUTCDate() === day;
};

const normalizePromptDateYear = (rawYear?: string): number | undefined => {
  if (!rawYear) {
    return undefined;
  }
  const parsed = Number.parseInt(rawYear, 10);
  if (Number.isNaN(parsed)) {
    return undefined;
  }
  if (rawYear.length === 2) {
    return 2000 + parsed;
  }
  return parsed;
};

const getTimezoneOffsetSeconds = (ts: number, timezone: string): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    timeZoneName: 'shortOffset',
  }).formatToParts(new Date(ts * 1000));
  const offsetToken = parts.find((part) => part.type === 'timeZoneName')?.value || 'GMT';
  if (offsetToken === 'GMT') {
    return 0;
  }

  const match = offsetToken.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/);
  if (!match) {
    return 0;
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = Number.parseInt(match[3] || '0', 10);
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return 0;
  }
  return sign * (hours * 3600 + minutes * 60);
};

const localDateTimeToUnixTs = ({
  day,
  hour,
  minute,
  month,
  second,
  timezone,
  year,
}: {
  day: number;
  hour: number;
  minute: number;
  month: number;
  second: number;
  timezone: string;
  year: number;
}): number => {
  const naiveUtcTs = Math.floor(Date.UTC(year, month - 1, day, hour, minute, second) / 1000);
  let resolvedTs = naiveUtcTs;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const offsetSeconds = getTimezoneOffsetSeconds(resolvedTs, timezone);
    const adjustedTs = naiveUtcTs - offsetSeconds;
    if (adjustedTs === resolvedTs) {
      break;
    }
    resolvedTs = adjustedTs;
  }
  return resolvedTs;
};

const parseRequestedDailyDateKey = ({
  nowTs,
  prompt,
  timezone,
}: {
  nowTs: number;
  prompt: string;
  timezone: string;
}): string | undefined => {
  if (!isDailyChecklistPrompt(prompt)) {
    return undefined;
  }

  const normalizedPrompt = prompt.toLowerCase();
  const nowLocal = getLocalTimeParts(nowTs, timezone);
  const nowLocalYear = Number.parseInt(nowLocal.dateKey.slice(0, 4), 10);
  let month: number | undefined;
  let day: number | undefined;
  let year: number | undefined;

  const isoMatch = normalizedPrompt.match(ISO_DATE_PATTERN);
  if (isoMatch) {
    year = Number.parseInt(isoMatch[1], 10);
    month = Number.parseInt(isoMatch[2], 10);
    day = Number.parseInt(isoMatch[3], 10);
  }

  if (month === undefined || day === undefined) {
    const slashMatch = normalizedPrompt.match(SLASH_DATE_PATTERN);
    if (slashMatch) {
      month = Number.parseInt(slashMatch[1], 10);
      day = Number.parseInt(slashMatch[2], 10);
      year = normalizePromptDateYear(slashMatch[3]);
    }
  }

  if (month === undefined || day === undefined) {
    const monthNameMatch = normalizedPrompt.match(MONTH_NAME_DATE_PATTERN);
    if (monthNameMatch) {
      month = MONTH_NAME_TO_NUMBER[monthNameMatch[1].toLowerCase()];
      day = Number.parseInt(monthNameMatch[2], 10);
      year = normalizePromptDateYear(monthNameMatch[3]);
    }
  }

  if (month === undefined || day === undefined) {
    return undefined;
  }

  let resolvedYear = year ?? nowLocalYear;
  if (!isValidDate(resolvedYear, month, day)) {
    return undefined;
  }

  if (year === undefined) {
    const sameYearDateKey = toDateKey(resolvedYear, month, day);
    if (sameYearDateKey > nowLocal.dateKey) {
      resolvedYear -= 1;
      if (!isValidDate(resolvedYear, month, day)) {
        return undefined;
      }
    }
  }

  return toDateKey(resolvedYear, month, day);
};

const resolveDailyReportAnchor = ({
  nowTs,
  prompt,
  timezone,
}: {
  nowTs: number;
  prompt: string;
  timezone: string;
}): { effectiveNowTs: number; requestedDateKey?: string } => {
  const requestedDateKey = parseRequestedDailyDateKey({
    nowTs,
    prompt,
    timezone,
  });
  if (!requestedDateKey) {
    return { effectiveNowTs: nowTs };
  }

  const parsedDate = parseDateKey(requestedDateKey);
  if (!parsedDate) {
    return { effectiveNowTs: nowTs };
  }

  const endHour = Math.max(getDailyWindowStartHour(), getDailyWindowEndHour());
  const requestedWindowEndTs = localDateTimeToUnixTs({
    day: parsedDate.day,
    hour: endHour,
    minute: 59,
    month: parsedDate.month,
    second: 59,
    timezone,
    year: parsedDate.year,
  });

  return {
    effectiveNowTs: Math.min(nowTs, requestedWindowEndTs),
    requestedDateKey,
  };
};

const resolveDailyWindowContext = ({
  nowTs,
  targetDateKey,
  timezone,
}: {
  nowTs: number;
  targetDateKey?: string;
  timezone: string;
}): DailyWindowContext => {
  const startHour = getDailyWindowStartHour();
  const configuredEndHour = getDailyWindowEndHour();
  const endHour = Math.max(startHour, configuredEndHour);
  if (targetDateKey) {
    const parsedDate = parseDateKey(targetDateKey);
    if (parsedDate) {
      return {
        dateKey: targetDateKey,
        endHour,
        label: `${formatHourLabel(startHour)} - ${formatHourLabel(endHour)}`,
        startHour,
        timezone,
        windowStartTs: localDateTimeToUnixTs({
          day: parsedDate.day,
          hour: startHour,
          minute: 0,
          month: parsedDate.month,
          second: 0,
          timezone,
          year: parsedDate.year,
        }),
      };
    }
  }

  const nowLocal = getLocalTimeParts(nowTs, timezone);
  const usePreviousDay = nowLocal.hour < startHour;
  const targetTs = usePreviousDay ? nowTs - DAY_SECONDS : nowTs;
  const targetLocal = getLocalTimeParts(targetTs, timezone);

  const elapsedHours = usePreviousDay ? 24 - startHour + nowLocal.hour : nowLocal.hour - startHour;
  const elapsedSeconds = elapsedHours * 60 * 60 + nowLocal.minute * 60 + nowLocal.second;

  return {
    dateKey: targetLocal.dateKey,
    endHour,
    label: `${formatHourLabel(startHour)} - ${formatHourLabel(endHour)}`,
    startHour,
    timezone,
    windowStartTs: nowTs - elapsedSeconds,
  };
};

const isWithinDailyWindow = (messageTs: number, context: DailyWindowContext, nowTs: number): boolean => {
  if (!Number.isFinite(messageTs) || messageTs <= 0 || messageTs > nowTs) {
    return false;
  }
  const local = getLocalTimeParts(messageTs, context.timezone);
  if (local.dateKey !== context.dateKey) {
    return false;
  }
  return local.hour >= context.startHour && local.hour <= context.endHour;
};

const getSequenceAttributionLookbackDays = (): number => {
  const configured = parsePositiveInt(
    process.env.ALOWARE_SEQUENCE_ATTRIBUTION_LOOKBACK_DAYS,
    DEFAULT_SEQUENCE_ATTRIBUTION_LOOKBACK_DAYS,
  );
  return Math.max(7, Math.min(configured, 365));
};

const shouldDedupeSmsEvents = (): boolean => {
  const configured = process.env.ALOWARE_DEDUPE_SMS_EVENTS?.trim().toLowerCase();
  if (!configured) {
    return DEFAULT_DEDUPE_SMS_EVENTS;
  }
  return configured === 'true';
};

const sanitize = (value: string): string => {
  return value.replace(/\s+/g, ' ').trim();
};

const stripSlackLinkMarkup = (value: string): string => {
  return value.replace(/<[^|>]+\|([^>]+)>/g, '$1');
};

const extractHistoryText = (message: HistoryMessage): string => {
  const direct = sanitize(stripSlackLinkMarkup(message.text || ''));
  if (direct.length > 0) {
    return direct;
  }

  const attachments = message.attachments || [];
  const parts: string[] = [];
  for (const attachment of attachments) {
    if (attachment.title) {
      parts.push(sanitize(attachment.title));
    }
    for (const field of attachment.fields || []) {
      const title = sanitize(field.title || '');
      const value = sanitize(stripSlackLinkMarkup(field.value || ''));
      if (title && value) {
        parts.push(`${title}: ${value}`);
      } else if (value) {
        parts.push(value);
      }
    }
    if (!attachment.fields?.length && attachment.fallback) {
      parts.push(sanitize(stripSlackLinkMarkup(attachment.fallback)));
    }
  }

  return sanitize(parts.join(' '));
};

const extractAttachmentField = (message: HistoryMessage, fieldTitle: string): string => {
  const target = fieldTitle.trim().toLowerCase();
  for (const attachment of message.attachments || []) {
    for (const field of attachment.fields || []) {
      const title = sanitize(field.title || '').toLowerCase();
      if (title !== target) {
        continue;
      }
      return sanitize(stripSlackLinkMarkup(field.value || ''));
    }
  }
  return '';
};

const extractContact = (text: string): { name: string; phone: string } => {
  const cleaned = sanitize(stripSlackLinkMarkup(text));
  const contactWithLabel = cleaned.match(/contact[:\s-]*([^(\n]+?)\s*\(\s*(\+?[0-9][0-9()\-\s]{7,})\s*\)/i);
  if (contactWithLabel) {
    return {
      name: sanitize(contactWithLabel[1] || 'Unknown'),
      phone: sanitize(contactWithLabel[2] || ''),
    };
  }

  const directPair = cleaned.match(/^([^(\n]+?)\s*\(\s*(\+?[0-9][0-9()\-\s]{7,})\s*\)$/);
  if (directPair) {
    return {
      name: sanitize(directPair[1] || 'Unknown'),
      phone: sanitize(directPair[2] || ''),
    };
  }

  const nameOnlyWithLabel = cleaned.match(/contact[:\s-]*([^\n]+)$/i);
  if (nameOnlyWithLabel) {
    return {
      name: sanitize(nameOnlyWithLabel[1] || 'Unknown'),
      phone: '',
    };
  }

  return {
    name: 'Unknown',
    phone: '',
  };
};

const extractBody = (text: string): string => {
  const match = text.match(/Message([\s\S]*)$/i);
  if (!match?.[1]) {
    return sanitize(text);
  }

  return sanitize(match[1])
    .replace(/^[:\-\s]+/, '')
    .trim();
};

const extractLine = (text: string): string => {
  const match = text.match(/Line([\s\S]*?)Contact/i);
  if (!match?.[1]) {
    return '';
  }
  return sanitize(match[1]);
};

const extractSequence = (text: string): string => {
  const lower = text.toLowerCase();
  const sequenceIndex = lower.lastIndexOf('sequence');
  if (sequenceIndex < 0) {
    return '';
  }
  const afterSequence = text.slice(sequenceIndex + 'sequence'.length);
  const messageOffset = afterSequence.toLowerCase().indexOf('message');
  if (messageOffset < 0) {
    return '';
  }
  const value = sanitize(afterSequence.slice(0, messageOffset));
  if (value.length === 0) {
    return '';
  }
  if (/\b(has\s+(sent|received)\s+an\s+sms|line|contact|user)\b/i.test(value)) {
    return '';
  }
  return value;
};

const normalizeUserName = (value: string): string => {
  const normalized = sanitize(value);
  if (normalized.length === 0) {
    return '';
  }
  const withoutDeviceContext = normalized.replace(/\s*\([^)]*\)\s*$/g, '').trim();
  return withoutDeviceContext.length > 0 ? withoutDeviceContext : normalized;
};

const normalizePhoneForConversationId = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 0) {
    return '';
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  return `+${digits}`;
};

const normalizeNameForConversationId = (name: string): string => {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  return normalized;
};

const classifyDirection = (text: string): Direction => {
  const normalized = text.toLowerCase();
  const directionPatterns = getDirectionPatternCache();
  const inboundMatch = directionPatterns.inboundPattern.test(normalized);
  const outboundMatch = directionPatterns.outboundPattern.test(normalized);

  if (inboundMatch && !outboundMatch) {
    return 'inbound';
  }
  if (outboundMatch && !inboundMatch) {
    return 'outbound';
  }
  if (inboundMatch && outboundMatch) {
    return normalized.indexOf('inbound') > normalized.indexOf('outbound') ? 'inbound' : 'outbound';
  }

  return 'unknown';
};

const isTrackableSmsEvent = (text: string): boolean => {
  const normalized = text.toLowerCase();
  if (!/\b(sms|text)\b/i.test(normalized)) {
    return false;
  }

  const directionPatterns = getDirectionPatternCache();
  return (
    SMS_EVENT_PATTERN.test(normalized) ||
    directionPatterns.inboundPattern.test(normalized) ||
    directionPatterns.outboundPattern.test(normalized)
  );
};

const normalizeMessages = (messages: HistoryMessage[]): MessagePoint[] => {
  const normalized: MessagePoint[] = [];
  for (const message of messages) {
    if (!message.ts) {
      continue;
    }

    const ts = Number.parseFloat(message.ts);
    if (Number.isNaN(ts)) {
      continue;
    }

    const text = extractHistoryText(message);
    if (text.length === 0) {
      continue;
    }
    if (!isTrackableSmsEvent(text)) {
      continue;
    }
    const contactFieldValue = extractAttachmentField(message, 'contact');
    const contact = extractContact(contactFieldValue || text);
    const body = extractBody(text);
    const lineName = extractAttachmentField(message, 'line') || extractLine(text);
    const userName = normalizeUserName(extractAttachmentField(message, 'user'));
    const sequenceName = extractAttachmentField(message, 'sequence') || extractSequence(text);
    const conversationId =
      normalizePhoneForConversationId(contact.phone) ||
      normalizeNameForConversationId(contact.name) ||
      message.thread_ts ||
      message.ts;

    normalized.push({
      direction: classifyDirection(text),
      text,
      body,
      contactName: contact.name,
      contactPhone: contact.phone,
      lineName,
      userName,
      sequenceName,
      conversationId,
      threadId: message.thread_ts || message.ts,
      ts,
    });
  }

  return normalized.sort((a, b) => a.ts - b.ts);
};

const dedupeLikelyDuplicateMessages = (messages: MessagePoint[]): MessagePoint[] => {
  const deduped: MessagePoint[] = [];
  const latestTsByFingerprint = new Map<string, number>();

  for (const message of messages) {
    const fingerprint = [
      message.direction,
      message.conversationId,
      message.sequenceName.trim().toLowerCase(),
      message.body.trim().toLowerCase(),
    ].join('|');
    const latestTs = latestTsByFingerprint.get(fingerprint);
    if (typeof latestTs === 'number' && message.ts - latestTs <= DUPLICATE_EVENT_WINDOW_SECONDS) {
      continue;
    }

    latestTsByFingerprint.set(fingerprint, message.ts);
    deduped.push(message);
  }

  return deduped;
};

const computeWindowStats = (messages: MessagePoint[]): WindowStats => {
  let inbound = 0;
  let outbound = 0;
  let unknown = 0;

  const threads = new Map<string, { firstOutbound?: number; replied: boolean }>();
  for (const message of messages) {
    if (message.direction === 'inbound') {
      inbound += 1;
    } else if (message.direction === 'outbound') {
      outbound += 1;
    } else {
      unknown += 1;
    }

    const entry = threads.get(message.conversationId) || { replied: false };
    if (message.direction === 'outbound' && entry.firstOutbound === undefined) {
      entry.firstOutbound = message.ts;
    }
    if (message.direction === 'inbound' && entry.firstOutbound !== undefined && message.ts > entry.firstOutbound) {
      entry.replied = true;
    }
    threads.set(message.conversationId, entry);
  }

  let outboundThreads = 0;
  let repliedThreads = 0;
  for (const thread of threads.values()) {
    if (thread.firstOutbound !== undefined) {
      outboundThreads += 1;
      if (thread.replied) {
        repliedThreads += 1;
      }
    }
  }

  const replyRatePct = outboundThreads > 0 ? (repliedThreads / outboundThreads) * 100 : 0;

  return {
    inbound,
    outbound,
    unknown,
    replyRatePct,
    repliedThreads,
    outboundThreads,
  };
};

const countOccurrences = (text: string, phrase: string): number => {
  const pattern = new RegExp(`\\b${escapeRegExp(phrase)}\\b`, 'gi');
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
};

const hasPhraseInText = (text: string, phrase: string): boolean => {
  return countOccurrences(text, phrase) > 0;
};

const tokenizeForAnalysis = (text: string): string[] => {
  return text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[^a-z0-9\s']/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token) && !/^\d+$/.test(token));
};

const trackedKeywordCounts = (messages: MessagePoint[], keywords: string[]): Array<[string, number]> => {
  const classified = messages.filter((message) => message.direction !== 'unknown');
  const source =
    getKeywordSource() === 'all'
      ? classified
      : (() => {
          const inbound = classified.filter((message) => message.direction === 'inbound');
          return inbound.length > 0 ? inbound : classified;
        })();

  const counts = new Map<string, number>();
  const texts = source.map((message) => message.body.toLowerCase());

  for (const keyword of keywords) {
    const total = texts.reduce((sum, text) => sum + countOccurrences(text, keyword), 0);
    counts.set(keyword, total);
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
};

const topKeywords = (messages: MessagePoint[], limit = 8): Array<[string, number]> => {
  const source = messages.filter((message) => message.direction === 'inbound');
  const classified = messages.filter((message) => message.direction !== 'unknown');
  const base = source.length > 0 ? source : classified;
  const counts = new Map<string, number>();

  for (const message of base) {
    const tokens = tokenizeForAnalysis(message.body);

    for (const token of tokens) {
      counts.set(token, (counts.get(token) || 0) + 1);
    }
  }

  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
};

const pluralize = (count: number, singular: string, plural: string): string => {
  return count === 1 ? singular : plural;
};

const formatPerformanceLine = (row: PerformanceRow): string => {
  const replyWord = pluralize(row.replies, 'reply', 'replies');
  const sentWord = pluralize(row.touches, 'sent text', 'sent texts');
  return `- ${row.label}: ${formatPercent(row.replyRatePct)} (${row.replies} ${replyWord} out of ${row.touches} ${sentWord})`;
};

const shortSnippet = (text: string, maxLen = 100): string => {
  const normalized = sanitize(text);
  if (normalized.length <= maxLen) {
    return normalized;
  }
  return `${normalized.slice(0, maxLen - 1)}…`;
};

const classifyInboundTheme = (body: string): string => {
  for (const rule of INBOUND_THEME_RULES) {
    if (rule.pattern.test(body)) {
      return rule.label;
    }
  }
  return 'General questions or updates';
};

const classifyOutboundStyle = (body: string): string => {
  for (const rule of OUTBOUND_STYLE_RULES) {
    if (rule.pattern.test(body)) {
      return rule.label;
    }
  }
  return 'General outreach message';
};

const classifyIntentTier = (body: string): IntentTier => {
  if (CANCELLATION_PATTERN.test(body) || WRONG_MARKET_PATTERN.test(body)) {
    return 'Negative / misaligned';
  }
  if (BOOKING_PATTERN.test(body)) {
    return 'High intent';
  }
  if (PRICING_PATTERN.test(body) || GROWTH_PATTERN.test(body)) {
    return 'Growth-oriented';
  }
  if (STAGE_PATTERN.test(body) || CONFUSION_PATTERN.test(body)) {
    return 'Curiosity / early stage';
  }
  return 'Curiosity / early stage';
};

const classifyOfferType = (sequenceName: string, body: string): string => {
  const haystack = `${sequenceName} ${body}`;
  if (HIRING_PATTERN.test(haystack)) {
    return 'Hiring offer';
  }
  if (RATES_PATTERN.test(haystack)) {
    return 'Rates offer';
  }
  if (WORKSHOP_PATTERN.test(haystack)) {
    return 'Workshop offer';
  }
  if (CHALLENGE_PATTERN.test(haystack)) {
    return 'Challenge offer';
  }
  if (/\bbook[- ]buyer\b/i.test(haystack)) {
    return 'Book buyer offer';
  }
  return 'General offer';
};

const classifyPositioningType = (body: string): string => {
  if (/\b(strategy call|book|schedule|availability|works best|let's map|map this out|quick call)\b/i.test(body)) {
    return 'Call invite';
  }
  if (/\b(out of curiosity|quick question|curious|where are you at)\b/i.test(body)) {
    return 'Curiosity hook';
  }
  if (/\b(we help|we work with|senior advisor|our clients|building leverage)\b/i.test(body)) {
    return 'Authority framing';
  }
  if (/\b(following up|did you get my text|just checking in|hope all is well)\b/i.test(body)) {
    return 'Follow-up';
  }
  if (/\b(guide|playbook|tour|video|resource)\b/i.test(body)) {
    return 'Nurture / content';
  }
  return 'Direct outreach';
};

const classifyLeadStage = (sequenceName: string, hadPriorInbound: boolean): 'Cold' | 'Warm' | 'Inbound magnet' => {
  if (sequenceName.trim().length > 0) {
    return 'Inbound magnet';
  }
  if (hadPriorInbound) {
    return 'Warm';
  }
  return 'Cold';
};

const formatDurationMinutes = (value: number): string => {
  if (!Number.isFinite(value) || value < 1) {
    return '<1 min';
  }
  if (value < 60) {
    return `${Math.round(value)} min`;
  }
  const hours = value / 60;
  if (hours < 24) {
    return `${hours.toFixed(1)} hr`;
  }
  return `${(hours / 24).toFixed(1)} days`;
};

const summarizePipelineStatus = ({
  replyRatePct,
  bookingRatePct,
  optOutRatePct,
}: {
  replyRatePct: number;
  bookingRatePct: number;
  optOutRatePct: number;
}): string => {
  const notes: string[] = [];
  if (replyRatePct < 25) {
    notes.push('reply rate is soft');
  } else if (replyRatePct >= 45) {
    notes.push('reply rate is healthy');
  }

  if (bookingRatePct < 10) {
    notes.push('booking conversion is soft');
  } else if (bookingRatePct >= 20) {
    notes.push('booking conversion is strong');
  }

  if (optOutRatePct >= 20) {
    notes.push('opt-outs are elevated');
  } else if (optOutRatePct <= 10) {
    notes.push('opt-outs are controlled');
  }

  if (notes.length === 0) {
    return 'stable';
  }

  return notes.join(', ');
};

const buildInboundThemeSummary = (messages: MessagePoint[], limit = 6): ThemeRow[] => {
  const inbound = messages.filter((message) => message.direction === 'inbound' && !isLowSignalInbound(message.body));
  const stats = new Map<string, { messages: number; conversations: Set<string>; sample: string }>();

  for (const message of inbound) {
    const label = classifyInboundTheme(message.body);
    const existing = stats.get(label) || {
      messages: 0,
      conversations: new Set<string>(),
      sample: shortSnippet(message.body),
    };
    existing.messages += 1;
    existing.conversations.add(message.conversationId);
    if (!existing.sample) {
      existing.sample = shortSnippet(message.body);
    }
    stats.set(label, existing);
  }

  return [...stats.entries()]
    .map(([label, value]) => ({
      label,
      messages: value.messages,
      conversations: value.conversations.size,
      sample: value.sample,
    }))
    .sort((a, b) => {
      if (b.conversations !== a.conversations) {
        return b.conversations - a.conversations;
      }
      if (b.messages !== a.messages) {
        return b.messages - a.messages;
      }
      return a.label.localeCompare(b.label);
    })
    .slice(0, limit);
};

const formatThemeLine = (row: ThemeRow): string => {
  const messageWord = pluralize(row.messages, 'message', 'messages');
  const contactWord = pluralize(row.conversations, 'contact', 'contacts');
  return `- ${row.label}: ${row.messages} ${messageWord} from ${row.conversations} ${contactWord} (example: "${row.sample}")`;
};

const formatSequencePerformanceLine = (row: PerformanceRow): string => {
  const contactWord = pluralize(row.touches, 'contact', 'contacts');
  const replyWord = pluralize(row.replies, 'contact replied', 'contacts replied');
  return `- ${row.label}: ${formatPercent(row.replyRatePct)} (${row.replies} ${replyWord} out of ${row.touches} ${contactWord})`;
};

const buildGroupedPerformance = (
  touches: OutreachTouch[],
  keySelector: (touch: OutreachTouch) => string,
  minSamples: number,
  limit: number,
): PerformanceRow[] => {
  const stats = new Map<string, { touches: number; replies: number }>();
  for (const touch of touches) {
    const key = keySelector(touch).trim();
    if (!key) {
      continue;
    }
    const existing = stats.get(key) || { touches: 0, replies: 0 };
    existing.touches += 1;
    if (touch.replied) {
      existing.replies += 1;
    }
    stats.set(key, existing);
  }

  return [...stats.entries()]
    .map(([label, value]) => ({
      label,
      touches: value.touches,
      replies: value.replies,
      replyRatePct: value.touches > 0 ? (value.replies / value.touches) * 100 : 0,
    }))
    .filter((row) => row.touches >= minSamples)
    .sort((a, b) => {
      if (b.replyRatePct !== a.replyRatePct) {
        return b.replyRatePct - a.replyRatePct;
      }
      if (b.touches !== a.touches) {
        return b.touches - a.touches;
      }
      return a.label.localeCompare(b.label);
    })
    .slice(0, limit);
};

const buildSequencePerformance = (touches: OutreachTouch[], minSamples: number, limit: number): PerformanceRow[] => {
  const bySequenceAndConversation = new Map<string, { label: string; replied: boolean }>();
  for (const touch of touches) {
    const label = touch.sequenceName.trim() || 'No sequence (manual/direct)';
    const key = `${label}::${touch.conversationId}`;
    const existing = bySequenceAndConversation.get(key);
    if (!existing) {
      bySequenceAndConversation.set(key, { label, replied: touch.replied });
      continue;
    }
    bySequenceAndConversation.set(key, {
      label,
      replied: existing.replied || touch.replied,
    });
  }

  const totals = new Map<string, { touches: number; replies: number }>();
  for (const value of bySequenceAndConversation.values()) {
    const existing = totals.get(value.label) || { touches: 0, replies: 0 };
    existing.touches += 1;
    if (value.replied) {
      existing.replies += 1;
    }
    totals.set(value.label, existing);
  }

  return [...totals.entries()]
    .map(([label, value]) => ({
      label,
      touches: value.touches,
      replies: value.replies,
      replyRatePct: value.touches > 0 ? (value.replies / value.touches) * 100 : 0,
    }))
    .filter((row) => row.touches >= minSamples)
    .sort((a, b) => {
      if (b.touches !== a.touches) {
        return b.touches - a.touches;
      }
      if (b.replyRatePct !== a.replyRatePct) {
        return b.replyRatePct - a.replyRatePct;
      }
      return a.label.localeCompare(b.label);
    })
    .slice(0, limit);
};

const buildOutboundStylePerformance = (
  touches: OutreachTouch[],
  minSamples: number,
  limit: number,
): PerformanceRow[] => {
  return buildGroupedPerformance(touches, (touch) => classifyOutboundStyle(touch.body), minSamples, limit);
};

const buildOutreachTouches = (messages: MessagePoint[], replyWindowSeconds: number): OutreachTouch[] => {
  const inboundByConversation = new Map<string, number[]>();
  for (const message of messages) {
    if (message.direction !== 'inbound') {
      continue;
    }
    const history = inboundByConversation.get(message.conversationId) || [];
    history.push(message.ts);
    inboundByConversation.set(message.conversationId, history);
  }

  for (const history of inboundByConversation.values()) {
    history.sort((a, b) => a - b);
  }

  const outboundCountByConversation = new Map<string, number>();
  const touches: OutreachTouch[] = [];
  for (const message of messages) {
    if (message.direction !== 'outbound') {
      continue;
    }

    const inboundHistory = inboundByConversation.get(message.conversationId) || [];
    const touchNumber = (outboundCountByConversation.get(message.conversationId) || 0) + 1;
    outboundCountByConversation.set(message.conversationId, touchNumber);
    const hadPriorInbound = inboundHistory.some((inboundTs) => inboundTs < message.ts);
    const replied = inboundHistory.some((inboundTs) => {
      return inboundTs > message.ts && inboundTs <= message.ts + replyWindowSeconds;
    });

    touches.push({
      conversationId: message.conversationId,
      body: message.body,
      lineName: message.lineName,
      sequenceName: message.sequenceName,
      stage: classifyLeadStage(message.sequenceName, hadPriorInbound),
      offerType: classifyOfferType(message.sequenceName, message.body),
      positioningType: classifyPositioningType(message.body),
      styleType: classifyOutboundStyle(message.body),
      touchNumber,
      ts: message.ts,
      replied,
    });
  }

  return touches;
};

const buildKeywordReplyPerformance = (touches: OutreachTouch[], keywords: string[]): PerformanceRow[] => {
  const rows: PerformanceRow[] = [];
  for (const keyword of keywords) {
    const normalizedKeyword = keyword.trim().toLowerCase();
    if (!normalizedKeyword) {
      continue;
    }

    let touchesCount = 0;
    let repliesCount = 0;
    for (const touch of touches) {
      if (!hasPhraseInText(touch.body.toLowerCase(), normalizedKeyword)) {
        continue;
      }
      touchesCount += 1;
      if (touch.replied) {
        repliesCount += 1;
      }
    }

    rows.push({
      label: normalizedKeyword,
      touches: touchesCount,
      replies: repliesCount,
      replyRatePct: touchesCount > 0 ? (repliesCount / touchesCount) * 100 : 0,
    });
  }

  return rows.sort((a, b) => {
    if (b.touches !== a.touches) {
      return b.touches - a.touches;
    }
    if (b.replyRatePct !== a.replyRatePct) {
      return b.replyRatePct - a.replyRatePct;
    }
    return a.label.localeCompare(b.label);
  });
};

const buildPhraseReplyPerformance = (
  touches: OutreachTouch[],
  minSamples: number,
  limit: number,
  minWords: number,
  maxWords: number,
): { top: PerformanceRow[]; bottom: PerformanceRow[] } => {
  const phraseStats = new Map<string, { touches: number; replies: number }>();

  for (const touch of touches) {
    const tokens = tokenizeForAnalysis(touch.body);
    if (tokens.length < minWords) {
      continue;
    }

    const seen = new Set<string>();
    for (let start = 0; start < tokens.length; start += 1) {
      for (let size = minWords; size <= maxWords; size += 1) {
        if (start + size > tokens.length) {
          continue;
        }
        const phrase = tokens.slice(start, start + size).join(' ');
        if (seen.has(phrase)) {
          continue;
        }
        seen.add(phrase);

        const current = phraseStats.get(phrase) || { touches: 0, replies: 0 };
        current.touches += 1;
        if (touch.replied) {
          current.replies += 1;
        }
        phraseStats.set(phrase, current);
      }
    }
  }

  const rows: PerformanceRow[] = [...phraseStats.entries()]
    .map(([label, stats]) => ({
      label,
      touches: stats.touches,
      replies: stats.replies,
      replyRatePct: stats.touches > 0 ? (stats.replies / stats.touches) * 100 : 0,
    }))
    .filter((row) => row.touches >= minSamples);

  const top = [...rows]
    .sort((a, b) => {
      if (b.replyRatePct !== a.replyRatePct) {
        return b.replyRatePct - a.replyRatePct;
      }
      if (b.touches !== a.touches) {
        return b.touches - a.touches;
      }
      return a.label.localeCompare(b.label);
    })
    .slice(0, limit);

  const bottom = [...rows]
    .sort((a, b) => {
      if (a.replyRatePct !== b.replyRatePct) {
        return a.replyRatePct - b.replyRatePct;
      }
      if (b.touches !== a.touches) {
        return b.touches - a.touches;
      }
      return a.label.localeCompare(b.label);
    })
    .slice(0, limit);

  return { top, bottom };
};

const isDailyChecklistPrompt = (prompt: string): boolean => {
  const normalized = prompt.toLowerCase();
  return (
    normalized.includes('daily report') ||
    normalized.includes('daily snapshot') ||
    normalized.includes('snapshot') ||
    normalized.includes('summary') ||
    normalized.includes('repost') ||
    normalized.includes('new inbound leads') ||
    normalized.includes('booking requests') ||
    normalized.includes('follow-ups needed')
  );
};

const BOOKING_PATTERN =
  /\b(book|booking|appointment|schedule|scheduled|availability|available|wednesday|thursday|friday|monday|tuesday|saturday|sunday|\d{1,2}:\d{2}\s*(am|pm)|strategy call|call)\b/i;
const BOOKED_CONFIRMATION_LINK_PATTERN = /(?:https?:\/\/)?vip\.physicaltherapybiz\.com\/call-booked(?:[/?#][^\s]*)?/i;
const RESCHEDULE_PATTERN =
  /\b(reschedule|re-?schedule|move|different time|would have to be|waiting for it|not going to be able to make)\b/i;
const CANCELLATION_PATTERN = /\b(cancel|cancellation|delete me off your list|remove me|unsubscribe|stop)\b/i;
const URGENT_PATTERN =
  /\b(stop|delete me|unsubscribe|complaint|pushback|wrong number|not going to be able to make|hectic)\b/i;
const LOW_SIGNAL_INBOUND_PATTERN =
  /^(thanks!?|thank you!?|yes!?|yep!?|ok!?|okay!?|awesome!?|sounds good!?|great!?|perfect!?|got it!?|i appreciate it!?)$/i;
const PRICING_PATTERN = /\b(price|pricing|cost|raise|rates?|cash pay|insurance|revenue)\b/i;
const GROWTH_PATTERN =
  /\b(grow|scale|new clients|business|practice|clinic|marketing|workshop|model|hiring|hire|team|staff|operator)\b/i;
const STAGE_PATTERN =
  /\b(early stage|not yet|few years out|side hustle|full time|just graduated|near future|thinking|planning|just checking)\b/i;
const CONFUSION_PATTERN =
  /\b(not sure where to start|wormhole|didn't download|for pts|for PTs|wrong fit|not the right fit)\b/i;
const WRONG_MARKET_PATTERN =
  /\b(chiropractor|pilates|not.*pt|not.*physical therapist|wrong fit|not the right fit|not relevant|not for me)\b/i;
const HIRING_PATTERN = /\b(hiring|hire|staff|team|practitioner)\b/i;
const RATES_PATTERN = /\b(raise your rates|rates?|pricing|price|cost|cash pay|insurance)\b/i;
const WORKSHOP_PATTERN = /\b(workshop|playbook|tour|doc toni)\b/i;
const CHALLENGE_PATTERN = /\b(challenge|5-day)\b/i;
const SMS_EVENT_PATTERN = /\bhas\s+(sent|received)\s+an\s+sms\b/i;
const DECISION_MAKER_PATTERN =
  /\b(i own|owner|my clinic|my practice|our clinic|our office|we opened|we are in year|year \d|full time|decision maker|clinic owner)\b/i;
const OPERATOR_PAIN_PATTERN =
  /\b(hiring|hire|pricing|price|rates?|capacity|full|revenue|ceiling|stuck|scale|grow|leverage|cash pay|insurance|working harder|not raised)\b/i;
const TIMELINE_SOON_PATTERN =
  /\b(now|right now|currently|this week|next week|this month|next month|this quarter|q1|q2|soon|asap|immediately|today)\b/i;
const TIMELINE_FAR_PATTERN = /\b(in \d+\s+years?|few years|2 years|3 years|someday|eventually|later|future)\b/i;
const EARLY_NURTURE_PATTERN =
  /\b(early stage|planning|just checking|curious|learning|few years out|not yet|thinking|future)\b/i;
const QUALIFICATION_GAP_PATTERN =
  /\b(not sure where to start|can you resend|send your last message|what do you mean|how does this work|where are you at|side hustle|hybrid|cash pay)\b/i;

const INBOUND_THEME_RULES: Array<{ label: string; pattern: RegExp }> = [
  { label: 'Opt-outs or unsubscribe requests', pattern: CANCELLATION_PATTERN },
  { label: 'Reschedule or timing conflict', pattern: RESCHEDULE_PATTERN },
  { label: 'Booking or call interest', pattern: BOOKING_PATTERN },
  { label: 'Pricing, cost, or cash-pay questions', pattern: PRICING_PATTERN },
  { label: 'Growth and business-building goals', pattern: GROWTH_PATTERN },
  { label: 'Stage/readiness updates', pattern: STAGE_PATTERN },
  { label: 'Confusion or fit concerns', pattern: CONFUSION_PATTERN },
];

const OUTBOUND_STYLE_RULES: Array<{ label: string; pattern: RegExp }> = [
  {
    label: 'Follow-up reminder',
    pattern: /\b(following up|did you get my text|just checking in|hope all is well)\b/i,
  },
  {
    label: 'Scheduling call-to-action',
    pattern: /\b(strategy call|schedule|availability|am or pm|weekdays|works best|book|call)\b/i,
  },
  {
    label: 'Qualification question',
    pattern: /\b(out of curiosity|quick question|where are you at|full time|side hustle|cash or hybrid|background)\b/i,
  },
  {
    label: 'Value framing',
    pattern: /\b(we help|we work with|map this out|clarity|strong fit|building leverage)\b/i,
  },
];

type LeadRow = {
  conversationId: string;
  label: string;
  ts: number;
};

type DailyBucket =
  | 'booking_priority'
  | 'high_intent_growth'
  | 'qualification_needed'
  | 'early_nurture'
  | 'admin_schedule'
  | 'admin_opt_out'
  | 'admin_disqualified';

type DailyAssignment = LeadRow & {
  bucket: DailyBucket;
};

const labelFor = (message: MessagePoint): string => {
  const contact = message.contactPhone ? `${message.contactName} (${message.contactPhone})` : message.contactName;
  return `${contact}: ${message.body.slice(0, 140)}`;
};

const uniqueRows = (messages: MessagePoint[], matcher: (message: MessagePoint) => boolean): LeadRow[] => {
  const latestByConversation = new Map<string, LeadRow>();
  for (const message of messages) {
    if (!matcher(message)) {
      continue;
    }

    latestByConversation.set(message.conversationId, {
      conversationId: message.conversationId,
      label: labelFor(message),
      ts: message.ts,
    });
  }

  return [...latestByConversation.values()].sort((a, b) => a.ts - b.ts);
};

const isLowSignalInbound = (body: string): boolean => {
  const normalized = sanitize(body).toLowerCase();
  const wordCount = normalized.split(/\s+/).filter((part) => part.length > 0).length;
  return LOW_SIGNAL_INBOUND_PATTERN.test(normalized) || wordCount <= 2;
};

const firstInboundRows = (messages: MessagePoint[], dayStart: number): LeadRow[] => {
  const firstByConversation = new Map<string, MessagePoint>();
  for (const message of messages) {
    if (message.direction !== 'inbound') {
      continue;
    }
    if (!firstByConversation.has(message.conversationId)) {
      firstByConversation.set(message.conversationId, message);
    }
  }

  return [...firstByConversation.values()]
    .filter((message) => message.ts >= dayStart)
    .filter((message) => !isLowSignalInbound(message.body))
    .map((message) => ({
      conversationId: message.conversationId,
      label: labelFor(message),
      ts: message.ts,
    }))
    .sort((a, b) => a.ts - b.ts);
};

const buildConversationMap = (messages: MessagePoint[]): Map<string, MessagePoint[]> => {
  const byConversation = new Map<string, MessagePoint[]>();
  for (const message of messages) {
    if (message.direction === 'unknown') {
      continue;
    }
    const existing = byConversation.get(message.conversationId) || [];
    existing.push(message);
    byConversation.set(message.conversationId, existing);
  }
  return byConversation;
};

const buildConversationSummaries = (messages: MessagePoint[], replyWindowSeconds: number): ConversationSummary[] => {
  const byConversation = buildConversationMap(messages);
  const summaries: ConversationSummary[] = [];

  for (const [conversationId, history] of byConversation.entries()) {
    history.sort((a, b) => a.ts - b.ts);
    const firstOutboundIndex = history.findIndex((message) => message.direction === 'outbound');
    const firstOutboundTs = firstOutboundIndex >= 0 ? history[firstOutboundIndex].ts : undefined;
    const sequenceName =
      history.find((message) => message.direction === 'outbound' && message.sequenceName.trim().length > 0)
        ?.sequenceName || '';
    const contactSource =
      [...history].reverse().find((message) => message.contactPhone.length > 0 || message.contactName !== 'Unknown') ||
      history[0];
    const contactLabel = contactSource?.contactPhone
      ? `${contactSource.contactName} (${contactSource.contactPhone})`
      : contactSource?.contactName || 'Unknown';

    let lastOutboundTs: number | undefined;
    let outboundCount = 0;
    let inboundCount = 0;
    let outboundSeen = 0;
    let firstInboundAfterOutboundTs: number | undefined;
    let firstBookingTs: number | undefined;
    let booked = false;
    let optOut = false;
    let scheduleChange = false;
    let hasHighIntent = false;
    let hasGrowthIntent = false;
    let hasCuriositySignal = false;
    let hasNegativeSignal = false;
    let hasPositiveReply = false;
    let firstOptOutTouch: number | undefined;
    let firstOptOutTs: number | undefined;
    let messagesToBook: number | undefined;
    let latestInbound: MessagePoint | undefined;

    for (const [index, message] of history.entries()) {
      if (message.direction === 'outbound') {
        outboundCount += 1;
        outboundSeen += 1;
        lastOutboundTs = message.ts;
        if (BOOKED_CONFIRMATION_LINK_PATTERN.test(message.body)) {
          booked = true;
          if (firstBookingTs === undefined) {
            firstBookingTs = message.ts;
          }
          if (messagesToBook === undefined && firstOutboundIndex >= 0) {
            messagesToBook = index - firstOutboundIndex + 1;
          }
        }
        continue;
      }

      if (message.direction !== 'inbound') {
        continue;
      }

      inboundCount += 1;
      latestInbound = message;

      if (CANCELLATION_PATTERN.test(message.body)) {
        optOut = true;
        if (firstOptOutTouch === undefined) {
          firstOptOutTouch = outboundSeen > 0 ? outboundSeen : 1;
        }
        if (firstOptOutTs === undefined) {
          firstOptOutTs = message.ts;
        }
      }

      if (RESCHEDULE_PATTERN.test(message.body)) {
        scheduleChange = true;
      }

      const isAfterOutbound = firstOutboundTs === undefined || message.ts > firstOutboundTs;
      if (!isAfterOutbound) {
        continue;
      }

      if (
        firstOutboundTs !== undefined &&
        firstInboundAfterOutboundTs === undefined &&
        message.ts <= firstOutboundTs + replyWindowSeconds
      ) {
        firstInboundAfterOutboundTs = message.ts;
      }

      const intent = classifyIntentTier(message.body);
      if (intent === 'High intent') {
        hasHighIntent = true;
      } else if (intent === 'Growth-oriented') {
        hasGrowthIntent = true;
      } else if (intent === 'Curiosity / early stage') {
        hasCuriositySignal = true;
      } else if (intent === 'Negative / misaligned') {
        hasNegativeSignal = true;
      }

      if (!isLowSignalInbound(message.body) && intent !== 'Negative / misaligned') {
        hasPositiveReply = true;
      }

      if (BOOKING_PATTERN.test(message.body) && !CANCELLATION_PATTERN.test(message.body)) {
        booked = true;
        if (firstBookingTs === undefined) {
          firstBookingTs = message.ts;
        }
        if (messagesToBook === undefined && firstOutboundIndex >= 0) {
          messagesToBook = index - firstOutboundIndex + 1;
        }
      }
    }

    summaries.push({
      conversationId,
      contactLabel,
      sequenceName,
      firstOutboundTs,
      lastOutboundTs,
      firstInboundAfterOutboundTs,
      firstBookingTs,
      outboundCount,
      inboundCount,
      replied: firstInboundAfterOutboundTs !== undefined,
      booked,
      optOut,
      scheduleChange,
      hasHighIntent,
      hasGrowthIntent,
      hasCuriositySignal,
      hasNegativeSignal,
      hasPositiveReply,
      firstOptOutTouch,
      firstOptOutTs,
      messagesToBook,
      latestInbound,
    });
  }

  return summaries;
};

const buildPipelineMetrics = (summaries: ConversationSummary[], sinceTs?: number) => {
  const started = summaries.filter((summary) => {
    if (summary.outboundCount === 0) return false;
    if (sinceTs !== undefined) {
      return (summary.lastOutboundTs || 0) >= sinceTs;
    }
    return true;
  });
  const startedConversationIds = new Set(started.map((summary) => summary.conversationId));
  const replied = summaries.filter((summary) => {
    if (!startedConversationIds.has(summary.conversationId)) return false;
    if (!summary.replied) return false;
    if (sinceTs !== undefined) {
      return (summary.firstInboundAfterOutboundTs || 0) >= sinceTs;
    }
    return true;
  }).length;
  const booked = summaries.filter((summary) => {
    if (!startedConversationIds.has(summary.conversationId)) return false;
    if (!summary.booked) return false;
    if (sinceTs !== undefined) {
      return (summary.firstBookingTs || 0) >= sinceTs;
    }
    return true;
  }).length;
  const optOuts = summaries.filter((summary) => {
    if (!startedConversationIds.has(summary.conversationId)) return false;
    if (!summary.optOut) return false;
    if (sinceTs !== undefined) {
      return (summary.firstOptOutTs || 0) >= sinceTs;
    }
    return true;
  }).length;
  const noResponse = started.filter((summary) => !summary.replied).length;
  const highIntent = started.filter((summary) => summary.hasHighIntent).length;
  const replyRatePct = started.length > 0 ? (replied / started.length) * 100 : 0;
  const bookingRatePct = started.length > 0 ? (booked / started.length) * 100 : 0;
  const optOutRatePct = started.length > 0 ? (optOuts / started.length) * 100 : 0;

  const replyMinutes = started
    .filter((summary) => summary.firstOutboundTs !== undefined && summary.firstInboundAfterOutboundTs !== undefined)
    .map((summary) => ((summary.firstInboundAfterOutboundTs || 0) - (summary.firstOutboundTs || 0)) / 60)
    .filter((minutes) => minutes >= 0);
  const avgFirstReplyMinutes =
    replyMinutes.length > 0 ? replyMinutes.reduce((sum, value) => sum + value, 0) / replyMinutes.length : 0;

  const bookDepths = started
    .map((summary) => summary.messagesToBook)
    .filter((value): value is number => value !== undefined && value > 0);
  const avgMessagesToBook =
    bookDepths.length > 0 ? bookDepths.reduce((sum, value) => sum + value, 0) / bookDepths.length : 0;

  return {
    started,
    startedCount: started.length,
    replied,
    booked,
    optOuts,
    noResponse,
    highIntent,
    replyRatePct,
    bookingRatePct,
    optOutRatePct,
    avgFirstReplyMinutes,
    avgMessagesToBook,
  };
};

const buildIntentBreakdown = (summaries: ConversationSummary[]) => {
  const stats = new Map<IntentTier, { count: number; sample: string }>();
  const ordered: IntentTier[] = ['High intent', 'Growth-oriented', 'Curiosity / early stage', 'Negative / misaligned'];

  for (const summary of summaries) {
    if (summary.inboundCount === 0) {
      continue;
    }
    const bucket: IntentTier = summary.hasNegativeSignal
      ? 'Negative / misaligned'
      : summary.hasHighIntent
        ? 'High intent'
        : summary.hasGrowthIntent
          ? 'Growth-oriented'
          : 'Curiosity / early stage';
    const current = stats.get(bucket) || { count: 0, sample: '' };
    current.count += 1;
    if (!current.sample && summary.latestInbound?.body) {
      current.sample = shortSnippet(summary.latestInbound.body, 120);
    }
    stats.set(bucket, current);
  }

  return ordered.map((label) => ({
    label,
    count: stats.get(label)?.count || 0,
    sample: stats.get(label)?.sample || '',
  }));
};

const buildConversationPerformance = (
  touches: OutreachTouch[],
  keySelector: (touch: OutreachTouch) => string,
  minSamples: number,
  limit: number,
): PerformanceRow[] => {
  const byKeyConversation = new Map<string, { label: string; replied: boolean }>();
  for (const touch of touches) {
    const label = keySelector(touch).trim();
    if (!label) {
      continue;
    }
    const key = `${label}::${touch.conversationId}`;
    const existing = byKeyConversation.get(key);
    if (!existing) {
      byKeyConversation.set(key, { label, replied: touch.replied });
      continue;
    }
    byKeyConversation.set(key, {
      label,
      replied: existing.replied || touch.replied,
    });
  }

  const totals = new Map<string, { touches: number; replies: number }>();
  for (const value of byKeyConversation.values()) {
    const current = totals.get(value.label) || { touches: 0, replies: 0 };
    current.touches += 1;
    if (value.replied) {
      current.replies += 1;
    }
    totals.set(value.label, current);
  }

  return [...totals.entries()]
    .map(([label, value]) => ({
      label,
      touches: value.touches,
      replies: value.replies,
      replyRatePct: value.touches > 0 ? (value.replies / value.touches) * 100 : 0,
    }))
    .filter((row) => row.touches >= minSamples)
    .sort((a, b) => {
      if (b.replyRatePct !== a.replyRatePct) {
        return b.replyRatePct - a.replyRatePct;
      }
      if (b.touches !== a.touches) {
        return b.touches - a.touches;
      }
      return a.label.localeCompare(b.label);
    })
    .slice(0, limit);
};

type SequenceLabelGroup = {
  key: string;
  label: string;
};

const selectPreferredSequenceLabel = ({ candidate, current }: { candidate: string; current: string }): string => {
  if (!current || current === NO_SEQUENCE_LABEL) {
    return candidate;
  }
  if (candidate === NO_SEQUENCE_LABEL) {
    return current;
  }

  const candidateHasLowercase = /[a-z]/.test(candidate);
  const currentHasLowercase = /[a-z]/.test(current);
  if (candidateHasLowercase !== currentHasLowercase) {
    return candidateHasLowercase ? candidate : current;
  }
  if (candidate.length !== current.length) {
    return candidate.length > current.length ? candidate : current;
  }
  return candidate.localeCompare(current) < 0 ? candidate : current;
};

const getSequenceLabelGroup = (rawLabel: string): SequenceLabelGroup => {
  const normalized = rawLabel.trim().replace(/\s+/g, ' ');
  if (!normalized || normalized.toLowerCase() === NO_SEQUENCE_LABEL.toLowerCase()) {
    return { key: '__no_sequence__', label: NO_SEQUENCE_LABEL };
  }

  const abMatch = normalized.match(EXPLICIT_AB_VERSION_PATTERN);
  const abVersion = (abMatch?.[1] || abMatch?.[2] || '').toUpperCase();

  const withoutAbVariant = abVersion ? normalized.replace(EXPLICIT_AB_VERSION_PATTERN, '').trim() : normalized;
  let simplified = withoutAbVariant
    .replace(TRAILING_SEQUENCE_VERSION_PATTERN, '')
    .replace(TRAILING_GENERIC_VERSION_PATTERN, '')
    .replace(TRAILING_YEAR_PATTERN, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!simplified) {
    simplified = withoutAbVariant || normalized;
  }

  const keyBase = simplified
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
  const baseKey = keyBase.length > 0 ? keyBase : '__no_sequence__';
  const key = abVersion ? `${baseKey}|version_${abVersion.toLowerCase()}` : baseKey;
  const label = abVersion ? `${simplified} - Version ${abVersion}` : simplified;

  return {
    key,
    label,
  };
};

const buildSequenceConversionPerformance = (
  touches: OutreachTouch[],
  summaries: ConversationSummary[],
  minSamples: number,
  limit: number,
  mode: SequenceAttributionMode = 'touch',
  sinceTs?: number,
): SequencePerformanceRow[] => {
  const summaryByConversation = new Map(summaries.map((summary) => [summary.conversationId, summary]));

  if (mode === 'origin') {
    const touchesByConversation = new Map<string, OutreachTouch[]>();
    for (const touch of touches) {
      const existing = touchesByConversation.get(touch.conversationId) || [];
      existing.push(touch);
      touchesByConversation.set(touch.conversationId, existing);
    }

    const totals = new Map<
      string,
      Omit<SequencePerformanceRow, 'replyRatePct' | 'optOutRatePct'> & {
        label: string;
      }
    >();
    for (const summary of summaries) {
      if (summary.outboundCount <= 0) {
        continue;
      }
      const conversationTouches = (touchesByConversation.get(summary.conversationId) || []).sort((a, b) => a.ts - b.ts);
      const firstSequencedTouch = conversationTouches.find((touch) => touch.sequenceName.trim().length > 0);
      const group = getSequenceLabelGroup(firstSequencedTouch?.sequenceName.trim() || NO_SEQUENCE_LABEL);
      const current = totals.get(group.key) || {
        label: group.label,
        conversations: 0,
        replies: 0,
        highIntent: 0,
        positiveReplies: 0,
        booked: 0,
        optOuts: 0,
      };
      current.label = selectPreferredSequenceLabel({
        candidate: group.label,
        current: current.label,
      });

      const hasOutboundInWindow = sinceTs === undefined || conversationTouches.some((t) => t.ts >= sinceTs);

      if (!hasOutboundInWindow) {
        continue;
      }

      if (hasOutboundInWindow) {
        current.conversations += 1;
      }
      if (summary.replied && (sinceTs === undefined || (summary.firstInboundAfterOutboundTs || 0) >= sinceTs)) {
        current.replies += 1;
      }
      if (
        summary.hasPositiveReply &&
        (sinceTs === undefined || (summary.firstInboundAfterOutboundTs || 0) >= sinceTs)
      ) {
        current.positiveReplies += 1;
      }
      if (summary.hasHighIntent && (sinceTs === undefined || (summary.firstInboundAfterOutboundTs || 0) >= sinceTs)) {
        current.highIntent += 1;
      }
      if (summary.booked && (sinceTs === undefined || (summary.firstBookingTs || 0) >= sinceTs)) {
        current.booked += 1;
      }
      if (summary.optOut && (sinceTs === undefined || (summary.firstOptOutTs || 0) >= sinceTs)) {
        current.optOuts += 1;
      }
      totals.set(group.key, current);
    }

    // Log removed

    return [...totals.values()]
      .map((value) => ({
        label: value.label,
        conversations: value.conversations,
        replies: value.replies,
        highIntent: value.highIntent,
        positiveReplies: value.positiveReplies,
        booked: value.booked,
        optOuts: value.optOuts,
        replyRatePct: value.conversations > 0 ? (value.replies / value.conversations) * 100 : 0,
        optOutRatePct: value.conversations > 0 ? (value.optOuts / value.conversations) * 100 : 0,
      }))
      .filter((row) => row.conversations + row.replies + row.booked + row.optOuts >= minSamples)
      .sort((a, b) => {
        if (b.conversations !== a.conversations) {
          return b.conversations - a.conversations;
        }
        if (b.replyRatePct !== a.replyRatePct) {
          return b.replyRatePct - a.replyRatePct;
        }
        return a.label.localeCompare(b.label);
      })
      .slice(0, limit);
  }

  const touchesByConversation = new Map<string, OutreachTouch[]>();
  for (const touch of touches) {
    const existing = touchesByConversation.get(touch.conversationId) || [];
    existing.push(touch);
    touchesByConversation.set(touch.conversationId, existing);
  }
  const bookingSequenceByConversation = new Map<string, string>();
  for (const summary of summaries) {
    if (!summary.booked) {
      continue;
    }
    const conversationTouches = touchesByConversation.get(summary.conversationId) || [];
    if (conversationTouches.length === 0) {
      continue;
    }

    const bookingCutoffTs = summary.firstBookingTs ?? Number.POSITIVE_INFINITY;
    let latestTouch: OutreachTouch | undefined;
    for (const touch of conversationTouches) {
      if (touch.ts > bookingCutoffTs) {
        continue;
      }
      if (!latestTouch || touch.ts > latestTouch.ts) {
        latestTouch = touch;
      }
    }
    if (!latestTouch) {
      latestTouch = conversationTouches.reduce(
        (current, touch) => {
          if (!current || touch.ts > current.ts) {
            return touch;
          }
          return current;
        },
        undefined as OutreachTouch | undefined,
      );
    }
    if (!latestTouch) {
      continue;
    }

    let latestSequencedTouch: OutreachTouch | undefined;
    for (const touch of conversationTouches) {
      if (touch.ts > bookingCutoffTs) {
        continue;
      }
      if (touch.sequenceName.trim().length === 0) {
        continue;
      }
      if (!latestSequencedTouch || touch.ts > latestSequencedTouch.ts) {
        latestSequencedTouch = touch;
      }
    }
    if (!latestSequencedTouch) {
      for (const touch of conversationTouches) {
        if (touch.sequenceName.trim().length === 0) {
          continue;
        }
        if (!latestSequencedTouch || touch.ts > latestSequencedTouch.ts) {
          latestSequencedTouch = touch;
        }
      }
    }

    const sequenceLabelGroup = getSequenceLabelGroup(
      latestTouch.sequenceName.trim() || latestSequencedTouch?.sequenceName.trim() || NO_SEQUENCE_LABEL,
    );
    bookingSequenceByConversation.set(summary.conversationId, sequenceLabelGroup.key);
  }
  const bySequenceConversation = new Map<
    string,
    {
      label: string;
      labelKey: string;
      conversationId: string;
      replied: boolean;
    }
  >();

  for (const touch of touches) {
    const group = getSequenceLabelGroup(touch.sequenceName.trim() || NO_SEQUENCE_LABEL);
    const key = `${group.key}::${touch.conversationId}`;
    const existing = bySequenceConversation.get(key);
    if (!existing) {
      bySequenceConversation.set(key, {
        label: group.label,
        labelKey: group.key,
        conversationId: touch.conversationId,
        replied: touch.replied,
      });
      continue;
    }
    bySequenceConversation.set(key, {
      label: selectPreferredSequenceLabel({
        candidate: group.label,
        current: existing.label,
      }),
      labelKey: group.key,
      conversationId: touch.conversationId,
      replied: existing.replied || touch.replied,
    });
  }

  const totals = new Map<
    string,
    Omit<SequencePerformanceRow, 'replyRatePct' | 'optOutRatePct'> & {
      label: string;
    }
  >();
  for (const row of bySequenceConversation.values()) {
    const summary = summaryByConversation.get(row.conversationId);
    if (!summary) {
      continue;
    }
    const current = totals.get(row.labelKey) || {
      label: row.label,
      conversations: 0,
      replies: 0,
      highIntent: 0,
      positiveReplies: 0,
      booked: 0,
      optOuts: 0,
    };
    current.label = selectPreferredSequenceLabel({
      candidate: row.label,
      current: current.label,
    });
    current.conversations += 1;
    if (row.replied) {
      current.replies += 1;
    }
    if (summary.hasPositiveReply) {
      current.positiveReplies += 1;
    }
    if (summary.hasHighIntent) {
      current.highIntent += 1;
    }
    if (summary.booked && bookingSequenceByConversation.get(row.conversationId) === row.labelKey) {
      current.booked += 1;
    }
    if (summary.optOut) {
      current.optOuts += 1;
    }
    totals.set(row.labelKey, current);
  }

  return [...totals.values()]
    .map((value) => ({
      label: value.label,
      conversations: value.conversations,
      replies: value.replies,
      highIntent: value.highIntent,
      positiveReplies: value.positiveReplies,
      booked: value.booked,
      optOuts: value.optOuts,
      replyRatePct: value.conversations > 0 ? (value.replies / value.conversations) * 100 : 0,
      optOutRatePct: value.conversations > 0 ? (value.optOuts / value.conversations) * 100 : 0,
    }))
    .filter((row) => row.conversations >= minSamples)
    .sort((a, b) => {
      if (b.conversations !== a.conversations) {
        return b.conversations - a.conversations;
      }
      if (b.replyRatePct !== a.replyRatePct) {
        return b.replyRatePct - a.replyRatePct;
      }
      return a.label.localeCompare(b.label);
    })
    .slice(0, limit);
};

const formatSequenceConversionLines = (rows: SequencePerformanceRow[]): string[] => {
  if (rows.length === 0) {
    return ['- none found'];
  }
  return rows.map((row) => {
    return `- ${row.label}: ${row.conversations} conversations, ${row.replies} replied (${formatPercent(row.replyRatePct)}), ${row.highIntent} high-intent, ${row.booked} booked, ${row.optOuts} opt-outs (${formatPercent(row.optOutRatePct)})`;
  });
};

const buildSequenceVolumeRows = (messages: MessagePoint[], limit: number): SequenceVolumeRow[] => {
  const byConversation = buildConversationMap(messages);
  const totals = new Map<
    string,
    {
      label: string;
      conversations: Set<string>;
      outboundTexts: number;
      inboundTexts: number;
      totalTexts: number;
    }
  >();

  for (const [conversationId, history] of byConversation.entries()) {
    history.sort((a, b) => a.ts - b.ts);
    const outboundRows = history.filter((message) => message.direction === 'outbound');
    const inboundRows = history.filter((message) => message.direction === 'inbound');
    if (outboundRows.length === 0 && inboundRows.length === 0) {
      continue;
    }

    const sequenceLabel =
      [...history]
        .reverse()
        .find((message) => message.sequenceName.trim().length > 0)
        ?.sequenceName.trim() || NO_SEQUENCE_LABEL;
    const group = getSequenceLabelGroup(sequenceLabel);
    const current = totals.get(group.key) || {
      label: group.label,
      conversations: new Set<string>(),
      outboundTexts: 0,
      inboundTexts: 0,
      totalTexts: 0,
    };
    current.label = selectPreferredSequenceLabel({
      candidate: group.label,
      current: current.label,
    });
    current.conversations.add(conversationId);
    current.outboundTexts += outboundRows.length;
    current.inboundTexts += inboundRows.length;
    current.totalTexts += outboundRows.length + inboundRows.length;
    totals.set(group.key, current);
  }

  return [...totals.values()]
    .map((value) => ({
      label: value.label,
      conversations: value.conversations.size,
      outboundTexts: value.outboundTexts,
      inboundTexts: value.inboundTexts,
      totalTexts: value.totalTexts,
    }))
    .sort((a, b) => {
      if (b.totalTexts !== a.totalTexts) {
        return b.totalTexts - a.totalTexts;
      }
      if (b.conversations !== a.conversations) {
        return b.conversations - a.conversations;
      }
      return a.label.localeCompare(b.label);
    })
    .slice(0, limit);
};

const summarizeSequenceVolumeTotals = (rows: SequenceVolumeRow[]): SequenceVolumeTotals => {
  return rows.reduce(
    (totals, row) => {
      totals.sequences += 1;
      totals.conversations += row.conversations;
      totals.outboundTexts += row.outboundTexts;
      totals.inboundTexts += row.inboundTexts;
      totals.totalTexts += row.totalTexts;
      return totals;
    },
    {
      sequences: 0,
      conversations: 0,
      outboundTexts: 0,
      inboundTexts: 0,
      totalTexts: 0,
    },
  );
};

const buildRequiredMessageStructureMetrics = (
  touches: OutreachTouch[],
  summaries: ConversationSummary[],
): RequiredStructureMetric[] => {
  const summaryByConversation = new Map(summaries.map((summary) => [summary.conversationId, summary]));

  return REQUIRED_MESSAGE_STRUCTURE_DEFINITIONS.map((definition) => {
    const touchesForStructure = touches.filter((touch) => definition.matches(touch));
    const conversationIds = new Set(touchesForStructure.map((touch) => touch.conversationId));
    const repliedConversationIds = new Set(
      touchesForStructure.filter((touch) => touch.replied).map((touch) => touch.conversationId),
    );

    let bookedWhenReplied = 0;
    for (const conversationId of repliedConversationIds) {
      if (summaryByConversation.get(conversationId)?.booked) {
        bookedWhenReplied += 1;
      }
    }

    const conversations = conversationIds.size;
    const repliedConversations = repliedConversationIds.size;

    return {
      label: definition.label,
      conversations,
      repliedConversations,
      bookedWhenReplied,
      replyRatePct: conversations > 0 ? (repliedConversations / conversations) * 100 : 0,
      bookingWhenRepliedRatePct: repliedConversations > 0 ? (bookedWhenReplied / repliedConversations) * 100 : 0,
    };
  });
};

const buildOptOutBySequence = (
  sequenceRows: SequencePerformanceRow[],
  minSamples: number,
  limit: number,
): SequencePerformanceRow[] => {
  return sequenceRows
    .filter((row) => row.conversations >= minSamples)
    .sort((a, b) => {
      if (b.optOutRatePct !== a.optOutRatePct) {
        return b.optOutRatePct - a.optOutRatePct;
      }
      if (b.optOuts !== a.optOuts) {
        return b.optOuts - a.optOuts;
      }
      return a.label.localeCompare(b.label);
    })
    .slice(0, limit);
};

const buildOptOutByTouchNumber = (summaries: ConversationSummary[]) => {
  const firstTouchOptOut = summaries.filter(
    (summary) => summary.optOut && (summary.firstOptOutTouch || 99) <= 1,
  ).length;
  const laterTouchOptOut = summaries.filter((summary) => summary.optOut && (summary.firstOptOutTouch || 0) > 1).length;
  return {
    firstTouchOptOut,
    laterTouchOptOut,
  };
};

const buildOptOutByPositioning = (
  touches: OutreachTouch[],
  summaries: ConversationSummary[],
  limit: number,
): PerformanceRow[] => {
  const summaryByConversation = new Map(summaries.map((summary) => [summary.conversationId, summary]));
  const stats = new Map<string, { touches: number; optOuts: number }>();

  for (const touch of touches) {
    const label = touch.positioningType;
    const current = stats.get(label) || { touches: 0, optOuts: 0 };
    current.touches += 1;
    if (summaryByConversation.get(touch.conversationId)?.optOut) {
      current.optOuts += 1;
    }
    stats.set(label, current);
  }

  return [...stats.entries()]
    .map(([label, value]) => ({
      label,
      touches: value.touches,
      replies: value.optOuts,
      replyRatePct: value.touches > 0 ? (value.optOuts / value.touches) * 100 : 0,
    }))
    .sort((a, b) => {
      if (b.replyRatePct !== a.replyRatePct) {
        return b.replyRatePct - a.replyRatePct;
      }
      if (b.replies !== a.replies) {
        return b.replies - a.replies;
      }
      return a.label.localeCompare(b.label);
    })
    .slice(0, limit);
};

const buildFrictionFlags = ({
  touches,
  dayOptOuts,
  weekOptOuts,
}: {
  touches: OutreachTouch[];
  dayOptOuts: number;
  weekOptOuts: number;
}): string[] => {
  const flags: string[] = [];
  const qualificationCold = touches.filter(
    (touch) => touch.styleType === 'Qualification question' && touch.stage === 'Cold',
  );
  const qualificationColdReplyRate =
    qualificationCold.length > 0
      ? (qualificationCold.filter((touch) => touch.replied).length / qualificationCold.length) * 100
      : 0;
  if (qualificationCold.length >= 2 && qualificationColdReplyRate < 20) {
    flags.push('Qualification questions are underperforming in cold outreach.');
  }

  const lateFollowUps = touches.filter((touch) => touch.styleType === 'Follow-up reminder' && touch.touchNumber >= 3);
  const lateFollowUpReplyRate =
    lateFollowUps.length > 0 ? (lateFollowUps.filter((touch) => touch.replied).length / lateFollowUps.length) * 100 : 0;
  if (lateFollowUps.length >= 2 && lateFollowUpReplyRate < 15) {
    flags.push('Follow-ups after touch #2 are weak. Rewrite later follow-up messaging.');
  }

  const weeklyOptOutDailyAverage = weekOptOuts / 7;
  if (dayOptOuts >= 2 && weeklyOptOutDailyAverage > 0 && dayOptOuts > weeklyOptOutDailyAverage * 1.3) {
    flags.push('Opt-outs are running above weekly average. Check campaign targeting and tone.');
  }

  return flags;
};

const followUpRows = (messages: MessagePoint[], dayStart: number): LeadRow[] => {
  const byConversation = buildConversationMap(messages);
  const followUps: LeadRow[] = [];
  for (const history of byConversation.values()) {
    history.sort((a, b) => a.ts - b.ts);
    const last = history[history.length - 1];
    if (last?.direction !== 'inbound') {
      continue;
    }
    if (last.ts < dayStart) {
      continue;
    }
    if (CANCELLATION_PATTERN.test(last.body)) {
      continue;
    }
    if (isLowSignalInbound(last.body)) {
      continue;
    }
    followUps.push({
      conversationId: last.conversationId,
      label: labelFor(last),
      ts: last.ts,
    });
  }
  return followUps.sort((a, b) => a.ts - b.ts);
};

const buildDailyAssignments = (messages24h: MessagePoint[], allMessages: MessagePoint[]): DailyAssignment[] => {
  const inbound24h = messages24h.filter((message) => message.direction === 'inbound');
  const byConversationDay = new Map<string, MessagePoint[]>();
  for (const message of inbound24h) {
    const rows = byConversationDay.get(message.conversationId) || [];
    rows.push(message);
    byConversationDay.set(message.conversationId, rows);
  }

  const byConversationAll = buildConversationMap(allMessages);
  const assignments: DailyAssignment[] = [];

  for (const [conversationId, dayRows] of byConversationDay.entries()) {
    dayRows.sort((a, b) => a.ts - b.ts);
    const latest = dayRows[dayRows.length - 1];
    if (!latest) {
      continue;
    }

    const allRows = (byConversationAll.get(conversationId) || [])
      .filter((message) => message.direction === 'inbound')
      .sort((a, b) => a.ts - b.ts);
    const contextRows = allRows.length > 0 ? allRows : dayRows;
    const latestMeaningfulInbound = [...contextRows].reverse().find((row) => !isLowSignalInbound(row.body));
    const qualificationAnchor = latestMeaningfulInbound || latest;
    const dayText = dayRows.map((row) => row.body).join(' ');
    const allText = contextRows.map((row) => row.body).join(' ');

    // Evaluate signals from the full conversation window, not only the latest/day message.
    const hasOptOut = contextRows.some((row) => CANCELLATION_PATTERN.test(row.body));
    const hasScheduleChange = contextRows.some((row) => RESCHEDULE_PATTERN.test(row.body));
    const hasDisqualified = contextRows.some(
      (row) => WRONG_MARKET_PATTERN.test(row.body) || CONFUSION_PATTERN.test(row.body),
    );
    const hasBooking = contextRows.some((row) => BOOKING_PATTERN.test(row.body));

    const hasOwnerSignal = DECISION_MAKER_PATTERN.test(allText);
    const hasPainSignal = OPERATOR_PAIN_PATTERN.test(allText);
    const hasNearTermTimeline =
      TIMELINE_SOON_PATTERN.test(allText) ||
      dayRows.some((row) =>
        /\b(this|next)\s+(week|month)|\d{1,2}:\d{2}\s*(am|pm)|wednesday|thursday|friday|monday|tuesday\b/i.test(
          row.body,
        ),
      );
    const hasFarTimeline = TIMELINE_FAR_PATTERN.test(allText) || EARLY_NURTURE_PATTERN.test(dayText);
    const isStrictHighIntentGrowth = hasOwnerSignal && hasPainSignal && hasNearTermTimeline && !hasFarTimeline;
    const isQualificationNeeded =
      QUALIFICATION_GAP_PATTERN.test(allText) ||
      (!isLowSignalInbound(qualificationAnchor.body) &&
        !hasBooking &&
        !hasDisqualified &&
        !hasScheduleChange &&
        !hasOptOut &&
        !isStrictHighIntentGrowth &&
        !hasFarTimeline);

    let bucket: DailyBucket | undefined;
    if (hasOptOut) {
      bucket = 'admin_opt_out';
    } else if (hasScheduleChange) {
      bucket = 'admin_schedule';
    } else if (hasDisqualified) {
      bucket = 'admin_disqualified';
    } else if (hasBooking) {
      bucket = 'booking_priority';
    } else if (isStrictHighIntentGrowth) {
      bucket = 'high_intent_growth';
    } else if (isQualificationNeeded) {
      bucket = 'qualification_needed';
    } else if (hasFarTimeline) {
      bucket = 'early_nurture';
    } else if (!isLowSignalInbound(qualificationAnchor.body)) {
      bucket = 'qualification_needed';
    }

    if (!bucket) {
      continue;
    }

    const pickLatestMatch = (matcher: (row: MessagePoint) => boolean): MessagePoint | undefined => {
      const matches = contextRows.filter(matcher);
      if (matches.length === 0) {
        return undefined;
      }
      return matches[matches.length - 1];
    };

    const representative =
      bucket === 'booking_priority'
        ? pickLatestMatch((row) => BOOKING_PATTERN.test(row.body) && !CANCELLATION_PATTERN.test(row.body)) || latest
        : bucket === 'high_intent_growth'
          ? pickLatestMatch((row) => OPERATOR_PAIN_PATTERN.test(row.body) || HIRING_PATTERN.test(row.body)) || latest
          : bucket === 'admin_schedule'
            ? pickLatestMatch((row) => RESCHEDULE_PATTERN.test(row.body)) || latest
            : bucket === 'admin_opt_out'
              ? pickLatestMatch((row) => CANCELLATION_PATTERN.test(row.body)) || latest
              : bucket === 'admin_disqualified'
                ? pickLatestMatch((row) => WRONG_MARKET_PATTERN.test(row.body) || CONFUSION_PATTERN.test(row.body)) ||
                  latestMeaningfulInbound ||
                  latest
                : latestMeaningfulInbound || latest;

    assignments.push({
      bucket,
      conversationId,
      label: labelFor(representative),
      ts: representative.ts,
    });
  }

  return assignments.sort((a, b) => a.ts - b.ts);
};

const classifyRepFromLineName = (lineName: string): string => {
  const normalized = lineName.trim().toLowerCase();
  const digitsOnly = lineName.replace(/\D/g, '');
  if (normalized.includes('jack') || digitsOnly.startsWith('817') || digitsOnly.includes('817')) {
    return 'Jack Licata';
  }
  if (normalized.includes('brandon')) {
    return 'Brandon Erwin';
  }
  return 'Other/Unknown';
};

const classifyRepFromUserName = (userName: string): string => {
  const normalized = userName.trim().toLowerCase();
  if (normalized.length === 0 || normalized === 'unknown user') {
    return '';
  }
  if (normalized.includes('jack licata') || normalized === 'jack') {
    return 'Jack Licata';
  }
  if (normalized.includes('brandon erwin') || normalized === 'brandon') {
    return 'Brandon Erwin';
  }
  if (normalized.includes('renee duran') || normalized === 'renee') {
    return 'Renee Duran';
  }
  if (normalized.includes('justin pfluger') || normalized === 'justin') {
    return 'Justin Pfluger';
  }
  return userName.trim();
};

const resolveDisplayLineName = (lineName: string): string => {
  const normalized = lineName.trim();
  return normalized.length > 0 ? normalized : 'Unknown line';
};

const buildConversationLineRepAssignments = (
  messages: MessagePoint[],
): Map<string, { lineName: string; repLabel: string; userName: string }> => {
  const byConversation = buildConversationMap(messages);
  const assignments = new Map<string, { lineName: string; repLabel: string; userName: string }>();

  for (const [conversationId, history] of byConversation.entries()) {
    const outboundRows = history.filter((message) => message.direction === 'outbound').sort((a, b) => a.ts - b.ts);
    if (outboundRows.length === 0) {
      continue;
    }

    const latestWithLine = [...outboundRows].reverse().find((message) => message.lineName.trim().length > 0);
    const latestWithUser = [...outboundRows].reverse().find((message) => message.userName.trim().length > 0);
    const representative = latestWithLine || outboundRows[outboundRows.length - 1];
    const lineName = resolveDisplayLineName(representative?.lineName || '');
    const userName = latestWithUser?.userName || '';
    const repFromUser = classifyRepFromUserName(userName);
    assignments.set(conversationId, {
      lineName,
      repLabel: repFromUser || classifyRepFromLineName(lineName),
      userName,
    });
  }

  return assignments;
};

const buildDailySnapshotSectionLines = ({
  allMessages,
  dailyWindow,
  messages24h,
  nowTs,
  sequenceAttributionMessages,
}: {
  allMessages: MessagePoint[];
  dailyWindow: DailyWindowContext;
  messages24h: MessagePoint[];
  nowTs: number;
  sequenceAttributionMessages?: MessagePoint[];
}): { lines: string[]; startedCount: number; summary: DailySnapshotSummaryMetrics } => {
  const replyWindowSeconds = WEEK_SECONDS;
  const dayStart = dailyWindow.windowStartTs;
  // Calculate week summaries first as they are needed for sequence attribution
  const weekSummaries = buildConversationSummaries(allMessages, replyWindowSeconds);

  // Note: summaries (24h) are still used for other daily metrics if needed, but for sequence attribution we use weekSummaries + filtering
  const summaries = buildConversationSummaries(messages24h, replyWindowSeconds);
  const dayPipeline = buildPipelineMetrics(summaries);
  const dayTouches = buildOutreachTouches(messages24h, replyWindowSeconds);
  const attributionSource =
    sequenceAttributionMessages && sequenceAttributionMessages.length > 0 ? sequenceAttributionMessages : allMessages;
  const attributionTouches = buildOutreachTouches(attributionSource, replyWindowSeconds);
  const sequencePerformanceAll = buildSequenceConversionPerformance(
    attributionTouches,
    weekSummaries,
    1,
    Number.MAX_SAFE_INTEGER,
    'origin',
    dayStart,
  );
  const structureMetrics = buildRequiredMessageStructureMetrics(dayTouches, summaries);
  // weekSummaries already calculated above
  const weekPipeline = buildPipelineMetrics(weekSummaries);
  const weekTouches = buildOutreachTouches(allMessages, replyWindowSeconds);
  const weekStructureMetrics = buildRequiredMessageStructureMetrics(weekTouches, weekSummaries);
  const weekSequencePerformanceAll = buildSequenceConversionPerformance(
    weekTouches,
    weekSummaries,
    1,
    Number.MAX_SAFE_INTEGER,
    'origin',
  );

  const optOutCampaignRows = [...sequencePerformanceAll]
    .filter((row) => row.optOuts > 0)
    .sort((a, b) => {
      if (b.optOuts !== a.optOuts) {
        return b.optOuts - a.optOuts;
      }
      return b.optOutRatePct - a.optOutRatePct;
    })
    .slice(0, 5);
  const topBookingDriver = [...structureMetrics]
    .filter((row) => row.conversations > 0 && row.repliedConversations > 0)
    .sort((a, b) => {
      if (b.bookingWhenRepliedRatePct !== a.bookingWhenRepliedRatePct) {
        return b.bookingWhenRepliedRatePct - a.bookingWhenRepliedRatePct;
      }
      if (b.repliedConversations !== a.repliedConversations) {
        return b.repliedConversations - a.repliedConversations;
      }
      return b.replyRatePct - a.replyRatePct;
    })[0];
  const topPerformingSequence = [...sequencePerformanceAll]
    .filter((row) => row.booked > 0)
    .sort((a, b) => {
      if (b.booked !== a.booked) {
        return b.booked - a.booked;
      }
      if (b.replyRatePct !== a.replyRatePct) {
        return b.replyRatePct - a.replyRatePct;
      }
      return b.conversations - a.conversations;
    })[0];
  const highestOptOutSequence = [...optOutCampaignRows].sort((a, b) => {
    if (b.optOuts !== a.optOuts) {
      return b.optOuts - a.optOuts;
    }
    return b.optOutRatePct - a.optOutRatePct;
  })[0];
  const sortSequenceRowsForKpi = (a: SequencePerformanceRow, b: SequencePerformanceRow): number => {
    if (b.conversations !== a.conversations) {
      return b.conversations - a.conversations;
    }
    if (b.booked !== a.booked) {
      return b.booked - a.booked;
    }
    if (b.replyRatePct !== a.replyRatePct) {
      return b.replyRatePct - a.replyRatePct;
    }
    return b.optOuts - a.optOuts;
  };
  const sequenceKpiLimit = getDailySequenceKpiLimit();
  const sequenceKpiRows = [...sequencePerformanceAll]
    // Filter was previously conversations > 0, now allow any activity
    .filter((row) => row.conversations > 0 || row.replies > 0 || row.booked > 0 || row.optOuts > 0)
    .sort(sortSequenceRowsForKpi)
    .slice(0, sequenceKpiLimit);
  const sequenceVolume24hAll = buildSequenceVolumeRows(messages24h, Number.MAX_SAFE_INTEGER);
  const sequenceVolume24hByLabel = new Map(sequenceVolume24hAll.map((row) => [row.label, row]));
  const fallbackSequenceKpiRows =
    sequenceKpiRows.length > 0
      ? sequenceKpiRows
      : [...sequencePerformanceAll]
          .filter((row) => row.conversations > 0 || row.replies > 0 || row.booked > 0 || row.optOuts > 0)
          .sort(sortSequenceRowsForKpi)
          .slice(0, sequenceKpiLimit);
  const bookingRatePerReplyPct = dayPipeline.replied > 0 ? (dayPipeline.booked / dayPipeline.replied) * 100 : 0;
  const rolling7DayBookingPer100 =
    weekPipeline.startedCount > 0 ? (weekPipeline.booked / weekPipeline.startedCount) * 100 : 0;
  const quickTakeParts: string[] = [];
  if (dayPipeline.booked > 0) {
    quickTakeParts.push(
      `${dayPipeline.booked} booking${dayPipeline.booked === 1 ? '' : 's'} came from ${dayPipeline.startedCount} outbound conversation${dayPipeline.startedCount === 1 ? '' : 's'}`,
    );
  } else {
    quickTakeParts.push(
      `No bookings came from ${dayPipeline.startedCount} outbound conversation${dayPipeline.startedCount === 1 ? '' : 's'}`,
    );
  }
  if (topPerformingSequence) {
    quickTakeParts.push(`${topPerformingSequence.label} led conversion`);
  }
  if (highestOptOutSequence) {
    quickTakeParts.push(`${highestOptOutSequence.label} showed the highest opt-out pressure`);
  } else {
    quickTakeParts.push('opt-out pressure stayed low');
  }
  const quickTake = `${quickTakeParts.join('; ')}.`;
  const isSunday = new Intl.DateTimeFormat('en-US', {
    timeZone: getReportTimezone(),
    weekday: 'short',
  })
    .format(new Date(nowTs * 1000))
    .toLowerCase()
    .startsWith('sun');
  const weekTopStructure = [...weekStructureMetrics]
    .filter((row) => row.conversations > 0 && row.repliedConversations > 0)
    .sort((a, b) => {
      if (b.bookingWhenRepliedRatePct !== a.bookingWhenRepliedRatePct) {
        return b.bookingWhenRepliedRatePct - a.bookingWhenRepliedRatePct;
      }
      return b.repliedConversations - a.repliedConversations;
    })[0];
  const weekTopSequence = [...weekSequencePerformanceAll]
    .filter((row) => row.booked > 0)
    .sort((a, b) => {
      const aBookingRate = a.conversations > 0 ? (a.booked / a.conversations) * 100 : 0;
      const bBookingRate = b.conversations > 0 ? (b.booked / b.conversations) * 100 : 0;
      if (bBookingRate !== aBookingRate) {
        return bBookingRate - aBookingRate;
      }
      return b.booked - a.booked;
    })[0];
  const weekOptOutRiskSequence = [...weekSequencePerformanceAll]
    .filter((row) => row.optOuts > 0)
    .sort((a, b) => {
      if (b.optOutRatePct !== a.optOutRatePct) {
        return b.optOutRatePct - a.optOutRatePct;
      }
      return b.optOuts - a.optOuts;
    })[0];

  const summary: DailySnapshotSummaryMetrics = {
    bookingRatePerConversationPct: dayPipeline.bookingRatePct,
    bookingRatePerReplyPct,
    bookings: dayPipeline.booked,
    outboundConversations: dayPipeline.startedCount,
    optOuts: dayPipeline.optOuts,
    replies: dayPipeline.replied,
    replyRatePct: dayPipeline.replyRatePct,
    rolling7DayBookingPer100,
    topBookingDriver: topBookingDriver
      ? {
          bookingWhenRepliedRatePct: topBookingDriver.bookingWhenRepliedRatePct,
          conversations: topBookingDriver.conversations,
          label: topBookingDriver.label,
          repliedConversations: topBookingDriver.repliedConversations,
          replyRatePct: topBookingDriver.replyRatePct,
        }
      : undefined,
    topPerformingSequence: topPerformingSequence
      ? {
          bookings: topPerformingSequence.booked,
          conversations: topPerformingSequence.conversations,
          label: topPerformingSequence.label,
          replyRatePct: topPerformingSequence.replyRatePct,
        }
      : undefined,
    optOutRiskSequence: highestOptOutSequence
      ? {
          label: highestOptOutSequence.label,
          optOutRatePct: highestOptOutSequence.optOutRatePct,
          optOuts: highestOptOutSequence.optOuts,
        }
      : undefined,
  };

  const lines = [
    '*Core Metrics*',
    `- Outbound Conversations: ${dayPipeline.startedCount}`,
    `- Reply Rate: ${formatPercent(dayPipeline.replyRatePct)}`,
    `- Bookings: ${dayPipeline.booked}`,
    `- Opt Outs: ${dayPipeline.optOuts}`,
    '',
    '*Revenue Signal*',
    `- Booking Rate Per Conversation: ${formatPercent(dayPipeline.bookingRatePct)}`,
    `- Booking Rate Per Reply: ${formatPercent(bookingRatePerReplyPct)}`,
    `- Rolling 7 Day Booking Per 100 Conversations: ${rolling7DayBookingPer100.toFixed(1)}`,
    '',
    '*Top Booking Driver*',
    ...(topBookingDriver
      ? [
          `- Message Type: ${topBookingDriver.label}`,
          `- Reply Rate: ${formatPercent(topBookingDriver.replyRatePct)}`,
          `- Booking When Replied: ${formatPercent(topBookingDriver.bookingWhenRepliedRatePct)}`,
        ]
      : ['- Message Type: none found', '- Reply Rate: 0.0%', '- Booking When Replied: 0.0%']),
    '',
    '*Top Performing Sequence*',
    ...(topPerformingSequence
      ? [
          `- ${topPerformingSequence.label}`,
          `- Conversations: ${topPerformingSequence.conversations}`,
          `- Bookings: ${topPerformingSequence.booked}`,
          `- Reply Rate: ${formatPercent(topPerformingSequence.replyRatePct)}`,
        ]
      : ['- none found']),
    '',
    '*Sequence Specific KPIs (Daily Window)*',
    '- Replies received counts unique contacts (max 1 reply per contact).',
    ...(fallbackSequenceKpiRows.length > 0
      ? fallbackSequenceKpiRows.map((row) => {
          const sequenceVolume = sequenceVolume24hByLabel.get(row.label);
          const sent = sequenceVolume?.outboundTexts ?? row.conversations;
          const repliesReceived = row.replies;
          const responseRate = sent > 0 ? (repliesReceived / sent) * 100 : 0;
          const bookingWhenRepliedRate = row.replies > 0 ? (row.booked / row.replies) * 100 : 0;
          const bookingCloseRateDisplay =
            row.replies > 0
              ? `${formatPercent(bookingWhenRepliedRate)} close rate (${row.booked}/${row.replies} replied)`
              : 'n/a close rate (0 replies)';
          return `- ${row.label}: sent ${sent}, replies received ${repliesReceived} (${formatPercent(
            responseRate,
          )} response rate), bookings ${row.booked} (${bookingCloseRateDisplay}), opt-outs ${row.optOuts} (${formatPercent(
            row.optOutRatePct,
          )})`;
        })
      : ['- none found']),
    '',
    '*Risk Signal*',
    ...(highestOptOutSequence
      ? [
          `- Sequence With Most Opt Outs: ${highestOptOutSequence.label}`,
          `- Opt Outs: ${highestOptOutSequence.optOuts}`,
          `- Opt Out Rate: ${formatPercent(highestOptOutSequence.optOutRatePct)}`,
        ]
      : ['- Sequence With Most Opt Outs: none', '- Opt Outs: 0', '- Opt Out Rate: 0.0%']),
    '',
    '*Quick Take*',
    `- ${quickTake}`,
  ];

  if (isSunday) {
    const weekTopSequenceBookingRate =
      weekTopSequence && weekTopSequence.conversations > 0
        ? (weekTopSequence.booked / weekTopSequence.conversations) * 100
        : 0;
    lines.push('');
    lines.push('*WEEK TO DATE SUMMARY*');
    lines.push(`- Total Conversations: ${weekPipeline.startedCount}`);
    lines.push(`- Average Reply Rate: ${formatPercent(weekPipeline.replyRatePct)}`);
    lines.push(`- Total Bookings: ${weekPipeline.booked}`);
    lines.push(
      `- Highest Converting Structure: ${
        weekTopStructure
          ? `${weekTopStructure.label} (${formatPercent(weekTopStructure.bookingWhenRepliedRatePct)} booking when replied)`
          : 'none found'
      }`,
    );
    lines.push(
      `- Highest Converting Sequence: ${
        weekTopSequence
          ? `${weekTopSequence.label} (${formatPercent(weekTopSequenceBookingRate)} booking per conversation)`
          : 'none found'
      }`,
    );
    lines.push(
      `- Sequence With Highest Opt Out Rate: ${
        weekOptOutRiskSequence
          ? `${weekOptOutRiskSequence.label} (${formatPercent(weekOptOutRiskSequence.optOutRatePct)})`
          : 'none found'
      }`,
    );
  }

  return {
    lines,
    startedCount: dayPipeline.startedCount,
    summary,
  };
};

const buildDailyChecklistReport = (
  messages24h: MessagePoint[],
  allMessages: MessagePoint[],
  nowTs: number,
  dailyWindow: DailyWindowContext,
  sequenceAttributionMessages?: MessagePoint[],
): { reportText: string; summary: DailySnapshotSummary } => {
  const timezone = getReportTimezone();
  const todayLabel = new Date(dailyWindow.windowStartTs * 1000).toLocaleDateString('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
  const assignments24h = buildConversationLineRepAssignments(messages24h);
  const assignments7d = buildConversationLineRepAssignments(allMessages);
  const buckets = new Map<
    string,
    {
      conversationIds24h: Set<string>;
      conversationIds7d: Set<string>;
      lineName: string;
      repLabel: string;
    }
  >();

  for (const [conversationId, assignment] of assignments24h.entries()) {
    const key = `${assignment.repLabel}::${assignment.lineName}`;
    const bucket = buckets.get(key) || {
      lineName: assignment.lineName,
      repLabel: assignment.repLabel,
      conversationIds24h: new Set<string>(),
      conversationIds7d: new Set<string>(),
    };
    bucket.conversationIds24h.add(conversationId);
    buckets.set(key, bucket);
  }

  for (const [conversationId, assignment] of assignments7d.entries()) {
    const key = `${assignment.repLabel}::${assignment.lineName}`;
    const bucket = buckets.get(key);
    if (!bucket) {
      continue;
    }
    bucket.conversationIds7d.add(conversationId);
  }

  const sectionResults = [...buckets.values()]
    .map((bucket) => {
      const messagesForRep24h = messages24h.filter((message) => bucket.conversationIds24h.has(message.conversationId));
      const messagesForRep7d = allMessages.filter((message) => bucket.conversationIds7d.has(message.conversationId));
      const messagesForRepAttribution = (sequenceAttributionMessages || allMessages).filter((message) =>
        bucket.conversationIds7d.has(message.conversationId),
      );
      const section = buildDailySnapshotSectionLines({
        allMessages: messagesForRep7d,
        dailyWindow,
        messages24h: messagesForRep24h,
        nowTs,
        sequenceAttributionMessages: messagesForRepAttribution,
      });
      return {
        ...bucket,
        ...section,
      };
    })
    .filter((result) => result.startedCount >= getRepSectionMinOutboundConversations())
    .sort((a, b) => {
      if (b.startedCount !== a.startedCount) {
        return b.startedCount - a.startedCount;
      }
      return a.repLabel.localeCompare(b.repLabel);
    });

  const overallSnapshot = buildDailySnapshotSectionLines({
    allMessages,
    dailyWindow,
    messages24h,
    nowTs,
    sequenceAttributionMessages,
  });
  const summary: DailySnapshotSummary = {
    dateLabel: todayLabel,
    timezone,
    windowLabel: dailyWindow.label,
    ...overallSnapshot.summary,
  };

  const lines = [
    '*PT BIZ - DAILY SMS SNAPSHOT*',
    `Date: ${todayLabel}`,
    `Time Range: ${dailyWindow.label} (${timezone})`,
    '',
  ];

  if (sectionResults.length === 0) {
    lines.push('');
    lines.push('*Split By Line / Rep (Daily Window)*');
    lines.push('- No outbound conversations found in the configured daily window.');
    return {
      reportText: lines.join('\n'),
      summary,
    };
  }

  lines.push('*Split By Line / Rep (Daily Window)*');
  for (const section of sectionResults) {
    lines.push('');
    lines.push(`*Rep: ${section.repLabel}*`);
    lines.push(`- Line: ${section.lineName}`);
    lines.push(...section.lines);
  }

  return {
    reportText: lines.join('\n'),
    summary,
  };
};

export const buildDailyChecklistReportBundle = ({
  messages24h,
  allMessages,
  nowTs,
  dailyWindow,
  sequenceAttributionMessages,
}: {
  messages24h: MessagePoint[];
  allMessages: MessagePoint[];
  nowTs: number;
  dailyWindow: DailyWindowContext;
  sequenceAttributionMessages?: MessagePoint[];
}): { reportText: string; summary: DailySnapshotSummary } => {
  return buildDailyChecklistReport(messages24h, allMessages, nowTs, dailyWindow, sequenceAttributionMessages);
};

export const buildDailySnapshotBlocks = (summary: DailySnapshotSummary): (KnownBlock | Block)[] => {
  const formatRate = (pct: number, numerator: number, denominator: number): string => {
    if (denominator <= 0) {
      return 'n/a';
    }
    return `${pct.toFixed(1)}% (${numerator}/${denominator})`;
  };

  const bookingPerConversation = formatRate(
    summary.bookingRatePerConversationPct,
    summary.bookings,
    summary.outboundConversations,
  );
  const bookingPerReply = formatRate(summary.bookingRatePerReplyPct, summary.bookings, summary.replies);
  const replyRate = formatRate(summary.replyRatePct, summary.replies, summary.outboundConversations);

  const topSequence = summary.topPerformingSequence
    ? `${summary.topPerformingSequence.label}\nBookings: ${summary.topPerformingSequence.bookings} • Reply Rate: ${summary.topPerformingSequence.replyRatePct.toFixed(1)}%`
    : 'none';
  const riskSignal = summary.optOutRiskSequence
    ? `${summary.optOutRiskSequence.label}\nOpt-outs: ${summary.optOutRiskSequence.optOuts} • Opt-out Rate: ${summary.optOutRiskSequence.optOutRatePct.toFixed(1)}%`
    : 'none';

  return [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Daily SMS Snapshot',
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `Date: ${summary.dateLabel} • Time Range: ${summary.windowLabel} (${summary.timezone})`,
        },
      ],
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Outbound Conversations:*\n${summary.outboundConversations}`,
        },
        {
          type: 'mrkdwn',
          text: `*Reply Rate:*\n${replyRate}`,
        },
        {
          type: 'mrkdwn',
          text: `*Bookings:*\n${summary.bookings}`,
        },
        {
          type: 'mrkdwn',
          text: `*Opt-Outs:*\n${summary.optOuts}`,
        },
      ],
    },
    { type: 'divider' },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Booking Rate / Conversation:*\n${bookingPerConversation}`,
        },
        {
          type: 'mrkdwn',
          text: `*Booking Rate / Reply:*\n${bookingPerReply}`,
        },
        {
          type: 'mrkdwn',
          text: `*Rolling 7-Day Bookings / 100:*\n${summary.rolling7DayBookingPer100.toFixed(1)}`,
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Top Performing Sequence*\n${topSequence}`,
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Risk Signal*\n${riskSignal}`,
      },
    },
  ];
};
const pctDiffFromWeeklyAverage = (daily: number, weeklyTotal: number): string => {
  const weeklyAverage = weeklyTotal / 7;
  if (weeklyAverage === 0) {
    return 'n/a';
  }

  const delta = ((daily - weeklyAverage) / weeklyAverage) * 100;
  const rounded = Math.round(delta * 10) / 10;
  const prefix = rounded > 0 ? '+' : '';
  return `${prefix}${rounded}%`;
};

const formatPercent = (value: number): string => {
  return `${value.toFixed(1)}%`;
};

const fetchHistoryFromSlack = async (
  client: WebClient,
  channelId: string,
  oldest: number,
): Promise<HistoryMessage[]> => {
  const messages: HistoryMessage[] = [];
  let cursor = '';

  do {
    const result = await client.conversations.history({
      channel: channelId,
      cursor: cursor || undefined,
      inclusive: true,
      limit: 200,
      oldest: oldest.toString(),
    });

    const pageMessages = (result.messages || []) as HistoryMessage[];
    messages.push(...pageMessages);
    cursor = result.response_metadata?.next_cursor || '';
  } while (cursor);

  return messages;
};

const fetchHistory = async ({
  channelId,
  client,
  forceRefresh,
  logger,
  oldest,
}: {
  channelId: string;
  client: WebClient;
  forceRefresh?: boolean;
  logger?: Pick<Logger, 'debug' | 'warn'>;
  oldest: number;
}): Promise<HistoryMessage[]> => {
  const oldestWindow = Math.floor(oldest / 60) * 60;
  const cacheKey = `${channelId}:${oldestWindow}`;
  const shouldForceRefresh = Boolean(forceRefresh);
  const now = Date.now();
  const cacheTtlMs = getAnalyticsCacheTtlSeconds() * 1000;
  const cacheMaxStaleMs = getAnalyticsCacheMaxStaleSeconds() * 1000;

  const cached = historyCache.get(cacheKey);
  if (!shouldForceRefresh && cached && now - cached.fetchedAt <= cacheTtlMs) {
    logger?.debug?.(
      `[telemetry] aloware.history_cache_hit ${JSON.stringify({
        channel_id: channelId,
        oldest_window: oldestWindow,
        size: cached.messages.length,
      })}`,
    );
    return cached.messages;
  }

  if (!shouldForceRefresh && cached?.inFlight) {
    logger?.debug?.(
      `[telemetry] aloware.history_cache_inflight ${JSON.stringify({
        channel_id: channelId,
        oldest_window: oldestWindow,
      })}`,
    );
    return cached.inFlight;
  }

  const staleMessages = cached?.messages || [];
  const staleFetchedAt = cached?.fetchedAt || 0;
  const inFlight = (async (): Promise<HistoryMessage[]> => {
    try {
      const messages = await timeOperation({
        logger,
        name: 'aloware.fetch_history',
        context: {
          cache_status: shouldForceRefresh ? 'force_refresh' : staleMessages.length > 0 ? 'refresh' : 'miss',
          channel_id: channelId,
          oldest_window: oldestWindow,
        },
        fn: async () => fetchHistoryFromSlack(client, channelId, oldest),
      });

      historyCache.set(cacheKey, {
        fetchedAt: Date.now(),
        messages,
      });
      return messages;
    } catch (error) {
      if (staleMessages.length > 0 && now - staleFetchedAt <= cacheMaxStaleMs) {
        logger?.warn?.(
          `[telemetry] aloware.history_cache_stale_fallback ${JSON.stringify({
            channel_id: channelId,
            oldest_window: oldestWindow,
            stale_age_seconds: Math.floor((now - staleFetchedAt) / 1000),
          })}`,
        );
        historyCache.set(cacheKey, {
          fetchedAt: staleFetchedAt,
          messages: staleMessages,
        });
        return staleMessages;
      }
      historyCache.delete(cacheKey);
      throw error;
    }
  })();

  historyCache.set(cacheKey, {
    fetchedAt: staleFetchedAt,
    inFlight,
    messages: staleMessages,
  });

  try {
    return await inFlight;
  } finally {
    const latest = historyCache.get(cacheKey);
    if (latest?.inFlight === inFlight) {
      if (latest.messages.length === 0 && latest.fetchedAt === 0) {
        historyCache.delete(cacheKey);
      } else {
        historyCache.set(cacheKey, {
          fetchedAt: latest.fetchedAt,
          messages: latest.messages,
        });
      }
    }
  }
};

const buildReportFromRawMessages = ({
  attributionRawMessages,
  channelId,
  logger,
  nowTs,
  prompt,
  rawMessages,
  reportBuildStartMs,
}: {
  attributionRawMessages?: HistoryMessage[];
  channelId?: string;
  logger?: Pick<Logger, 'debug' | 'warn'>;
  nowTs: number;
  prompt: string;
  rawMessages: HistoryMessage[];
  reportBuildStartMs: number;
}): AnalyticsReportBundle => {
  const telemetryChannelId = channelId || 'offline';
  const reportTimezone = getReportTimezone();
  const { effectiveNowTs, requestedDateKey } = resolveDailyReportAnchor({
    nowTs,
    prompt,
    timezone: reportTimezone,
  });
  const rollingDayStart = effectiveNowTs - DAY_SECONDS;
  const weekStart = effectiveNowTs - WEEK_SECONDS;
  const normalizedMessages = normalizeMessages(rawMessages).filter(
    (message) => message.ts <= effectiveNowTs && message.ts >= weekStart,
  );
  const dedupeEnabled = shouldDedupeSmsEvents();
  const messages = dedupeEnabled ? dedupeLikelyDuplicateMessages(normalizedMessages) : normalizedMessages;
  const attributionMessages = (() => {
    if (!attributionRawMessages || attributionRawMessages.length === 0) {
      return messages;
    }
    const oldestAttributionTs = effectiveNowTs - getSequenceAttributionLookbackDays() * DAY_SECONDS;
    const normalizedAttributionMessages = normalizeMessages(attributionRawMessages).filter(
      (message) => message.ts <= effectiveNowTs && message.ts >= oldestAttributionTs,
    );
    if (normalizedAttributionMessages.length === 0) {
      return messages;
    }
    return dedupeEnabled ? dedupeLikelyDuplicateMessages(normalizedAttributionMessages) : normalizedAttributionMessages;
  })();
  if (dedupeEnabled && messages.length !== normalizedMessages.length) {
    logger?.debug?.(
      `[telemetry] aloware.duplicate_event_dedupe ${JSON.stringify({
        deduped: normalizedMessages.length - messages.length,
        normalized: normalizedMessages.length,
      })}`,
    );
  }
  const dailyWindow = resolveDailyWindowContext({
    nowTs: effectiveNowTs,
    targetDateKey: requestedDateKey,
    timezone: reportTimezone,
  });
  const dayMessages = messages.filter((message) => isWithinDailyWindow(message.ts, dailyWindow, effectiveNowTs));

  if (isDailyChecklistPrompt(prompt)) {
    const report = buildDailyChecklistReport(dayMessages, messages, effectiveNowTs, dailyWindow, attributionMessages);
    logger?.debug?.(
      `[telemetry] aloware.build_report ${JSON.stringify({
        channel_id: telemetryChannelId,
        duration_ms: Date.now() - reportBuildStartMs,
        mode: 'daily',
      })}`,
    );
    return {
      isDaily: true,
      reportText: report.reportText,
      summary: report.summary,
    };
  }

  const replyWindowSeconds = WEEK_SECONDS;

  const summaries = buildConversationSummaries(messages, replyWindowSeconds);
  const pipeline = buildPipelineMetrics(summaries, rollingDayStart);
  const outreachTouches = buildOutreachTouches(messages, replyWindowSeconds);
  const intentBreakdown = buildIntentBreakdown(summaries);
  const sequencePerformanceAll = buildSequenceConversionPerformance(
    outreachTouches,
    summaries,
    1,
    Number.MAX_SAFE_INTEGER,
    'origin',
    rollingDayStart,
  );
  const sequencePerformanceByLabel = new Map(sequencePerformanceAll.map((row) => [row.label, row]));
  const sequenceVolumesAll = buildSequenceVolumeRows(messages, Number.MAX_SAFE_INTEGER);
  const sequenceVolumes = sequenceVolumesAll.slice(0, DASHBOARD_SEQUENCE_DISPLAY_LIMIT);
  const sequenceVolumeTotals = summarizeSequenceVolumeTotals(sequenceVolumesAll);
  const structureMetrics = buildRequiredMessageStructureMetrics(outreachTouches, summaries);
  const messageTouches = outreachTouches.filter((touch) => touch.body.trim().length > 0);
  let messageLevelPerformance = buildConversationPerformance(
    messageTouches,
    (touch) => shortSnippet(touch.body, 90),
    2,
    DASHBOARD_MESSAGE_REPLY_RATE_LIMIT,
  );
  let messageMinSamples = 2;
  if (messageLevelPerformance.length === 0) {
    messageLevelPerformance = buildConversationPerformance(
      messageTouches,
      (touch) => shortSnippet(touch.body, 90),
      1,
      DASHBOARD_MESSAGE_REPLY_RATE_LIMIT,
    );
    messageMinSamples = 1;
  }
  const optOutCampaignRows = [...sequencePerformanceAll]
    .filter((row) => row.optOuts > 0)
    .sort((a, b) => {
      if (b.optOuts !== a.optOuts) {
        return b.optOuts - a.optOuts;
      }
      return b.optOutRatePct - a.optOutRatePct;
    })
    .slice(0, 5);
  const stylePerformance = buildConversationPerformance(outreachTouches, (touch) => touch.styleType, 1, 6);
  const stagePerformance = buildConversationPerformance(outreachTouches, (touch) => touch.stage, 1, 6);
  const offerPerformance = buildConversationPerformance(outreachTouches, (touch) => touch.offerType, 1, 6);
  const positioningPerformance = buildConversationPerformance(outreachTouches, (touch) => touch.positioningType, 1, 6);

  const followUps = followUpRows(messages, rollingDayStart);
  const inbound24h = dayMessages.filter((message) => message.direction === 'inbound');
  const bookingToday = uniqueRows(
    inbound24h,
    (message) => BOOKING_PATTERN.test(message.body) && !CANCELLATION_PATTERN.test(message.body),
  );
  const pricingToday = uniqueRows(
    inbound24h,
    (message) => PRICING_PATTERN.test(message.body) && !CANCELLATION_PATTERN.test(message.body),
  );
  const growthToday = uniqueRows(
    inbound24h,
    (message) =>
      (GROWTH_PATTERN.test(message.body) || HIRING_PATTERN.test(message.body)) &&
      !CANCELLATION_PATTERN.test(message.body),
  );
  const qualificationToday = uniqueRows(
    inbound24h,
    (message) =>
      STAGE_PATTERN.test(message.body) ||
      CONFUSION_PATTERN.test(message.body) ||
      WRONG_MARKET_PATTERN.test(message.body),
  );
  const reschedulesToday = uniqueRows(inbound24h, (message) => RESCHEDULE_PATTERN.test(message.body));
  const cancellationsToday = uniqueRows(inbound24h, (message) => CANCELLATION_PATTERN.test(message.body));

  const optOutBySequence = buildOptOutBySequence(sequencePerformanceAll, 1, 5);
  const optOutByTouch = buildOptOutByTouchNumber(summaries.filter((summary) => summary.outboundCount > 0));
  const optOutByPositioning = buildOptOutByPositioning(outreachTouches, summaries, 5);
  const frictionFlags = buildFrictionFlags({
    touches: outreachTouches,
    dayOptOuts: cancellationsToday.length,
    weekOptOuts: pipeline.optOuts,
  });

  const queueLines = (rows: LeadRow[], limit = 8): string[] => {
    if (rows.length === 0) {
      return ['- none found'];
    }
    return rows.slice(0, limit).map((row) => `- ${row.label}`);
  };

  const intentLines = intentBreakdown.map((row) => {
    if (!row.sample) {
      return `- ${row.label}: ${row.count}`;
    }
    return `- ${row.label}: ${row.count} (example: "${row.sample}")`;
  });

  const report = [
    '*SMS Insights Core KPI Report*',
    'Time range: last 24 hours.',
    '',
    '*1) REQUIRED: REPLY RATES BY MESSAGE (24h)*',
    `- Outbound conversations started (24h): ${pipeline.startedCount}`,
    `- Conversations replied (24h): ${pipeline.replied} (${formatPercent(pipeline.replyRatePct)})`,
    `- Calls booked (24h): ${pipeline.booked || 0}`,
    `- Top outbound messages by reply rate (min ${messageMinSamples} send${messageMinSamples === 1 ? '' : 's'}):`,
    ...(messageLevelPerformance.length === 0
      ? ['- none found']
      : messageLevelPerformance.map(
          (row) => `- "${row.label}": sent ${row.touches}, replied ${row.replies} (${formatPercent(row.replyRatePct)})`,
        )),
    '',
    '*2) REQUIRED: BOOKING CONVERSION BY MESSAGE STRUCTURE (24h)*',
    ...structureMetrics.map(
      (row) =>
        `- ${row.label}: ${formatPercent(row.replyRatePct)} reply (${row.repliedConversations}/${row.conversations}), ${formatPercent(row.bookingWhenRepliedRatePct)} booking when replied (${row.bookedWhenReplied}/${row.repliedConversations})`,
    ),
    '',
    '*3) REQUIRED: OPT-OUTS TIED TO CAMPAIGNS (24h)*',
    `- Total opt-out conversations (24h): ${pipeline.optOuts} out of ${pipeline.startedCount} (${formatPercent(pipeline.optOutRatePct)})`,
    ...(optOutCampaignRows.length === 0
      ? ['- none found']
      : optOutCampaignRows.map(
          (row) =>
            `- ${row.label}: ${row.optOuts} opt-outs out of ${row.conversations} conversations (${formatPercent(row.optOutRatePct)})`,
        )),
  ].join('\n');

  logger?.debug?.(
    `[telemetry] aloware.build_report ${JSON.stringify({
      channel_id: telemetryChannelId,
      duration_ms: Date.now() - reportBuildStartMs,
      mode: 'dashboard',
    })}`,
  );
  return {
    isDaily: false,
    reportText: report,
  };
};

export const buildAlowareAnalyticsReport = async ({
  channelId,
  client,
  logger,
  prompt,
}: {
  channelId: string;
  client: WebClient;
  logger?: Pick<Logger, 'debug' | 'warn'>;
  prompt: string;
}): Promise<string> => {
  const reportBuildStartMs = Date.now();
  const runtimeNowTs = Math.floor(Date.now() / 1000);
  const reportTimezone = getReportTimezone();
  const { effectiveNowTs } = resolveDailyReportAnchor({
    nowTs: runtimeNowTs,
    prompt,
    timezone: reportTimezone,
  });
  const weekStart = effectiveNowTs - WEEK_SECONDS;
  const isDailyPrompt = isDailyChecklistPrompt(prompt);
  const forceRefresh = isDailyPrompt;

  const rawMessages = await fetchHistory({
    channelId,
    client,
    forceRefresh,
    logger,
    oldest: weekStart,
  });
  const sequenceLookbackStart = effectiveNowTs - getSequenceAttributionLookbackDays() * DAY_SECONDS;
  const attributionRawMessages =
    isDailyPrompt && sequenceLookbackStart < weekStart
      ? await fetchHistory({
          channelId,
          client,
          forceRefresh,
          logger,
          oldest: sequenceLookbackStart,
        })
      : undefined;

  const result = buildReportFromRawMessages({
    attributionRawMessages,
    channelId,
    logger,
    nowTs: effectiveNowTs,
    prompt,
    rawMessages,
    reportBuildStartMs,
  });
  return result.reportText;
};

export const buildAlowareAnalyticsReportBundle = async ({
  channelId,
  client,
  logger,
  prompt,
}: {
  channelId: string;
  client: WebClient;
  logger?: Pick<Logger, 'debug' | 'warn'>;
  prompt: string;
}): Promise<AnalyticsReportBundle> => {
  const reportBuildStartMs = Date.now();
  const runtimeNowTs = Math.floor(Date.now() / 1000);
  const reportTimezone = getReportTimezone();
  const { effectiveNowTs } = resolveDailyReportAnchor({
    nowTs: runtimeNowTs,
    prompt,
    timezone: reportTimezone,
  });
  const weekStart = effectiveNowTs - WEEK_SECONDS;
  const isDailyPrompt = isDailyChecklistPrompt(prompt);
  const forceRefresh = isDailyPrompt;

  const rawMessages = await fetchHistory({
    channelId,
    client,
    forceRefresh,
    logger,
    oldest: weekStart,
  });
  const sequenceLookbackStart = effectiveNowTs - getSequenceAttributionLookbackDays() * DAY_SECONDS;
  const attributionRawMessages =
    isDailyPrompt && sequenceLookbackStart < weekStart
      ? await fetchHistory({
          channelId,
          client,
          forceRefresh,
          logger,
          oldest: sequenceLookbackStart,
        })
      : undefined;

  return buildReportFromRawMessages({
    attributionRawMessages,
    channelId,
    logger,
    nowTs: effectiveNowTs,
    prompt,
    rawMessages,
    reportBuildStartMs,
  });
};

export const buildAlowareAnalyticsReportFromHistoryMessages = ({
  logger,
  nowTs,
  prompt,
  rawMessages,
}: {
  logger?: Pick<Logger, 'debug' | 'warn'>;
  nowTs?: number;
  prompt: string;
  rawMessages: HistoryMessage[];
}): string => {
  const result = buildReportFromRawMessages({
    logger,
    nowTs: nowTs ?? Math.floor(Date.now() / 1000),
    prompt,
    rawMessages,
    reportBuildStartMs: Date.now(),
  });
  return result.reportText;
};

export const __debugAnalyzeRawMessagesForTests = ({
  nowTs,
  rawMessages,
}: {
  nowTs?: number;
  rawMessages: HistoryMessage[];
}) => {
  const now = nowTs ?? Math.floor(Date.now() / 1000);
  const normalizedMessages = normalizeMessages(rawMessages).filter((message) => message.ts <= now);
  const dedupeEnabled = shouldDedupeSmsEvents();
  const messages = dedupeEnabled ? dedupeLikelyDuplicateMessages(normalizedMessages) : normalizedMessages;

  const directionCounts = {
    inbound: messages.filter((message) => message.direction === 'inbound').length,
    outbound: messages.filter((message) => message.direction === 'outbound').length,
    unknown: messages.filter((message) => message.direction === 'unknown').length,
  };

  const byConversation = buildConversationMap(messages);
  let inboundOnlyConversationCount = 0;
  let inboundOnlyMessageCount = 0;
  let includedConversationCount = 0;
  let includedMessageCount = 0;
  for (const history of byConversation.values()) {
    const outboundRows = history.filter((message) => message.direction === 'outbound');
    const inboundRows = history.filter((message) => message.direction === 'inbound');
    const totalRows = outboundRows.length + inboundRows.length;
    if (outboundRows.length === 0) {
      inboundOnlyConversationCount += 1;
      inboundOnlyMessageCount += inboundRows.length;
      continue;
    }
    includedConversationCount += 1;
    includedMessageCount += totalRows;
  }

  const sequenceRows = buildSequenceVolumeRows(messages, Number.MAX_SAFE_INTEGER);
  const sequenceTotals = summarizeSequenceVolumeTotals(sequenceRows);
  const unknownContactRows = messages.filter(
    (message) => message.contactName.trim().toLowerCase() === 'unknown' && message.contactPhone.trim().length === 0,
  ).length;
  const missingSequenceRows = messages.filter(
    (message) => message.direction === 'outbound' && message.sequenceName.trim().length === 0,
  ).length;

  return {
    dedupeEnabled,
    directionCounts,
    includedConversationCount,
    includedMessageCount,
    inboundOnlyConversationCount,
    inboundOnlyMessageCount,
    messageCountAfterDedupe: messages.length,
    messageCountBeforeDedupe: normalizedMessages.length,
    missingSequenceRows,
    sequenceRows,
    sequenceTotals,
    unknownContactRows,
  };
};

export const __resetAlowareAnalyticsCachesForTests = (): void => {
  historyCache.clear();
  directionPatternCache = undefined;
};
