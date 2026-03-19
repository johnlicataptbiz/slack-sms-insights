import type { Logger } from '@slack/bolt';
import { type BookedCallAttributionSource, getBookedCallAttributionSources } from './booked-calls.js';
import { type MondayBoardColumn, queryBoardColumns, upsertBookedCallItem } from './monday-client.js';
import {
  getMondayBookedCallPush,
  getMondayColumnMapping,
  saveMondayColumnMapping,
  upsertMondayBookedCallPush,
} from './monday-store.js';
import { mondayConfig } from './monday-sync.js';
import { DEFAULT_BUSINESS_TIMEZONE, dayKeyInTimeZone } from './time-range.js';

type PersonalSetterBucket = 'jack' | 'brandon' | 'selfBooked';

type ManualSyncParams = {
  contactName: string;
  contactPhone?: string | null;
  eventTs?: string;
  line?: string | null;
  notes?: string | null;
  setter?: PersonalSetterBucket;
};

type PersonalBoardColumnMapping = {
  callDateColumnId: string | null;
  contactNameColumnId: string | null;
  phoneColumnId: string | null;
  setterColumnId: string | null;
  stageColumnId: string | null;
  firstConversionColumnId: string | null;
  lineColumnId: string | null;
  sourceColumnId: string | null;
  slackLinkColumnId: string | null;
  notesColumnId: string | null;
  dateHeldColumnId: string | null; // Appointment date from HubSpot
  advisorColumnId: string | null; // Contact owner from HubSpot
};

const parseJsonMapping = (raw: string | undefined): unknown => {
  const value = (raw || '').trim();
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
};

const normalize = (value: string) => value.trim().toLowerCase();

const findColumnBySignals = (columns: MondayBoardColumn[], signals: string[]): string | null => {
  const normalizedSignals = signals.map((signal) => signal.toLowerCase());
  for (const column of columns) {
    const haystack = `${normalize(column.id)} ${normalize(column.title)} ${normalize(column.type)}`;
    if (normalizedSignals.some((signal) => haystack.includes(signal))) {
      return column.id;
    }
  }
  return null;
};

const inferPersonalMapping = (columns: MondayBoardColumn[]): PersonalBoardColumnMapping => ({
  callDateColumnId: findColumnBySignals(columns, ['call date', 'appointment date', 'date']),
  contactNameColumnId: findColumnBySignals(columns, ['contact name', 'lead name', 'name']),
  phoneColumnId: findColumnBySignals(columns, ['phone', 'mobile']),
  setterColumnId: findColumnBySignals(columns, ['setter', 'rep', 'owner']),
  stageColumnId: findColumnBySignals(columns, ['status', 'stage', 'outcome', 'disposition']),
  firstConversionColumnId: findColumnBySignals(columns, ['first conversion', 'conversion', 'campaign']),
  lineColumnId: findColumnBySignals(columns, ['line']),
  sourceColumnId: findColumnBySignals(columns, ['source type', 'source', 'origin']),
  slackLinkColumnId: findColumnBySignals(columns, ['slack', 'thread link', 'link']),
  notesColumnId: findColumnBySignals(columns, ['notes', 'summary', 'details']),
  dateHeldColumnId: findColumnBySignals(columns, ['date held', 'appointment date', 'appt date']),
  advisorColumnId: findColumnBySignals(columns, ['advisor', 'contact owner', 'owner']),
});

const asNullableString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
};

const coercePersonalMapping = (value: unknown): PersonalBoardColumnMapping | null => {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  return {
    callDateColumnId: asNullableString(row.callDateColumnId),
    contactNameColumnId: asNullableString(row.contactNameColumnId),
    phoneColumnId: asNullableString(row.phoneColumnId),
    setterColumnId: asNullableString(row.setterColumnId),
    stageColumnId: asNullableString(row.stageColumnId),
    firstConversionColumnId: asNullableString(row.firstConversionColumnId),
    lineColumnId: asNullableString(row.lineColumnId),
    sourceColumnId: asNullableString(row.sourceColumnId),
    slackLinkColumnId: asNullableString(row.slackLinkColumnId),
    notesColumnId: asNullableString(row.notesColumnId),
    dateHeldColumnId: asNullableString(row.dateHeldColumnId),
    advisorColumnId: asNullableString(row.advisorColumnId),
  };
};

