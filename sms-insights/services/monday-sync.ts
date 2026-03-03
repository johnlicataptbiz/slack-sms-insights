import type { Logger } from '@slack/bolt';
import { queryBoardColumns, queryBoardItems } from './monday-client.js';
import {
  coerceBoardMapping,
  inferBoardMapping,
  mergeBoardMappings,
  normalizeBoardItem,
  readBoardMappingFromEnv,
} from './monday-mapping.js';
import {
  getMondayColumnMapping,
  getMondaySyncState,
  saveMondayColumnMapping,
  upsertMondayCallColumnValues,
  upsertMondayCallSnapshot,
  upsertNormalizedMondayLeadRecords,
  upsertMondaySyncState,
} from './monday-store.js';

const parseBool = (value: string | undefined): boolean => value?.trim().toLowerCase() === 'true';
const parseCsv = (value: string | undefined): string[] =>
  (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

export const mondayConfig = {
  syncEnabled: parseBool(process.env.MONDAY_SYNC_ENABLED),
  writebackEnabled: parseBool(process.env.MONDAY_WRITEBACK_ENABLED),
  personalSyncEnabled: parseBool(process.env.MONDAY_PERSONAL_SYNC_ENABLED),
  outboundEnabled: parseBool(process.env.MONDAY_OUTBOUND_ENABLED),
  acqBoardId: (process.env.MONDAY_ACQ_BOARD_ID || '5077164868').trim(),
  salesCallsBoardId: (process.env.MONDAY_SALES_CALLS_BOARD_ID || process.env.MONDAY_ACQ_BOARD_ID || '5077164868').trim(),
  myCallsBoardId: (process.env.MONDAY_MY_CALLS_BOARD_ID || '10029059942').trim(),
  personalBoardId: (
    process.env.MONDAY_PERSONAL_BOARD_ID ||
    process.env.MONDAY_MY_CALLS_BOARD_ID ||
    '10029059942'
  ).trim(),
  syncBoardIds: parseCsv(process.env.MONDAY_SYNC_BOARD_IDS),
  extraBoardIds: parseCsv(process.env.MONDAY_SYNC_EXTRA_BOARD_IDS),
  backfillDays: Number.parseInt(process.env.MONDAY_SYNC_BACKFILL_DAYS || '90', 10),
  maxPagesPerRun: Number.parseInt(process.env.MONDAY_SYNC_MAX_PAGES || '20', 10),
  pollIntervalMs: Number.parseInt(process.env.MONDAY_SYNC_INTERVAL_MS || `${15 * 60 * 1000}`, 10),
};

let mondayCycleInFlight = false;

export type MondaySyncResult = {
  status: 'skipped' | 'success' | 'error';
  boardId: string;
  fetchedItems: number;
  upsertedItems: number;
  nextCursor: string | null;
  startedAt: string;
  finishedAt: string;
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
    mondayConfig.syncBoardIds.length > 0
      ? mondayConfig.syncBoardIds
      : [mondayConfig.acqBoardId, mondayConfig.salesCallsBoardId];
  const ids = [...baseIds, ...mondayConfig.extraBoardIds]
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return [...new Set(ids)];
};

export const listMondaySyncBoardIds = (): string[] => resolveSyncBoardIds();

export const syncMondayBoard = async (
  boardId: string,
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
  options?: { force?: boolean },
): Promise<MondaySyncResult> => {
  const startedAt = new Date().toISOString();
  if (!mondayConfig.syncEnabled) {
    return {
      status: 'skipped',
      boardId,
      fetchedItems: 0,
      upsertedItems: 0,
      nextCursor: null,
      startedAt,
      finishedAt: new Date().toISOString(),
      error: 'MONDAY_SYNC_ENABLED is false',
    };
  }

  const state = await getMondaySyncState(boardId, logger);
  const force = options?.force === true;
  const initialSync = force ? true : !state?.last_sync_at;
  const lastSyncAt = state?.last_sync_at ? new Date(state.last_sync_at) : null;
  const backfillCutoff = cutoffDate(mondayConfig.backfillDays);

  await upsertMondaySyncState({ boardId, cursor: state?.cursor || null, status: 'running', error: null }, logger);

  try {
    const [columns, persistedRaw] = await Promise.all([
      queryBoardColumns(boardId, logger),
      getMondayColumnMapping(boardId, logger),
    ]);
    const inferred = inferBoardMapping(columns);
    const persisted = coerceBoardMapping(persistedRaw);
    const envOverride = readBoardMappingFromEnv();
    const mapping = mergeBoardMappings(mergeBoardMappings(inferred, persisted), envOverride) || inferred;
    if (envOverride) {
      logger?.info?.('Using MONDAY_ACQ_COLUMN_MAP_JSON override for monday sync mapping', { boardId });
    }
    await saveMondayColumnMapping(boardId, mapping, logger);
    const columnsById = new Map(columns.map((column) => [column.id, column]));

    let cursor = state?.cursor || null;
    let fetchedItems = 0;
    let upsertedItems = 0;
    let pageCount = 0;

    while (pageCount < mondayConfig.maxPagesPerRun) {
      let page;
      try {
        page = await queryBoardItems(boardId, cursor, logger);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isExpiredCursor = Boolean(cursor) && /cursor.*expired/i.test(message);
        if (!isExpiredCursor) throw error;

        logger?.warn?.('Monday cursor expired; restarting board pagination from first page', { boardId });
        cursor = null;
        page = await queryBoardItems(boardId, cursor, logger);
      }

      fetchedItems += page.items.length;
      pageCount += 1;

      for (const item of page.items) {
        const normalized = normalizeBoardItem(item, mapping);
        if (!normalized) continue;

        // Initial run uses a bounded historical window to avoid pulling the entire board.
        // Force mode re-upserts items regardless of updatedAt/lastSyncAt so mapping changes can be applied.
        if (!force && initialSync && normalized.updatedAt < backfillCutoff) continue;
        if (!force && !initialSync && lastSyncAt && normalized.updatedAt <= lastSyncAt) continue;

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
        const normalizedColumnValues = item.columnValues.map((columnValue) => {
          const metadata = columnsById.get(columnValue.id);
          return {
            columnId: columnValue.id,
            columnTitle: metadata?.title || null,
            columnType: metadata?.type || columnValue.type || null,
            textValue: columnValue.text?.trim() || null,
            valueJson: parseColumnValueJson(columnValue.value),
          };
        });
        await upsertMondayCallColumnValues(
          {
            boardId,
            itemId: normalized.itemId,
            itemUpdatedAt: normalized.updatedAt,
            values: normalizedColumnValues,
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
            columns: normalizedColumnValues,
            raw: normalized.raw,
          },
          logger,
        );
        upsertedItems += 1;
      }

      cursor = page.nextCursor;
      if (!cursor) break;
    }

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
      error: message,
    };
  }
};

