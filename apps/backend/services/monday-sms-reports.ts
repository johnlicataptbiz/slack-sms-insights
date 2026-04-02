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

export const mondaySmsReportsConfig = {
  syncEnabled: parseBool(process.env.MONDAY_SMS_REPORTS_SYNC_ENABLED),
  writebackEnabled: parseBool(process.env.MONDAY_SMS_REPORTS_WRITEBACK_ENABLED),
  outboundEnabled: parseBool(process.env.MONDAY_SMS_REPORTS_OUTBOUND_ENABLED),
  autoWriteEnabled: parseBool(process.env.MONDAY_SMS_REPORTS_AUTO_WRITE_ENABLED, false),
  smsReportsBoardId: (process.env.MONDAY_SMS_REPORTS_BOARD_ID || '').trim(),
  syncBoardIds: parseCsv(process.env.MONDAY_SMS_REPORTS_SYNC_BOARD_IDS),
  extraBoardIds: parseCsv(process.env.MONDAY_SMS_REPORTS_SYNC_EXTRA_BOARD_IDS),
  backfillDays: Number.parseInt(process.env.MONDAY_SMS_REPORTS_SYNC_BACKFILL_DAYS || '90', 10),
  maxPagesPerRun: Number.parseInt(process.env.MONDAY_SMS_REPORTS_SYNC_MAX_PAGES || '20', 10),
  pollIntervalMs: Number.parseInt(process.env.MONDAY_SMS_REPORTS_SYNC_INTERVAL_MS || `${15 * 60 * 1000}`, 10),
};

export type MondaySmsReportsSyncResult = {
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
    mondaySmsReportsConfig.syncBoardIds.length > 0
      ? mondaySmsReportsConfig.syncBoardIds
      : [mondaySmsReportsConfig.smsReportsBoardId];
  const ids = [...baseIds, ...mondaySmsReportsConfig.extraBoardIds]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return [...new Set(ids)];
};

const resolveDefaultBoardGovernance = (boardId: string) => {
  if (boardId === mondaySmsReportsConfig.smsReportsBoardId) {
    return {
      boardLabel: 'SMS Daily Reports',
      boardClass: 'sms_reports' as const,
      metricGrain: 'report_item' as const,
      includeInFunnel: false,
      includeInExec: true,
      ownerTeam: 'ops',
      notes: 'Auto-classified from SMS reports board config',
    };
  }
  return {
    boardLabel: `Board ${boardId}`,
    boardClass: 'other' as const,
    metricGrain: 'aggregate_metric' as const,
    includeInFunnel: false,
    includeInExec: true,
    ownerTeam: 'ops',
    notes: 'Auto-registered by monday sms reports sync',
  };
};

export const listMondaySmsReportsSyncBoardIds = (): string[] => resolveSyncBoardIds();

export const syncMondaySmsReportsBoard = async (
  boardId: string,
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
  options?: { force?: boolean },
): Promise<MondaySmsReportsSyncResult> => {
  const startedAt = new Date().toISOString();
  if (!mondaySmsReportsConfig.syncEnabled) {
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
      error: 'MONDAY_SMS_REPORTS_SYNC_ENABLED is false',
    };
  }

  const state = await getMondaySyncState(boardId, logger);
  const force = options?.force === true;
  const initialSync = force ? true : !state?.last_sync_at;
  const lastSyncAt = state?.last_sync_at ? new Date(state.last_sync_at) : null;
  const backfillCutoff = cutoffDate(mondaySmsReportsConfig.backfillDays);

  await upsertMondaySyncState({ boardId, cursor: state?.cursor || null, status: 'running', error: null }, logger);

  try {
    const [columns, persistedRaw] = await Promise.all([
      queryBoardColumns(boardId, logger),
      getMondayColumnMapping(boardId, logger),
    ]);
    const schemaResult = await ensureMondayIntelligentBoardSchema('reports', boardId, logger);
    const inferred = inferBoardMapping(columns);
    const persisted = coerceBoardMapping(persistedRaw);
    const envOverride = readBoardMappingFromEnv();
    const mapping = mergeBoardMappings(mergeBoardMappings(inferred, persisted), envOverride) || inferred;
    if (envOverride) {
      logger?.info?.('Using MONDAY_SMS_REPORTS_COLUMN_MAP_JSON override for monday sms reports sync mapping', {
        boardId,
      });
    }
    await saveMondayColumnMapping(boardId, mapping, logger);
    const columnsById = new Map(columns.map((column) => [column.id, column]));
    const relationColumnId = findColumnIdByTitle(columns, ['Sequence Links']);
    const joinKeyColumnId = findColumnIdByTitle(columns, ['Report Day Key']);
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

    while (pageCount < mondaySmsReportsConfig.maxPagesPerRun) {
      let page: Awaited<ReturnType<typeof queryBoardItems>>;
      try {
        page = await queryBoardItems(boardId, cursor, logger);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isExpiredCursor = Boolean(cursor) && /cursor.*expired/i.test(message);
        if (!isExpiredCursor) throw error;

        logger?.warn?.('Monday SMS Reports cursor expired; restarting board pagination from first page', { boardId });
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

export const startMondaySmsReportsSyncJobs = (
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): (() => void) => {
  if (!mondaySmsReportsConfig.syncEnabled) {
    logger?.info?.('Monday SMS Reports jobs disabled');
    return () => {};
  }

  logger?.info?.('Starting Monday SMS Reports maintenance jobs', {
    syncEnabled: mondaySmsReportsConfig.syncEnabled,
    outboundEnabled: mondaySmsReportsConfig.outboundEnabled,
    autoWriteEnabled: mondaySmsReportsConfig.autoWriteEnabled,
    boardIds: listMondaySmsReportsSyncBoardIds(),
    intervalMs: mondaySmsReportsConfig.pollIntervalMs,
  });

  const initialTimer = setTimeout(() => {
    void runMondaySmsReportsMaintenanceCycle(logger);
  }, 10_000);

  const interval = setInterval(() => {
    void runMondaySmsReportsMaintenanceCycle(logger);
  }, mondaySmsReportsConfig.pollIntervalMs);

  return () => {
    clearTimeout(initialTimer);
    clearInterval(interval);
  };
};

const runMondaySmsReportsMaintenanceCycle = async (
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<void> => {
  for (const boardId of listMondaySmsReportsSyncBoardIds()) {
    const syncResult = await syncMondaySmsReportsBoard(boardId, logger);
    if (syncResult.status === 'error') {
      logger?.warn?.('Monday SMS Reports sync cycle failed', { boardId, error: syncResult.error });
    }
  }
};
