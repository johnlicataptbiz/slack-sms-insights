import type { Logger } from '@slack/bolt';
import { queryBoardColumns, queryBoardItems } from './monday-client.js';
import {
  buildSyncDiagnostics,
  computeDuplicatesDetected,
  computeLinkCoverage,
  ensureMondayIntelligentBoardSchema,
  type MondaySyncDiagnostics,
} from './monday-sms-intelligence.js';
import {
  coerceBoardMapping,
  inferBoardMapping,
  mergeBoardMappings,
  normalizeBoardItem,
  readBoardMappingFromEnv,
} from './monday-mapping.js';
import {
  getMondayBoardRegistry,
  getMondayColumnMapping,
  getMondaySyncState,
  saveMondayColumnMapping,
  upsertMondayCallColumnValues,
  upsertMondayCallSnapshot,
  upsertMondayMetricFacts,
  upsertNormalizedMondayLeadRecords,
  upsertMondayBoardRegistry,
  upsertMondaySyncState,
} from './monday-store.js';
import { findColumnIdByTitle } from './monday-board-schemas.js';

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

export const mondaySmsSequencesConfig = {
  syncEnabled: parseBool(process.env.MONDAY_SMS_SEQUENCES_SYNC_ENABLED),
  writebackEnabled: parseBool(process.env.MONDAY_SMS_SEQUENCES_WRITEBACK_ENABLED),
  outboundEnabled: parseBool(process.env.MONDAY_SMS_SEQUENCES_OUTBOUND_ENABLED),
  autoWriteEnabled: parseBool(process.env.MONDAY_SMS_SEQUENCES_AUTO_WRITE_ENABLED, false),
  smsSequencesBoardId: (process.env.MONDAY_SMS_SEQUENCES_BOARD_ID || '').trim(),
  syncBoardIds: parseCsv(process.env.MONDAY_SMS_SEQUENCES_SYNC_BOARD_IDS),
  extraBoardIds: parseCsv(process.env.MONDAY_SMS_SEQUENCES_SYNC_EXTRA_BOARD_IDS),
  backfillDays: Number.parseInt(process.env.MONDAY_SMS_SEQUENCES_SYNC_BACKFILL_DAYS || '90', 10),
  maxPagesPerRun: Number.parseInt(process.env.MONDAY_SMS_SEQUENCES_SYNC_MAX_PAGES || '20', 10),
  pollIntervalMs: Number.parseInt(process.env.MONDAY_SMS_SEQUENCES_SYNC_INTERVAL_MS || `${15 * 60 * 1000}`, 10),
};

export type MondaySmsSequencesSyncResult = {
  status: 'skipped' | 'success' | 'error';
  boardId: string;
  fetchedItems: number;
  upsertedItems: number;
  nextCursor: string | null;
  startedAt: string;
  finishedAt: string;
  diagnostics: MondaySyncDiagnostics;
  error?: string;
};

const cutoffDate = (daysBack: number): Date => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() - Math.max(1, daysBack));
  return value;
};

const parseColumnValueJson = (value: string | null): unknown | null => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
};

const resolveSyncBoardIds = (): string[] => {
  const baseIds =
    mondaySmsSequencesConfig.syncBoardIds.length > 0
      ? mondaySmsSequencesConfig.syncBoardIds
      : [mondaySmsSequencesConfig.smsSequencesBoardId];
  const ids = [...baseIds, ...mondaySmsSequencesConfig.extraBoardIds]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return [...new Set(ids)];
};

const resolveDefaultBoardGovernance = (boardId: string) => {
  if (boardId === mondaySmsSequencesConfig.smsSequencesBoardId) {
    return {
      boardLabel: 'SMS Sequences',
      boardClass: 'sms_sequences' as const,
      metricGrain: 'sequence_item' as const,
      includeInFunnel: false,
      includeInExec: true,
      ownerTeam: 'sales',
      notes: 'Auto-classified from SMS sequences board config',
    };
  }
  return {
    boardLabel: `Board ${boardId}`,
    boardClass: 'other' as const,
    metricGrain: 'aggregate_metric' as const,
    includeInFunnel: false,
    includeInExec: true,
    ownerTeam: 'ops',
    notes: 'Auto-registered by monday sms sequences sync',
  };
};

export const listMondaySmsSequencesSyncBoardIds = (): string[] => resolveSyncBoardIds();