export const syncMondayAcquisitionsBoard = async (
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<MondaySyncResult> => {
  return syncMondayBoard(mondayConfig.acqBoardId, logger);
};

export const syncMondaySalesCallsBoard = async (
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<MondaySyncResult> => {
  return syncMondayBoard(mondayConfig.salesCallsBoardId, logger);
};

export const runMondayMaintenanceCycle = async (
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<void> => {
  if (mondayCycleInFlight) {
    logger?.info?.('Skipping monday cycle: previous cycle still running');
    return;
  }
  mondayCycleInFlight = true;

  try {
    for (const boardId of resolveSyncBoardIds()) {
      const syncResult = await syncMondayBoard(boardId, logger);
      if (syncResult.status === 'error') {
        logger?.warn?.('Monday sync cycle failed', { boardId, error: syncResult.error });
      }
    }

    if (mondayConfig.outboundEnabled && mondayConfig.writebackEnabled) {
      try {
        const weekly = await import('./weekly-manager-summary.js');
        await weekly.syncWeeklySummaryToMonday({}, logger);
      } catch (error) {
        logger?.warn?.('Monday weekly writeback failed', error);
      }
    }

    if (mondayConfig.outboundEnabled && mondayConfig.personalSyncEnabled) {
      try {
        const personal = await import('./monday-personal-writeback.js');
        const result = await personal.syncRecentSetterBookedCallsToMonday(logger);
        logger?.info?.('Monday personal booked-call sync complete', result);
      } catch (error) {
        logger?.warn?.('Monday personal booked-call sync failed', error);
      }
    }
  } finally {
    mondayCycleInFlight = false;
  }
};

export const startMondaySyncJobs = (logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>): (() => void) => {
  const weeklyWritebackEnabled = mondayConfig.outboundEnabled && mondayConfig.writebackEnabled;
  const personalWritebackEnabled = mondayConfig.outboundEnabled && mondayConfig.personalSyncEnabled;
  if (!mondayConfig.syncEnabled && !weeklyWritebackEnabled && !personalWritebackEnabled) {
    logger?.info?.('Monday jobs disabled');
    return () => {};
  }

  logger?.info?.('Starting monday maintenance jobs', {
    syncEnabled: mondayConfig.syncEnabled,
    writebackEnabled: weeklyWritebackEnabled,
    personalSyncEnabled: personalWritebackEnabled,
    outboundEnabled: mondayConfig.outboundEnabled,
    boardIds: resolveSyncBoardIds(),
    personalBoardId: mondayConfig.personalBoardId,
    intervalMs: mondayConfig.pollIntervalMs,
  });

  // Run once shortly after startup.
  const initialTimer = setTimeout(() => {
    void runMondayMaintenanceCycle(logger);
  }, 10_000);

  const interval = setInterval(() => {
    void runMondayMaintenanceCycle(logger);
  }, mondayConfig.pollIntervalMs);

  return () => {
    clearTimeout(initialTimer);
    clearInterval(interval);
  };
};
