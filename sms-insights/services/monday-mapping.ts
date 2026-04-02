import type { MondayBoardColumn, MondayBoardItem } from './monday-client.js';
import type { MondayCallDisposition } from './monday-store.js';

export type MondayBoardMapping = {
  callDateColumnId: string | null;
  setterColumnId: string | null;
  stageColumnId: string | null;
  outcomeColumnId: string | null;
  phoneColumnId: string | null;
  contactIdColumnId: string | null;
};

const asNullableString = (value: unknown): string | null => {
  if (typeof value === 'string' && value.trim().length > 0) return value.trim();
  return null;
};

export const coerceBoardMapping = (value: unknown): MondayBoardMapping | null => {
  if (typeof value !== 'object' || value === null) return null;
  const row = value as Record<string, unknown>;
  return {
    callDateColumnId: asNullableString(row.callDateColumnId),
    setterColumnId: asNullableString(row.setterColumnId),
    stageColumnId: asNullableString(row.stageColumnId),
    outcomeColumnId: asNullableString(row.outcomeColumnId),
    phoneColumnId: asNullableString(row.phoneColumnId),
    contactIdColumnId: asNullableString(row.contactIdColumnId),
  };
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

export const readBoardMappingFromEnv = (raw?: string): MondayBoardMapping | null => {
  return coerceBoardMapping(parseJsonMapping(raw ?? process.env.MONDAY_ACQ_COLUMN_MAP_JSON));
};

export const mergeBoardMappings = (
  base: MondayBoardMapping | null,
  override: MondayBoardMapping | null,
): MondayBoardMapping | null => {
  if (!base && !override) return null;
  if (!base) return override;
  if (!override) return base;
  return {
    callDateColumnId: override.callDateColumnId || base.callDateColumnId,
    setterColumnId: override.setterColumnId || base.setterColumnId,
    stageColumnId: override.stageColumnId || base.stageColumnId,
    outcomeColumnId: override.outcomeColumnId || base.outcomeColumnId,
    phoneColumnId: override.phoneColumnId || base.phoneColumnId,
    contactIdColumnId: override.contactIdColumnId || base.contactIdColumnId,
  };
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

export const inferBoardMapping = (columns: MondayBoardColumn[]): MondayBoardMapping => {
  return {
    callDateColumnId: findColumnBySignals(columns, ['call date', 'date', 'meeting date', 'date4']),
    setterColumnId: findColumnBySignals(columns, ['setter', 'owner', 'assignee', 'people']),
    stageColumnId: findColumnBySignals(columns, ['stage', 'pipeline', 'status']),
    outcomeColumnId: findColumnBySignals(columns, ['outcome', 'result', 'disposition']),
    phoneColumnId: findColumnBySignals(columns, ['phone', 'mobile']),
    contactIdColumnId: findColumnBySignals(columns, ['contact id', 'contactid', 'hubspot id']),
  };
};

const getValueByColumnId = (
  item: MondayBoardItem,
  columnId: string | null,
): { text: string | null; value: string | null } | null => {
  if (!columnId) return null;
  const column = item.columnValues.find((value) => value.id === columnId);
  if (!column) return null;
  return { text: column.text, value: column.value };
};

const parseIsoDate = (candidate: string | null | undefined): string | null => {
  if (!candidate) return null;
  const directMatch = candidate.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (directMatch?.[1]) return directMatch[1];

  const parsed = new Date(candidate);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const parseMondayDateValue = (columnValue: { text: string | null; value: string | null } | null): string | null => {
  if (!columnValue) return null;
  const fromText = parseIsoDate(columnValue.text);
  if (fromText) return fromText;

  if (columnValue.value) {
    try {
      const parsed = JSON.parse(columnValue.value) as { date?: string; changed_at?: string };
      if (parsed.date) return parseIsoDate(parsed.date);
      if (parsed.changed_at) return parseIsoDate(parsed.changed_at);
    } catch {
      // ignore malformed JSON and continue with null
    }
  }
  return null;
};

const classifyDisposition = (stage: string | null, outcome: string | null): MondayCallDisposition | null => {
  const text = `${stage || ''} ${outcome || ''}`.toLowerCase();
  if (!text.trim()) return null;
  if (/\bno[\s-]?show\b/.test(text)) return 'no_show';
  if (/\bcancel|cancelled|canceled|resched/i.test(text)) return 'cancelled';
  if (/\bbooked|appointment|strategy call booked|showed|closed won\b/.test(text)) return 'booked';
  return 'other';
};

const normalizePhone = (value: string | null): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 7 ? digits : null;
};

export type NormalizedMondayItem = {
  itemId: string;
  itemName: string;
  updatedAt: Date;
  callDate: string | null;
  setter: string | null;
  stage: string | null;
  disposition: MondayCallDisposition | null;
  isBooked: boolean;
  contactKey: string | null;
  raw: MondayBoardItem;
};

export const normalizeBoardItem = (item: MondayBoardItem, mapping: MondayBoardMapping): NormalizedMondayItem | null => {
  const updatedAt = new Date(item.updatedAt);
  if (!Number.isFinite(updatedAt.getTime())) return null;

  const stage = getValueByColumnId(item, mapping.stageColumnId)?.text?.trim() || null;
  const outcome = getValueByColumnId(item, mapping.outcomeColumnId)?.text?.trim() || null;
  const setter = getValueByColumnId(item, mapping.setterColumnId)?.text?.trim() || null;
  const callDate = parseMondayDateValue(getValueByColumnId(item, mapping.callDateColumnId));
  const contactId = getValueByColumnId(item, mapping.contactIdColumnId)?.text?.trim() || null;
  const phone = normalizePhone(getValueByColumnId(item, mapping.phoneColumnId)?.text || null);
  const disposition = classifyDisposition(stage, outcome);

  // Business rule: items on this board represent booked calls (this is not our CRM).
  // If mapping fails to detect booked status, default to true so we don't silently drop booked calls.
  const isBooked = true;

  // Prefer stable identifiers when available, but fall back to item name so we can still link
  // to conversations via fuzzy matching (names should match Aloware/Slack per our workflow).
  const contactKey = contactId
    ? `contact:${contactId}`
    : phone
      ? `phone:${phone}`
      : item.name?.trim()
        ? `name:${item.name.trim()}`
        : null;

  return {
    itemId: item.id,
    itemName: item.name,
    updatedAt,
    callDate,
    setter,
    stage,
    disposition,
    isBooked,
    contactKey,
    raw: item,
  };
};