export const syncMondaySmsSequencesBoard = async (
  boardId: string,
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
  options?: { force?: boolean },
): Promise<MondaySmsSequencesSyncResult> => {
  const startedAt = new Date().toISOString();
  if (!mondaySmsSequencesConfig.syncEnabled) {
    return {
      status: 'skipped',
      boardId,
      fetchedItems: 0,
      upsertedItems: 0,
      nextCursor: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      diagnostics: {
        schemaVersion: 'intelligent-v1',
        structureValid: false,
        linkCoverage: 0,
        kpiParityDelta: null,
        duplicatesDetected: 0,
        missingColumns: [],
        driftedColumns: [],
      },
      error: 'MONDAY_SMS_SEQUENCES_SYNC_ENABLED is false',
    };
  }

  const state = await getMondaySyncState(boardId, logger);
  const force = options?.force === true;
  const initialSync = force ? true : !state?.last_sync_at;
  const lastSyncAt = state?.last_sync_at ? new Date(state.last_sync_at) : null;
  const backfillCutoff = cutoffDate(mondaySmsSequencesConfig.backfillDays);

  await upsertMondaySyncState({ boardId, cursor: state?.cursor || null, status: 'running', error: null }, logger);

  try {
    const [columns, persistedRaw] = await Promise.all([
      queryBoardColumns(boardId, logger),
      getMondayColumnMapping(boardId, logger),
    ]);
    const schemaResult = await ensureMondayIntelligentBoardSchema('sequences', boardId, logger);
    const inferred = inferBoardMapping(columns);
    const persisted = coerceBoardMapping(persistedRaw);
    const envOverride = readBoardMappingFromEnv();
    const mapping = mergeBoardMappings(mergeBoardMappings(inferred, persisted), envOverride) || inferred;
    if (envOverride) {
      logger?.info?.('Using MONDAY_SMS_SEQUENCES_COLUMN_MAP_JSON override for monday sms sequences sync mapping', {
        boardId,
      });
    }
    await saveMondayColumnMapping(boardId, mapping, logger);
    const columnsById = new Map(columns.map((column) => [column.id, column]));
    const relationColumnId = findColumnIdByTitle(columns, ['Events Links']);
    const joinKeyColumnId = findColumnIdByTitle(columns, ['Sequence Run Key']);
    let boardProfile = await getMondayBoardRegistry(boardId, logger);
    if (!boardProfile) {
      const fallback = resolveDefaultBoardGovernance(boardId);
      await upsertMondayBoardRegistry(
        {
          boardId,
          boardLabel: fallback.boardLabel,
          boardClass: fallback.boardClass,
          metricGrain: fallback.metricGrain,
          includeInFunnel: fallback.includeInFunnel,
          includeInExec: fallback.includeInExec,
          active: true,
          ownerTeam: fallback.ownerTeam,
          notes: fallback.notes,
        },
        logger,
      );
      boardProfile = await getMondayBoardRegistry(boardId, logger);
    }

    let cursor = state?.cursor || null;
    let fetchedItems = 0;
    let upsertedItems = 0;
    const diagnosticJoinKeys: Array<{ id: string; joinKey: string | null }> = [];
    const diagnosticLinks: Array<{ linkedIds: string[] }> = [];
    let pageCount = 0;

    while (pageCount < mondaySmsSequencesConfig.maxPagesPerRun) {
      let page: Awaited<ReturnType<typeof queryBoardItems>>;
      try {
        page = await queryBoardItems(boardId, cursor, logger);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isExpiredCursor = Boolean(cursor) && /cursor.*expired/i.test(message);
        if (!isExpiredCursor) throw error;

        logger?.warn?.('Monday SMS Sequences cursor expired; restarting board pagination from first page', { boardId });
        cursor = null;
        page = await queryBoardItems(boardId, cursor, logger);
      }

      fetchedItems += page.items.length;
      pageCount += 1;

      for (const item of page.items) {
        const normalized = normalizeBoardItem(item, mapping);
        if (!normalized) continue;

        if (!force && initialSync && normalized.updatedAt < backfillCutoff) continue;
        if (!force && !initialSync && lastSyncAt && normalized.updatedAt <= lastSyncAt) continue;

        const values = item.columnValues.map((column) => ({
          columnId: column.id,
          columnTitle: columnsById.get(column.id)?.title || null,
          columnType: column.type || columnsById.get(column.id)?.type || null,
          textValue: column.text,
          valueJson: parseColumnValueJson(column.value),
        }));

        await upsertMondayCallSnapshot(
          {
            boardId,
            itemId: normalized.itemId,
            itemName: normalized.itemName,
            updatedAt: normalized.updatedAt,
            callDate: normalized.callDate,
            setter: normalized.setter,
            stage: normalized.stage,
            disposition: normalized.disposition,
            isBooked: normalized.isBooked,
            contactKey: normalized.contactKey,
            raw: normalized.raw,
          },
          logger,
        );
        await upsertMondayCallColumnValues(
          {
            boardId,
            itemId: normalized.itemId,
            itemUpdatedAt: normalized.updatedAt,
            values,
          },
          logger,
        );
        await upsertNormalizedMondayLeadRecords(
          {
            boardId,
            itemId: normalized.itemId,
            itemName: normalized.itemName,
            itemUpdatedAt: normalized.updatedAt,
            callDate: normalized.callDate,
            contactKey: normalized.contactKey,
            setter: normalized.setter,
            stage: normalized.stage,
            disposition: normalized.disposition,
            isBooked: normalized.isBooked,
            columns: values,
            raw: normalized.raw,
          },
          logger,
        );
        await upsertMondayMetricFacts(
          {
            boardId,
            itemId: normalized.itemId,
            itemUpdatedAt: normalized.updatedAt,
            callDate: normalized.callDate,
            setter: normalized.setter,
            columns: values,
            raw: normalized.raw,
          },
          logger,
        );
        upsertedItems += 1;

        diagnosticJoinKeys.push({
          id: normalized.itemId,
          joinKey: item.columnValues.find((value) => value.id === joinKeyColumnId)?.text || null,
        });
        const linkedIds = (() => {
          if (!relationColumnId) return [];
          const raw = item.columnValues.find((value) => value.id === relationColumnId)?.value || null;
          if (!raw) return [];
          try {
            const parsed = JSON.parse(raw) as { item_ids?: Array<number | string>; linkedPulseIds?: Array<{ linkedPulseId?: number | string }> };
            if (Array.isArray(parsed.item_ids)) return parsed.item_ids.map((id) => String(id));
            if (Array.isArray(parsed.linkedPulseIds)) {
              return parsed.linkedPulseIds
                .map((entry) => (entry?.linkedPulseId == null ? null : String(entry.linkedPulseId)))
                .filter((id): id is string => Boolean(id));
            }
          } catch {
            return [];
          }
          return [];
        })();
        diagnosticLinks.push({ linkedIds });
      }

      cursor = page.nextCursor;
      if (!cursor) break;
    }

    const diagnostics = buildSyncDiagnostics(
      schemaResult.diagnostics,
      computeLinkCoverage(diagnosticLinks),
      computeDuplicatesDetected(diagnosticJoinKeys),
    );

    await upsertMondaySyncState(
      {
        boardId,
        cursor,
        lastSyncAt: new Date(),
        status: 'success',
        error: null,
      },
      logger,
    );

    return {
      status: 'success',
      boardId,
      fetchedItems,
      upsertedItems,
      nextCursor: cursor,
      startedAt,
      finishedAt: new Date().toISOString(),
      diagnostics,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await upsertMondaySyncState(
      {
        boardId,
        status: 'error',
        error: message,
        lastSyncAt: new Date(),
      },
      logger,
    );

    return {
      status: 'error',
      boardId,
      fetchedItems: 0,
      upsertedItems: 0,
      nextCursor: state?.cursor || null,
      startedAt,
      finishedAt: new Date().toISOString(),
      diagnostics: {
        schemaVersion: 'intelligent-v1',
        structureValid: false,
        linkCoverage: 0,
        kpiParityDelta: null,
        duplicatesDetected: 0,
        missingColumns: [],
        driftedColumns: [],
      },
      error: message,
    };
  }
};

export const startMondaySmsSequencesSyncJobs = (
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): (() => void) => {
  if (!mondaySmsSequencesConfig.syncEnabled) {
    logger?.info?.('Monday SMS Sequences jobs disabled');
    return () => {};
  }

  logger?.info?.('Starting Monday SMS Sequences maintenance jobs', {
    syncEnabled: mondaySmsSequencesConfig.syncEnabled,
    outboundEnabled: mondaySmsSequencesConfig.outboundEnabled,
    autoWriteEnabled: mondaySmsSequencesConfig.autoWriteEnabled,
    boardIds: listMondaySmsSequencesSyncBoardIds(),
    intervalMs: mondaySmsSequencesConfig.pollIntervalMs,
  });

  const initialTimer = setTimeout(() => {
    void runMondaySmsSequencesMaintenanceCycle(logger);
  }, 10_000);

  const interval = setInterval(() => {
    void runMondaySmsSequencesMaintenanceCycle(logger);
  }, mondaySmsSequencesConfig.pollIntervalMs);

  return () => {
    clearTimeout(initialTimer);
    clearInterval(interval);
  };
};

const runMondaySmsSequencesMaintenanceCycle = async (
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<void> => {
  for (const boardId of listMondaySmsSequencesSyncBoardIds()) {
    const syncResult = await syncMondaySmsSequencesBoard(boardId, logger);
    if (syncResult.status === 'error') {
      logger?.warn?.('Monday SMS Sequences sync cycle failed', { boardId, error: syncResult.error });
    }
  }
};