export const readPersonalMappingFromEnv = (raw?: string): PersonalBoardColumnMapping | null => {
  return coercePersonalMapping(parseJsonMapping(raw ?? process.env.MONDAY_PERSONAL_COLUMN_MAP_JSON));
};

const mergeMappings = (
  persisted: PersonalBoardColumnMapping | null,
  inferred: PersonalBoardColumnMapping,
): PersonalBoardColumnMapping => {
  if (!persisted) return inferred;
  return {
    callDateColumnId: persisted.callDateColumnId || inferred.callDateColumnId,
    contactNameColumnId: persisted.contactNameColumnId || inferred.contactNameColumnId,
    phoneColumnId: persisted.phoneColumnId || inferred.phoneColumnId,
    setterColumnId: persisted.setterColumnId || inferred.setterColumnId,
    stageColumnId: persisted.stageColumnId || inferred.stageColumnId,
    firstConversionColumnId: persisted.firstConversionColumnId || inferred.firstConversionColumnId,
    lineColumnId: persisted.lineColumnId || inferred.lineColumnId,
    sourceColumnId: persisted.sourceColumnId || inferred.sourceColumnId,
    slackLinkColumnId: persisted.slackLinkColumnId || inferred.slackLinkColumnId,
    notesColumnId: persisted.notesColumnId || inferred.notesColumnId,
    dateHeldColumnId: persisted.dateHeldColumnId || inferred.dateHeldColumnId,
    advisorColumnId: persisted.advisorColumnId || inferred.advisorColumnId,
  };
};

const mergePersonalOverrides = (
  base: PersonalBoardColumnMapping,
  override: PersonalBoardColumnMapping | null,
): PersonalBoardColumnMapping => {
  if (!override) return base;
  return {
    callDateColumnId: override.callDateColumnId || base.callDateColumnId,
    contactNameColumnId: override.contactNameColumnId || base.contactNameColumnId,
    phoneColumnId: override.phoneColumnId || base.phoneColumnId,
    setterColumnId: override.setterColumnId || base.setterColumnId,
    stageColumnId: override.stageColumnId || base.stageColumnId,
    firstConversionColumnId: override.firstConversionColumnId || base.firstConversionColumnId,
    lineColumnId: override.lineColumnId || base.lineColumnId,
    sourceColumnId: override.sourceColumnId || base.sourceColumnId,
    slackLinkColumnId: override.slackLinkColumnId || base.slackLinkColumnId,
    notesColumnId: override.notesColumnId || base.notesColumnId,
    dateHeldColumnId: override.dateHeldColumnId || base.dateHeldColumnId,
    advisorColumnId: override.advisorColumnId || base.advisorColumnId,
  };
};

const parseBucket = (value: string | undefined): PersonalSetterBucket => {
  const normalized = (value || '').trim().toLowerCase();
  if (normalized === 'brandon') return 'brandon';
  if (normalized === 'self' || normalized === 'selfbooked' || normalized === 'self_booked') return 'selfBooked';
  return 'jack';
};

const formatSetter = (bucket: PersonalSetterBucket): string => {
  if (bucket === 'brandon') return 'Brandon';
  if (bucket === 'selfBooked') return 'Self Booked';
  return 'Jack';
};

const cleanPhone = (value: string | null): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length < 7) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.startsWith('1') && digits.length === 11) return `+${digits}`;
  return `+${digits}`;
};

const normalizeContactName = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  // Drop obvious phone-like strings so we do not create numeric-only Monday item names.
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (digitsOnly.length >= 7 && digitsOnly.length >= trimmed.replace(/\s+/g, '').length - 2) {
    return null;
  }
  return trimmed;
};

const buildManualItemName = (contactName: string, eventTs: string): string => {
  const cleaned = normalizeContactName(contactName) || 'Manual Call';
  const callDate = resolveCallDate(eventTs);
  return `${cleaned} - ${callDate}`;
};

