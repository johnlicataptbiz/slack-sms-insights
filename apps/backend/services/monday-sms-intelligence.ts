import type { Logger } from '@slack/bolt';
import {
  MONDAY_SMS_SCHEMA_VERSION,
  buildBoardStructureDiagnostics,
  type MondayBoardKey,
  type MondayBoardStructureDiagnostics,
  type MondayColumnDefinition,
  mondaySmsBoardSchemas,
} from './monday-board-schemas.js';
import { createBoardColumn, queryBoardColumns, queryBoardItems, setBoardRelationLinks } from './monday-client.js';

type MondayLogger = Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>;

const parseBool = (value: string | undefined, fallback = false): boolean => {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === 'true';
};

const parseCsv = (value: string | undefined): string[] =>
  (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

const normalizeJoinKey = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed.toLowerCase() : null;
};

type ColumnValue = { id: string; type: string; text: string | null; value: string | null };
type Item = { id: string; name: string; columnValues: ColumnValue[] };

const parseColumnRelationIds = (value: string | null): string[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as { linkedPulseIds?: Array<{ linkedPulseId?: number | string }>; item_ids?: Array<number | string> };
    if (Array.isArray(parsed.item_ids)) {
      return parsed.item_ids.map((id) => String(id)).filter((id) => id.length > 0);
    }
    if (Array.isArray(parsed.linkedPulseIds)) {
      return parsed.linkedPulseIds
        .map((entry) => (entry?.linkedPulseId == null ? null : String(entry.linkedPulseId)))
        .filter((id): id is string => Boolean(id));
    }
  } catch {
    return [];
  }
  return [];
};

const dedupeIds = (ids: string[]): string[] => [...new Set(ids.filter((id) => id.trim().length > 0))];

const sameIdSet = (a: string[], b: string[]): boolean => {
  if (a.length !== b.length) return false;
  const setB = new Set(b);
  return a.every((value) => setB.has(value));
};

const getColumnIdByTitle = (
  columns: Array<{ id: string; title: string; type?: string }>,
  title: string,
): string | null => {
  const normalized = title.trim().toLowerCase();
  const found = columns.find((column) => column.title.trim().toLowerCase() === normalized);
  return found?.id || null;
};

const getColumnTextById = (item: Item, columnId: string | null): string | null => {
  if (!columnId) return null;
  return item.columnValues.find((column) => column.id === columnId)?.text || null;
};

const getColumnValueById = (item: Item, columnId: string | null): string | null => {
  if (!columnId) return null;
  return item.columnValues.find((column) => column.id === columnId)?.value || null;
};

const collectAllBoardItems = async (
  boardId: string,
  maxPages: number,
  logger?: MondayLogger,
): Promise<Item[]> => {
  let cursor: string | null = null;
  let pageCount = 0;
  const items: Item[] = [];

  while (pageCount < maxPages) {
    const page = await queryBoardItems(boardId, cursor, logger);
    items.push(...page.items);
    cursor = page.nextCursor;
    pageCount += 1;
    if (!cursor) break;
  }

  return items;
};

const createMissingColumns = async (
  boardId: string,
  missingColumns: MondayColumnDefinition[],
  logger?: MondayLogger,
): Promise<string[]> => {
  const created: string[] = [];
  for (const column of missingColumns) {
    try {
      await createBoardColumn(boardId, column);
      created.push(column.title);
    } catch (error) {
      logger?.warn?.('Failed to create intelligent monday column', { boardId, title: column.title, error: String(error) });
    }
  }
  return created;
};

const resolveMutationPolicy = (boardId: string): { allowed: boolean; reason?: string } => {
  const allowlist = parseCsv(process.env.MONDAY_SMS_MUTABLE_BOARD_ALLOWLIST);
  if (allowlist.length === 0) {
    return { allowed: false, reason: 'MONDAY_SMS_MUTABLE_BOARD_ALLOWLIST is empty' };
  }
  if (!allowlist.includes(boardId)) {
    return { allowed: false, reason: `board ${boardId} is not in allowlist` };
  }
  return { allowed: true };
};

export type MondayIntelligentSchemaResult = {
  diagnostics: MondayBoardStructureDiagnostics;
  createdColumns: string[];
  dryRun: boolean;
  mutationAllowed: boolean;
};

