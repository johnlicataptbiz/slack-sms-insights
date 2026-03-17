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

type PersonalSetterBucket = 'jack' | 'brandon';

type ManualSyncParams = {
  contactName: string;
  contactPhone?: string | null;
  eventTs?: string;
  line?: string | null;
  notes?: string | null;
  setter?: PersonalSetterBucket;
};

// MODIFIED: Added dateHeldColumnId and advisorColumnId
type PersonalBoardColumnMapping = {
  callDateColumnId: string | null; // "Date Set" - when they booked
  dateHeldColumnId: string | null; // "Date Held" - appointment date
  contactNameColumnId: string | null;
  phoneColumnId: string | null;
  setterColumnId: string | null;
  stageColumnId: string | null;
  firstConversionColumnId: string | null;
  lineColumnId: string | null;
  sourceColumnId: string | null;
  slackLinkColumnId: string | null;
  notesColumnId: string | null;
  advisorColumnId: string | null; // New column for Advisor
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

// MODIFIED: Added inference for dateHeld and advisor columns
const inferPersonalMapping = (columns: MondayBoardColumn[]): PersonalBoardColumnMapping => ({
  callDateColumnId: findColumnBySignals(columns, ['date set']),
  dateHeldColumnId: findColumnBySignals(columns, ['date held', 'appointment date']),
  contactNameColumnId: findColumnBySignals(columns, ['contact name', 'lead name', 'name']),
  phoneColumnId: findColumnBySignals(columns, ['phone', 'mobile']),
  setterColumnId: findColumnBySignals(columns, ['setter', 'rep', 'owner']),
  stageColumnId: findColumnBySignals(columns, ['status', 'stage', 'outcome', 'disposition']),
  firstConversionColumnId: findColumnBySignals(columns, ['first conversion', 'conversion', 'campaign']),
  lineColumnId: findColumnBySignals(columns, ['line']),
  sourceColumnId: findColumnBySignals(columns, ['source type', 'source', 'origin']),
  slackLinkColumnId: findColumnBySignals(columns, ['slack', 'thread link', 'link']),
  notesColumnId: findColumnBySignals(columns, ['notes', 'summary', 'details']),
  advisorColumnId: findColumnBySignals(columns, ['advisor', 'contact owner']),
});

const asNullableString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
};

// MODIFIED: Coerce new mapping fields
const coercePersonalMapping = (value: unknown): PersonalBoardColumnMapping | null => {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  return {
    callDateColumnId: asNullableString(row.callDateColumnId),
    dateHeldColumnId: asNullableString(row.dateHeldColumnId),
    contactNameColumnId: asNullableString(row.contactNameColumnId),
    phoneColumnId: asNullableString(row.phoneColumnId),
    setterColumnId: asNullableString(row.setterColumnId),
    stageColumnId: asNullableString(row.stageColumnId),
    firstConversionColumnId: asNullableString(row.firstConversionColumnId),
    lineColumnId: asNullableString(row.lineColumnId),
    sourceColumnId: asNullableString(row.sourceColumnId),
    slackLinkColumnId: asNullableString(row.slackLinkColumnId),
    notesColumnId: asNullableString(row.notesColumnId),
    advisorColumnId: asNullableString(row.advisorColumnId),
  };
};

export const readPersonalMappingFromEnv = (raw?: string): PersonalBoardColumnMapping | null => {
  return coercePersonalMapping(parseJsonMapping(raw ?? process.env.MONDAY_PERSONAL_COLUMN_MAP_JSON));
};