const buildManualMarkdown = (params: ManualSyncParams): string => {
  const setter = formatSetter(params.setter || 'jack');
  const callDate = resolveCallDate(params.eventTs || new Date().toISOString());
  return [
    `# Manual Booking (${setter})`,
    '',
    `Date: ${callDate}`,
    `Contact: ${params.contactName}`,
    `Phone: ${params.contactPhone || 'n/a'}`,
    `Line: ${params.line || 'manual'}`,
    '',
    params.notes || 'Notes: n/a',
  ].join('\n');
};

const slackPermalink = (channelId: string, messageTs: string): string => {
  return `https://slack.com/archives/${channelId}/p${messageTs.replace('.', '')}`;
};

const resolveCallDate = (eventTs: string): string => {
  const tz = (process.env.ALOWARE_REPORT_TIMEZONE || '').trim() || DEFAULT_BUSINESS_TIMEZONE;
  return dayKeyInTimeZone(eventTs, tz) || eventTs.slice(0, 10);
};

/**
 * Converts M/D/YY or M/D/YYYY date format to YYYY-MM-DD
 * Examples: "3/17/26" → "2026-03-17", "12/1/2025" → "2025-12-01"
 */
const parseMDYDate = (value: string | null): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;

  const month = match[1].padStart(2, '0');
  const day = match[2].padStart(2, '0');
  let year = match[3];

  // Convert 2-digit year to 4-digit (assume 20xx for now)
  if (year.length === 2) {
    year = `20${year}`;
  }

  return `${year}-${month}-${day}`;
};

/**
 * Extracts fallback field value from Slack attachment structure
 * Same logic as parseFallbackField from booked-calls.ts
 */
const parseFallbackField = (fallback: string, label: string): string | null => {
  if (!fallback) return null;
  const pattern = new RegExp(`\\*${label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\*:\\s*(.*)$`, 'im');
  const match = fallback.match(pattern);
  const value = (match?.[1] || '')
    .trim()
    .replace(/<mailto:[^|>]+\|([^>]+)>/gi, '$1')
    .replace(/<[^|>]+\|([^>]+)>/g, '$1');
  return value.length > 0 ? value : null;
};

/**
 * Extracts fallback string from raw Slack message attachments
 */
const fallbackFromRaw = (raw: unknown): string => {
  if (!raw || typeof raw !== 'object') return '';
  const typed = raw as { attachments?: Array<{ fallback?: string }> };
  const first = Array.isArray(typed.attachments) ? typed.attachments[0] : null;
  if (!first) return '';
  return String(first.fallback || '');
};

/**
 * Parse "Date Held" (appointment date) from HubSpot data in Slack attachment
 * Looks for "Next Activity Date" or "Date of last meeting booked" fields
 * Returns YYYY-MM-DD format or null
 */
const parseDateHeldFromSlackRaw = (raw: unknown): string | null => {
  const fallback = fallbackFromRaw(raw);
  if (!fallback) return null;

  // Try "Next Activity Date" first (most common)
  const nextActivity = parseFallbackField(fallback, 'Next Activity Date');
  if (nextActivity) {
    const parsed = parseMDYDate(nextActivity);
    if (parsed) return parsed;
  }

  // Fallback to "Date of last meeting booked"
  const lastMeeting = parseFallbackField(fallback, 'Date of last meeting booked');
  if (lastMeeting) {
    const parsed = parseMDYDate(lastMeeting);
    if (parsed) return parsed;
  }

  return null;
};

/**
 * Parse "Advisor" (contact owner) from HubSpot data in Slack attachment
 * Looks for "Contact owner" field
 * Returns owner name or null
 */
const parseAdvisorFromSlackRaw = (raw: unknown): string | null => {
  const fallback = fallbackFromRaw(raw);
  if (!fallback) return null;

  const owner = parseFallbackField(fallback, 'Contact owner');
  return owner || null;
};

const setterMondayUserId = Number.parseInt((process.env.MONDAY_PERSONAL_SETTER_MONDAY_USER_ID || '').trim(), 10);