export const ensureMondayIntelligentBoardSchema = async (
  boardKey: MondayBoardKey,
  boardId: string,
  logger?: MondayLogger,
): Promise<MondayIntelligentSchemaResult> => {
  const dryRun = parseBool(process.env.MONDAY_SMS_INTELLIGENCE_DRY_RUN, true);
  const mutationToggle = parseBool(process.env.MONDAY_SMS_SCHEMA_MUTATION_ENABLED, false);
  const policy = resolveMutationPolicy(boardId);
  const mutationAllowed = policy.allowed && mutationToggle;

  const schema = mondaySmsBoardSchemas[boardKey];
  const beforeColumns = await queryBoardColumns(boardId, logger);
  const beforeDiagnostics = buildBoardStructureDiagnostics(boardKey, beforeColumns);

  if (!beforeDiagnostics.missingColumns.length || dryRun || !mutationAllowed) {
    if (!mutationAllowed && policy.reason) {
      logger?.warn?.('Intelligent schema mutation skipped by policy', { boardId, reason: policy.reason });
    }
    return {
      diagnostics: beforeDiagnostics,
      createdColumns: [],
      dryRun,
      mutationAllowed,
    };
  }

  const missing = schema.columns.filter((column) => beforeDiagnostics.missingColumns.includes(column.title));
  const createdColumns = await createMissingColumns(boardId, missing, logger);
  const afterColumns = await queryBoardColumns(boardId, logger);

  return {
    diagnostics: buildBoardStructureDiagnostics(boardKey, afterColumns),
    createdColumns,
    dryRun,
    mutationAllowed,
  };
};

export type MondayGraphReconcileStats = {
  boardKey: MondayBoardKey;
  scannedItems: number;
  patchedItems: number;
  linkedItems: number;
  missingJoinKeys: number;
  missingTargetLinks: number;
};

const reconcileSequencesToEvents = async (
  sequenceBoardId: string,
  eventsBoardId: string,
  maxPages: number,
  dryRun: boolean,
  logger?: MondayLogger,
): Promise<MondayGraphReconcileStats> => {
  const [sequenceColumns, eventColumns] = await Promise.all([
    queryBoardColumns(sequenceBoardId, logger),
    queryBoardColumns(eventsBoardId, logger),
  ]);
  const sequenceRunKeyId = getColumnIdByTitle(sequenceColumns, 'Sequence Run Key');
  const relationId = getColumnIdByTitle(sequenceColumns, 'Events Links');
  const eventRunKeyId = getColumnIdByTitle(eventColumns, 'Sequence Run Key');
  if (!sequenceRunKeyId || !relationId || !eventRunKeyId) {
    return {
      boardKey: 'sequences',
      scannedItems: 0,
      patchedItems: 0,
      linkedItems: 0,
      missingJoinKeys: 0,
      missingTargetLinks: 0,
    };
  }

  const [sequenceItems, eventItems] = await Promise.all([
    collectAllBoardItems(sequenceBoardId, maxPages, logger),
    collectAllBoardItems(eventsBoardId, maxPages, logger),
  ]);
  const eventsByRunKey = new Map<string, string[]>();
  for (const item of eventItems) {
    const runKey = normalizeJoinKey(getColumnTextById(item, eventRunKeyId));
    if (!runKey) continue;
    const list = eventsByRunKey.get(runKey) || [];
    list.push(item.id);
    eventsByRunKey.set(runKey, list);
  }

  let patchedItems = 0;
  let linkedItems = 0;
  let missingJoinKeys = 0;
  let missingTargetLinks = 0;

  for (const item of sequenceItems) {
    const runKey = normalizeJoinKey(getColumnTextById(item, sequenceRunKeyId));
    if (!runKey) {
      missingJoinKeys += 1;
      continue;
    }
    const desired = dedupeIds(eventsByRunKey.get(runKey) || []);
    if (!desired.length) {
      missingTargetLinks += 1;
      continue;
    }

    linkedItems += 1;
    const current = dedupeIds(parseColumnRelationIds(getColumnValueById(item, relationId)));
    if (sameIdSet(current, desired)) continue;
    patchedItems += 1;
    if (!dryRun) {
      await setBoardRelationLinks(sequenceBoardId, item.id, relationId, desired, logger);
    }
  }

  return {
    boardKey: 'sequences',
    scannedItems: sequenceItems.length,
    patchedItems,
    linkedItems,
    missingJoinKeys,
    missingTargetLinks,
  };
};