// MODIFIED: Merge new mapping fields
const mergeMappings = (
  persisted: PersonalBoardColumnMapping | null,
  inferred: PersonalBoardColumnMapping,
): PersonalBoardColumnMapping => {
  if (!persisted) return inferred;
  return {
    callDateColumnId: persisted.callDateColumnId || inferred.callDateColumnId,
    dateHeldColumnId: persisted.dateHeldColumnId || inferred.dateHeldColumnId,
    contactNameColumnId: persisted.contactNameColumnId || inferred.contactNameColumnId,
    phoneColumnId: persisted.phoneColumnId || inferred.phoneColumnId,
    setterColumnId: persisted.setterColumnId || inferred.setterColumnId,
    stageColumnId: persisted.stageColumnId || inferred.stageColumnId,
    firstConversionColumnId: persisted.firstConversionColumnId || inferred.firstConversionColumnId,
    lineColumnId: persisted.lineColumnId || inferred.lineColumnId,
    sourceColumnId: persisted.sourceColumnId || inferred.sourceColumnId,
    slackLinkColumnId: persisted.slackLinkColumnId || inferred.slackLinkColumnId,
    notesColumnId: persisted.notesColumnId || inferred.notesColumnId,
    advisorColumnId: persisted.advisorColumnId || inferred.advisorColumnId,
  };
};

// MODIFIED: Merge new mapping fields
const mergePersonalOverrides = (
  base: PersonalBoardColumnMapping,
  override: PersonalBoardColumnMapping | null,
): PersonalBoardColumnMapping => {
  if (!override) return base;
  return {
    callDateColumnId: override.callDateColumnId || base.callDateColumnId,
    dateHeldColumnId: override.dateHeldColumnId || base.dateHeldColumnId,
    contactNameColumnId: override.contactNameColumnId || base.contactNameColumnId,
    phoneColumnId: override.phoneColumnId || base.phoneColumnId,
    setterColumnId: override.setterColumnId || base.setterColumnId,
    stageColumnId: override.stageColumnId || base.stageColumnId,
    firstConversionColumnId: override.firstConversionColumnId || base.firstConversionColumnId,
    lineColumnId: override.lineColumnId || base.lineColumnId,
    sourceColumnId: override.sourceColumnId || base.sourceColumnId,
    slackLinkColumnId: override.slackLinkColumnId || base.slackLinkColumnId,
    notesColumnId: override.notesColumnId || base.notesColumnId,
    advisorColumnId: override.advisorColumnId || base.advisorColumnId,
  };
};

const parseBucket = (value: string | undefined): PersonalSetterBucket => {
  return value?.trim().toLowerCase() === 'brandon' ? 'brandon' : 'jack';
};

const formatSetter = (bucket: PersonalSetterBucket): string => (bucket === 'brandon' ? 'Brandon' : 'Jack');

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
  return cleaned; // Just the name, no date suffix
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

// NEW: Helper functions to parse data from Slack message attachments
/**
 * Convert M/D/YY or M/D/YYYY to YYYY-MM-DD
 */
const parseMDYDate = (dateStr: string): string | null => {
  const match = dateStr.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!match) return null;

  const month = match[1].padStart(2, '0');
  const day = match[2].padStart(2, '0');
  let year = match[3];

  // Convert 2-digit year to 4-digit
  if (year.length === 2) {
    const yearNum = parseInt(year, 10);
    year = yearNum >= 0 && yearNum <= 50 ? `20${year}` : `19${year}`;
  }

  return `${year}-${month}-${day}`;
};

/**
 * Parse appointment date from HubSpot Slack attachment text
 */