const mapStageToSwing = (): string => 'First Swing';

const mapLineToChannel = (line: string | null): string => {
  const normalized = (line || '').trim().toLowerCase();
  if (!normalized) return 'Aloware SMS';

  if (normalized.includes('game plan') || normalized.includes('strategy call') || normalized.includes('call')) {
    return 'Game Plan Call';
  }
  if (normalized.includes('self')) return 'SELF BOOK';
  if (normalized.includes('instagram') || normalized.includes('ig')) return 'Instagram DM';
  if (normalized.includes('email')) return 'Email Marketing';
  if (normalized.includes('circle')) return 'Circle DM';
  if (normalized.includes('aloware') || normalized.includes('sms') || normalized.includes('text')) {
    return 'Aloware SMS';
  }

  return 'Aloware SMS';
};

const mapSourceToMondaySource = (firstConversion: string | null): string => {
  const normalized = (firstConversion || '').trim().toLowerCase();
  if (!normalized) return 'Direct Outreach';

  if (normalized.includes('self book') || normalized.includes('self_book') || normalized.includes('signature')) {
    return 'Signature Self Book';
  }
  if (normalized.includes('circle')) return 'Circle Group';
  if (normalized.includes('book buyer') || normalized.includes('book_buyer')) return 'Book Buyer';
  if (normalized.includes('checklist') || normalized.includes('start-up') || normalized.includes('startup')) {
    return 'Start-Up Checklist';
  }
  if (normalized.includes('rates') || normalized.includes('raise your rates')) return 'Raise Your Rates';
  if (normalized.includes('space') || normalized.includes('stand alone')) return 'Stand Alone Space Setup Guide';
  if (normalized.includes('marketing email') || normalized.includes('email')) return 'Marketing Email';
  if (normalized.includes('social')) return 'Social Media';
  if (normalized.includes('hiring')) return 'Hiring Guide';
  if (normalized.includes('webinar')) return 'Webinar';
  if (normalized.includes('workshop')) return 'Workshop Playbook';

  return 'Direct Outreach';
};

const addColumnValue = (
  out: Record<string, unknown>,
  columnsById: Map<string, MondayBoardColumn>,
  columnId: string | null,
  value: string | null,
  options?: {
    isLink?: boolean;
    isDate?: boolean;
    isPhone?: boolean;
    isSetter?: boolean;
  },
): void => {
  if (!columnId || !value) return;
  const column = columnsById.get(columnId);
  if (!column) return;

  // Skip read-only and unsettable column types to prevent batch mutation failures.
  // board_relation: requires linked item IDs, not free-form values.
  // mirror / lookup: computed from linked boards, read-only.
  // formula: computed, read-only.
  // name: item name is set via the rename mutation in upsertBookedCallItem, not here.
  // checkbox: only accepts boolean true/false, not text strings.
  const SKIP_TYPES = new Set(['board_relation', 'mirror', 'lookup', 'formula', 'name', 'checkbox']);
  if (SKIP_TYPES.has(column.type)) return;

  if (options?.isDate || column.type.includes('date')) {
    out[columnId] = { date: value };
    return;
  }

  if (options?.isPhone || column.type.includes('phone')) {
    const phone = cleanPhone(value);
    if (!phone) return;
    out[columnId] = { phone, countryShortName: 'US' };
    return;
  }

  if (options?.isLink || column.type.includes('link')) {
    out[columnId] = { url: value, text: 'Slack message' };
    return;
  }

  if (
    options?.isSetter &&
    column.type.includes('people') &&
    Number.isFinite(setterMondayUserId) &&
    setterMondayUserId > 0
  ) {
    out[columnId] = {
      personsAndTeams: [{ id: setterMondayUserId, kind: 'person' }],
    };
    return;
  }

  if (column.type.includes('status')) {
    out[columnId] = { label: value };
    return;
  }

  if (column.type.includes('long_text')) {
    out[columnId] = { text: value };
    return;
  }

  if (column.type.includes('numbers')) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return;
    out[columnId] = parsed;
    return;
  }

  out[columnId] = value;
};