const reconcileReportsToSequences = async (
  reportsBoardId: string,
  sequenceBoardId: string,
  maxPages: number,
  dryRun: boolean,
  logger?: MondayLogger,
): Promise<MondayGraphReconcileStats> => {
  const [reportColumns, sequenceColumns] = await Promise.all([
    queryBoardColumns(reportsBoardId, logger),
    queryBoardColumns(sequenceBoardId, logger),
  ]);
  const reportDayKeyId = getColumnIdByTitle(reportColumns, 'Report Day Key');
  const relationId = getColumnIdByTitle(reportColumns, 'Sequence Links');
  const sequenceDayKeyId = getColumnIdByTitle(sequenceColumns, 'Report Day Key');
  if (!reportDayKeyId || !relationId || !sequenceDayKeyId) {
    return {
      boardKey: 'reports',
      scannedItems: 0,
      patchedItems: 0,
      linkedItems: 0,
      missingJoinKeys: 0,
      missingTargetLinks: 0,
    };
  }

  const [reportItems, sequenceItems] = await Promise.all([
    collectAllBoardItems(reportsBoardId, maxPages, logger),
    collectAllBoardItems(sequenceBoardId, maxPages, logger),
  ]);
  const sequencesByDay = new Map<string, string[]>();
  for (const item of sequenceItems) {
    const dayKey = normalizeJoinKey(getColumnTextById(item, sequenceDayKeyId));
    if (!dayKey) continue;
    const list = sequencesByDay.get(dayKey) || [];
    list.push(item.id);
    sequencesByDay.set(dayKey, list);
  }

  let patchedItems = 0;
  let linkedItems = 0;
  let missingJoinKeys = 0;
  let missingTargetLinks = 0;

  for (const item of reportItems) {
    const dayKey = normalizeJoinKey(getColumnTextById(item, reportDayKeyId));
    if (!dayKey) {
      missingJoinKeys += 1;
      continue;
    }
    const desired = dedupeIds(sequencesByDay.get(dayKey) || []);
    if (!desired.length) {
      missingTargetLinks += 1;
      continue;
    }

    linkedItems += 1;
    const current = dedupeIds(parseColumnRelationIds(getColumnValueById(item, relationId)));
    if (sameIdSet(current, desired)) continue;
    patchedItems += 1;
    if (!dryRun) {
      await setBoardRelationLinks(reportsBoardId, item.id, relationId, desired, logger);
    }
  }

  return {
    boardKey: 'reports',
    scannedItems: reportItems.length,
    patchedItems,
    linkedItems,
    missingJoinKeys,
    missingTargetLinks,
  };
};

export const runMondaySmsIntelligentGraphReconciliation = async (
  ids: {
    eventsBoardId?: string;
    sequencesBoardId?: string;
    reportsBoardId?: string;
  },
  logger?: MondayLogger,
): Promise<MondayGraphReconcileStats[]> => {
  const enabled = parseBool(process.env.MONDAY_SMS_RELATION_RECONCILE_ENABLED, true);
  if (!enabled) return [];

  const maxPages = Number.parseInt(process.env.MONDAY_SMS_RELATION_RECONCILE_MAX_PAGES || '50', 10);
  const dryRun = parseBool(process.env.MONDAY_SMS_INTELLIGENCE_DRY_RUN, true);
  const stats: MondayGraphReconcileStats[] = [];

  if (ids.sequencesBoardId && ids.eventsBoardId) {
    stats.push(await reconcileSequencesToEvents(ids.sequencesBoardId, ids.eventsBoardId, maxPages, dryRun, logger));
  }

  if (ids.reportsBoardId && ids.sequencesBoardId) {
    stats.push(await reconcileReportsToSequences(ids.reportsBoardId, ids.sequencesBoardId, maxPages, dryRun, logger));
  }

  return stats;
};

export type MondaySyncDiagnostics = {
  schemaVersion: typeof MONDAY_SMS_SCHEMA_VERSION;
  structureValid: boolean;
  linkCoverage: number;
  kpiParityDelta: number | null;
  duplicatesDetected: number;
  missingColumns: string[];
  driftedColumns: Array<{ title: string; expectedType: string; actualType: string | null }>;
};

export const buildSyncDiagnostics = (
  structure: MondayBoardStructureDiagnostics,
  linkCoverage: number,
  duplicatesDetected: number,
  kpiParityDelta: number | null = null,
): MondaySyncDiagnostics => ({
  schemaVersion: MONDAY_SMS_SCHEMA_VERSION,
  structureValid: structure.structureValid,
  linkCoverage,
  kpiParityDelta,
  duplicatesDetected,
  missingColumns: structure.missingColumns,
  driftedColumns: structure.driftedColumns.map((entry) => ({
    title: entry.title,
    expectedType: entry.expectedType,
    actualType: entry.actualType,
  })),
});

export const computeDuplicatesDetected = (
  items: Array<{ id: string; joinKey: string | null }>,
): number => {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = normalizeJoinKey(item.joinKey);
    if (!key) continue;
    counts.set(key, (counts.get(key) || 0) + 1);
  }

  let duplicates = 0;
  for (const count of counts.values()) {
    if (count > 1) duplicates += count - 1;
  }
  return duplicates;
};

export const computeLinkCoverage = (items: Array<{ linkedIds: string[] }>): number => {
  if (!items.length) return 1;
  const linked = items.filter((item) => item.linkedIds.length > 0).length;
  return Number((linked / items.length).toFixed(4));
};