const parseDateHeldFromSlackRaw = (raw: unknown): string | null => {
  if (!raw || typeof raw !== 'object') return null;
  const typed = raw as { attachments?: Array<{ text?: string; fallback?: string }> };
  const firstAttachment = Array.isArray(typed.attachments) ? typed.attachments[0] : null;
  if (!firstAttachment) return null;

  const text = firstAttachment.text || firstAttachment.fallback || '';

  const nextActivityMatch = text.match(/\*Next Activity Date\*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (nextActivityMatch && nextActivityMatch[1]) {
    return parseMDYDate(nextActivityMatch[1]);
  }

  const meetingDateMatch = text.match(/\*Date of last meeting booked[^:]*\*:\s*(\d{1,2}\/\d{1,2}\/\d{2,4})/i);
  if (meetingDateMatch && meetingDateMatch[1]) {
    return parseMDYDate(meetingDateMatch[1]);
  }

  return null;
};

/**
 * Parse advisor (contact owner) from HubSpot Slack attachment text
 */
const parseAdvisorFromSlackRaw = (raw: unknown): string | null => {
  if (!raw || typeof raw !== 'object') return null;
  const typed = raw as { attachments?: Array<{ text?: string; fallback?: string }> };
  const firstAttachment = Array.isArray(typed.attachments) ? typed.attachments[0] : null;
  if (!firstAttachment) return null;

  const text = firstAttachment.text || firstAttachment.fallback || '';

  const ownerMatch = text.match(/\*Contact owner\*:\s*(.+)/i);
  if (ownerMatch && ownerMatch[1]) {
    const potentialLink = ownerMatch[1];
    const linkMatch = potentialLink.match(/<mailto:[^|]+\|([^>]+)>/);
    if (linkMatch && linkMatch[1]) {
      return linkMatch[1].trim();
    }
    return potentialLink.trim();
  }

  return null;
};

const setterMondayUserId = Number.parseInt((process.env.MONDAY_PERSONAL_SETTER_MONDAY_USER_ID || '').trim(), 10);

const addColumnValue = (
  out: Record<string, unknown>,
  columnsById: Map<string, MondayBoardColumn>,
  columnId: string | null,
  value: string | null,
  options?: { isLink?: boolean; isDate?: boolean; isPhone?: boolean; isSetter?: boolean },
): void => {
  if (!columnId || !value) return;
  const column = columnsById.get(columnId);
  if (!column) return;

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
    out[columnId] = { personsAndTeams: [{ id: setterMondayUserId, kind: 'person' }] };
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

const buildUpdateMarkdown = (source: BookedCallAttributionSource): string => {
  const setter = formatSetter(source.bucket === 'brandon' ? 'brandon' : 'jack');
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

const buildItemName = (source: BookedCallAttributionSource): string => {
  const contactName = normalizeContactName(source.contactName);
  const who = contactName || 'Booked Call';
  return who; // Just the name, no date suffix
};

const loadBoardMapping = async (
  boardId: string,
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<{ mapping: PersonalBoardColumnMapping; columnsById: Map<string, MondayBoardColumn> }> => {
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

/**
 * Map line/source values to valid Monday.com status column values
 */
const mapLineToChannel = (line: string | null): string | null => {
  if (!line) return 'Aloware SMS'; // Default when line is null
  const normalized = line.toLowerCase();
  // Map your actual line names to Monday.com Channel? column values
  if (normalized.includes('aloware') || normalized.includes('sms')) return 'Aloware SMS';
  if (normalized.includes('circle')) return 'Circle DM';
  if (normalized.includes('instagram') || normalized.includes('ig')) return 'Instagram DM';
  if (normalized.includes('email')) return 'Email Marketing';
  if (normalized.includes('self')) return 'SELF BOOK';
  // Default fallback
  return 'Aloware SMS';
};

const mapSourceToMondaySource = (firstConversion: string | null): string | null => {
  if (!firstConversion) return 'Direct Outreach'; // Default value
  const normalized = firstConversion.toLowerCase();
  // Map your first conversion sources to Monday.com Source? column values
  if (normalized.includes('circle')) return 'Circle Group';
  if (normalized.includes('book buyer')) return 'Book Buyer';
  if (normalized.includes('checklist')) return 'Start-Up Checklist';
  if (normalized.includes('rates')) return 'Raise Your Rates';
  if (normalized.includes('space')) return 'Stand Alone Space Setup Guide';
  if (normalized.includes('email')) return 'Marketing Email';
  if (normalized.includes('social')) return 'Social Media';
  if (normalized.includes('hiring')) return 'Hiring Guide';
  if (normalized.includes('webinar')) return 'Webinar';
  if (normalized.includes('workshop')) return 'Workshop Playbook';
  if (normalized.includes('self book')) return 'Signature Self Book';
  // Default fallback
  return 'Direct Outreach';
};

// MODIFIED: Added Date Held and Advisor columns
const toColumnValues = (
  source: BookedCallAttributionSource,
  mapping: PersonalBoardColumnMapping,
  columnsById: Map<string, MondayBoardColumn>,
): Record<string, unknown> => {
  const values: Record<string, unknown> = {};
  const setter = formatSetter(source.bucket === 'brandon' ? 'brandon' : 'jack');
  const callDate = resolveCallDate(source.eventTs);
  const link = slackPermalink(source.slackChannelId, source.slackMessageTs);

  addColumnValue(values, columnsById, mapping.callDateColumnId, callDate, { isDate: true });
  addColumnValue(values, columnsById, mapping.contactNameColumnId, normalizeContactName(source.contactName));
  addColumnValue(values, columnsById, mapping.phoneColumnId, source.contactPhone, { isPhone: true });
  addColumnValue(values, columnsById, mapping.setterColumnId, source.rep || setter, { isSetter: true });
  
  // FIXED: Use valid Monday.com status values
  addColumnValue(values, columnsById, mapping.stageColumnId, 'First Swing'); // Changed from 'Booked' to 'First Swing'
  addColumnValue(values, columnsById, mapping.firstConversionColumnId, source.firstConversion); // Keep original if not status column
  addColumnValue(values, columnsById, mapping.lineColumnId, mapLineToChannel(source.line)); // Map to valid Channel value
  addColumnValue(values, columnsById, mapping.sourceColumnId, mapSourceToMondaySource(source.firstConversion)); // Map to valid Source value
  
  addColumnValue(values, columnsById, mapping.slackLinkColumnId, link, { isLink: true });
  addColumnValue(
    values,
    columnsById,
    mapping.notesColumnId,
    [source.text, source.firstConversion ? `First conversion: ${source.firstConversion}` : null]
      .filter(Boolean)
      .join('\n'),
  );

  // NEW: Add Date Held and Advisor
  const dateHeld = parseDateHeldFromSlackRaw(source.raw);
  addColumnValue(values, columnsById, mapping.dateHeldColumnId, dateHeld, { isDate: true });

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
    raw: { attachments: [{ text: params.notes }]}, // Add a raw-like structure for parsing
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
  },
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<'synced' | 'skipped' | 'error'> => {
  const existing = await getMondayBookedCallPush(
    source.slackChannelId,
    source.slackMessageTs,
    logger,
  );

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
  return rows.filter((row) => row.bucket === bucket);
};

export const syncRecentSetterBookedCallsToMonday = async (
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<{ status: 'skipped' | 'success'; pushed: number; checked: number }> => {
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

  let pushed = 0;
  for (const row of rows) {
    const result = await pushOne(row, { boardId, mapping, columnsById }, logger);
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
    return { status: 'skipped', reason: 'MONDAY_PERSONAL_SYNC_ENABLED is false' };
  }

  const boardId = personalBoardId();
  if (!boardId) {
    return { status: 'skipped', reason: 'MONDAY_PERSONAL_BOARD_ID not configured' };
  }

  const rows = await loadRelevantSources({
    channelId: params.channelId,
    slackMessageTs: params.messageTs,
  });
  const match = rows.find((row) => row.slackChannelId === params.channelId && row.slackMessageTs === params.messageTs);
  if (!match) {
    return { status: 'skipped', reason: 'No setter-attributed booked call matched this Slack message yet' };
  }

  const { mapping, columnsById } = await loadBoardMapping(boardId, logger);
  const result = await pushOne(match, { boardId, mapping, columnsById }, logger);
  return result === 'error' ? { status: 'error' } : result === 'synced' ? { status: 'synced' } : { status: 'skipped' };
};