export const buildUpdateMarkdown = (source: BookedCallAttributionSource): string => {
  const setter = formatSetter(source.bucket);
  const contactName = normalizeContactName(source.contactName);
  const lines = [
    `# Slack Booked Call (${setter})`,
    '',
    `Booked at: ${source.eventTs}`,
    `Contact: ${contactName || source.contactPhone || 'Unknown'}`,
    `Phone: ${source.contactPhone || 'n/a'}`,
    `Line: ${source.line || 'n/a'}`,
    `Rep: ${source.rep || setter}`,
    `First conversion: ${source.firstConversion || 'n/a'}`,
    `Slack: ${slackPermalink(source.slackChannelId, source.slackMessageTs)}`,
    '',
    source.text ? `Raw text: ${source.text}` : 'Raw text: n/a',
  ];
  return lines.join('\n');
};

export const buildItemName = (source: BookedCallAttributionSource): string => {
  const contactName = normalizeContactName(source.contactName);
  const who = contactName || 'Booked Call';
  return who; // Just the name, no date suffix
};

export const loadBoardMapping = async (
  boardId: string,
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<{
  mapping: PersonalBoardColumnMapping;
  columnsById: Map<string, MondayBoardColumn>;
}> => {
  const [columns, persisted] = await Promise.all([
    queryBoardColumns(boardId, logger),
    getMondayColumnMapping(boardId, logger),
  ]);
  const inferred = inferPersonalMapping(columns);
  const envOverride = readPersonalMappingFromEnv();
  const mapping = mergePersonalOverrides(mergeMappings(coercePersonalMapping(persisted), inferred), envOverride);
  if (envOverride) {
    logger?.info?.('Using MONDAY_PERSONAL_COLUMN_MAP_JSON override for monday personal writeback mapping', { boardId });
  }
  await saveMondayColumnMapping(boardId, mapping, logger);
  return {
    mapping,
    columnsById: new Map(columns.map((column) => [column.id, column])),
  };
};

export const toColumnValues = (
  source: BookedCallAttributionSource,
  mapping: PersonalBoardColumnMapping,
  columnsById: Map<string, MondayBoardColumn>,
): Record<string, unknown> => {
  const values: Record<string, unknown> = {};
  const setter = formatSetter(source.bucket);
  const callDate = resolveCallDate(source.eventTs);
  const link = slackPermalink(source.slackChannelId, source.slackMessageTs);

  addColumnValue(values, columnsById, mapping.callDateColumnId, callDate, {
    isDate: true,
  });
  addColumnValue(values, columnsById, mapping.contactNameColumnId, normalizeContactName(source.contactName));
  addColumnValue(values, columnsById, mapping.phoneColumnId, source.contactPhone, { isPhone: true });
  const setterValue = source.bucket === 'selfBooked' ? 'Self Booked' : source.rep || setter;
  addColumnValue(values, columnsById, mapping.setterColumnId, setterValue, {
    isSetter: source.bucket !== 'selfBooked',
  });
  addColumnValue(values, columnsById, mapping.stageColumnId, mapStageToSwing());
  addColumnValue(values, columnsById, mapping.firstConversionColumnId, source.firstConversion);
  addColumnValue(values, columnsById, mapping.lineColumnId, mapLineToChannel(source.line));
  addColumnValue(values, columnsById, mapping.sourceColumnId, mapSourceToMondaySource(source.firstConversion));
  addColumnValue(values, columnsById, mapping.slackLinkColumnId, link, {
    isLink: true,
  });
  addColumnValue(
    values,
    columnsById,
    mapping.notesColumnId,
    [source.text, source.firstConversion ? `First conversion: ${source.firstConversion}` : null]
      .filter(Boolean)
      .join('\n'),
  );

  // NEW: Parse Date Held and Advisor from HubSpot data
  const dateHeld = parseDateHeldFromSlackRaw(source.raw);
  addColumnValue(values, columnsById, mapping.dateHeldColumnId, dateHeld, {
    isDate: true,
  });

  const advisor = parseAdvisorFromSlackRaw(source.raw);
  addColumnValue(values, columnsById, mapping.advisorColumnId, advisor);

  return values;
};

const buildManualSource = (params: ManualSyncParams): BookedCallAttributionSource => {
  const eventTs = params.eventTs || new Date().toISOString();
  return {
    bookedCallId: `manual-${Date.now()}`,
    eventTs,
    bucket: params.setter || 'jack',
    firstConversion: null,
    rep: formatSetter(params.setter || 'jack'),
    line: params.line || null,
    contactName: params.contactName,
    contactPhone: params.contactPhone ?? null,
    contactEmail: null,
    slackChannelId: 'manual',
    slackMessageTs: `${Date.now()}`,
    text: params.notes || null,
    raw: null,
  };
};

export const createManualMondayBookedCall = async (
  params: ManualSyncParams,
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<{ itemId: string }> => {
  if (!mondayConfig.personalBoardId) {
    throw new Error('Personal board is not configured for manual Monday write');
  }

  const boardId = mondayConfig.personalBoardId;
  const source = buildManualSource(params);
  const { mapping, columnsById } = await loadBoardMapping(boardId, logger);
  const columnValues = toColumnValues(source, mapping, columnsById);
  const itemName = buildManualItemName(source.contactName || params.contactName, source.eventTs);
  const result = await upsertBookedCallItem(
    boardId,
    {
      itemName,
      updateMarkdown: buildManualMarkdown(params),
      columnValues,
      existingItemId: null,
    },
    logger,
  );

  return { itemId: result.itemId };
};

const pushOne = async (
  source: BookedCallAttributionSource,
  params: {
    boardId: string;
    mapping: PersonalBoardColumnMapping;
    columnsById: Map<string, MondayBoardColumn>;
    includeSelfBooked?: boolean;
  },
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<'synced' | 'skipped' | 'error'> => {
  if (source.bucket === 'selfBooked' && !params.includeSelfBooked) {
    return 'skipped';
  }
  const existing = await getMondayBookedCallPush(source.slackChannelId, source.slackMessageTs, logger);

  if (existing?.status === 'synced' && existing.monday_item_id) {
    return 'skipped';
  }

  const payload = {
    source,
    boardId: params.boardId,
  };

  await upsertMondayBookedCallPush(
    {
      boardId: params.boardId,
      slackChannelId: source.slackChannelId,
      slackMessageTs: source.slackMessageTs,
      setterBucket: source.bucket,
      mondayItemId: existing?.monday_item_id || null,
      status: 'pending',
      payloadJson: payload,
      error: null,
    },
    logger,
  );

  try {
    const columnValues = toColumnValues(source, params.mapping, params.columnsById);
    const result = await upsertBookedCallItem(
      params.boardId,
      {
        itemName: buildItemName(source),
        updateMarkdown: buildUpdateMarkdown(source),
        columnValues,
        existingItemId: existing?.monday_item_id || null,
      },
      logger,
    );
    await upsertMondayBookedCallPush(
      {
        boardId: params.boardId,
        slackChannelId: source.slackChannelId,
        slackMessageTs: source.slackMessageTs,
        setterBucket: source.bucket,
        mondayItemId: result.itemId,
        status: 'synced',
        payloadJson: payload,
        error: null,
        pushedAt: new Date(),
      },
      logger,
    );
    return 'synced';
  } catch (error) {
    await upsertMondayBookedCallPush(
      {
        boardId: params.boardId,
        slackChannelId: source.slackChannelId,
        slackMessageTs: source.slackMessageTs,
        setterBucket: source.bucket,
        mondayItemId: existing?.monday_item_id || null,
        status: 'error',
        payloadJson: payload,
        error: error instanceof Error ? error.message : String(error),
      },
      logger,
    );
    return 'error';
  }
};

const targetBucket = (): PersonalSetterBucket => parseBucket(process.env.MONDAY_PERSONAL_SETTER_BUCKET || 'jack');

const isPersonalSelfBookedEnabled = (): boolean => {
  const normalized = (process.env.MONDAY_PERSONAL_SELF_BOOKED_ENABLED || '').trim().toLowerCase();
  return normalized === 'true';
};

const personalBoardId = (): string => {
  return (process.env.MONDAY_PERSONAL_BOARD_ID || mondayConfig.myCallsBoardId || '').trim();
};

const personalLookbackDays = (): number => {
  const raw = Number.parseInt(process.env.MONDAY_PERSONAL_PUSH_LOOKBACK_DAYS || '14', 10);
  if (!Number.isFinite(raw) || raw < 1) return 14;
  return raw;
};

const loadRelevantSources = async (params: {
  channelId?: string;
  slackMessageTs?: string;
}): Promise<BookedCallAttributionSource[]> => {
  const to = new Date();
  const from = new Date(to.getTime() - personalLookbackDays() * 24 * 60 * 60 * 1000);
  const rows = await getBookedCallAttributionSources({
    from,
    to,
    channelId: params.channelId,
    slackMessageTs: params.slackMessageTs,
  });

  const bucket = targetBucket();
  const includeSelfBooked = isPersonalSelfBookedEnabled();
  return rows.filter((row) => row.bucket === bucket || (includeSelfBooked && row.bucket === 'selfBooked'));
};

export const syncRecentSetterBookedCallsToMonday = async (
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<{
  status: 'skipped' | 'success';
  pushed: number;
  checked: number;
}> => {
  if (!mondayConfig.autoWriteEnabled || !mondayConfig.outboundEnabled || !mondayConfig.personalSyncEnabled) {
    return { status: 'skipped', pushed: 0, checked: 0 };
  }

  const boardId = personalBoardId();
  if (!boardId) {
    logger?.warn?.('MONDAY_PERSONAL_BOARD_ID is not configured; skipping personal booked-call sync');
    return { status: 'skipped', pushed: 0, checked: 0 };
  }

  const rows = await loadRelevantSources({});
  if (!rows.length) {
    return { status: 'success', pushed: 0, checked: 0 };
  }

  const { mapping, columnsById } = await loadBoardMapping(boardId, logger);
  const includeSelfBooked = isPersonalSelfBookedEnabled();

  let pushed = 0;
  for (const row of rows) {
    const result = await pushOne(row, { boardId, mapping, columnsById, includeSelfBooked }, logger);
    if (result === 'synced') pushed += 1;
  }

  return { status: 'success', pushed, checked: rows.length };
};

export const syncBookedCallToPersonalBoardFromSlackMessage = async (
  params: {
    channelId: string;
    messageTs: string;
  },
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<{ status: 'skipped' | 'synced' | 'error'; reason?: string }> => {
  if (!mondayConfig.autoWriteEnabled) {
    return { status: 'skipped', reason: 'MONDAY_AUTO_WRITE_ENABLED is false' };
  }
  if (!mondayConfig.outboundEnabled) {
    return { status: 'skipped', reason: 'MONDAY_OUTBOUND_ENABLED is false' };
  }

  if (!mondayConfig.personalSyncEnabled) {
    return {
      status: 'skipped',
      reason: 'MONDAY_PERSONAL_SYNC_ENABLED is false',
    };
  }

  const boardId = personalBoardId();
  if (!boardId) {
    return {
      status: 'skipped',
      reason: 'MONDAY_PERSONAL_BOARD_ID not configured',
    };
  }

  const rows = await loadRelevantSources({
    channelId: params.channelId,
    slackMessageTs: params.messageTs,
  });
  const match = rows.find((row) => row.slackChannelId === params.channelId && row.slackMessageTs === params.messageTs);
  if (!match) {
    return {
      status: 'skipped',
      reason: 'No setter-attributed booked call matched this Slack message yet',
    };
  }

  const { mapping, columnsById } = await loadBoardMapping(boardId, logger);
  const result = await pushOne(match, { boardId, mapping, columnsById, includeSelfBooked: true }, logger);
  return result === 'error' ? { status: 'error' } : result === 'synced' ? { status: 'synced' } : { status: 'skipped' };
};
