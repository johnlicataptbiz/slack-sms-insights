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
  upsertMondayCallSnapshot,
  upsertMondaySyncState,
} from './monday-store.js';

const parseBool = (value: string | undefined): boolean => value?.trim().toLowerCase() === 'true';

export const mondayConfig = {
  syncEnabled: parseBool(process.env.MONDAY_SYNC_ENABLED),
  writebackEnabled: parseBool(process.env.MONDAY_WRITEBACK_ENABLED),
  personalSyncEnabled: parseBool(process.env.MONDAY_PERSONAL_SYNC_ENABLED),
  acqBoardId: (process.env.MONDAY_ACQ_BOARD_ID || '5077164868').trim(),
  myCallsBoardId: (process.env.MONDAY_MY_CALLS_BOARD_ID || '10029059942').trim(),
  personalBoardId: (
    process.env.MONDAY_PERSONAL_BOARD_ID ||
    process.env.MONDAY_MY_CALLS_BOARD_ID ||
    '10029059942'
  ).trim(),
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

export const syncMondayBoard = async (
  boardId: string,
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
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
  const initialSync = !state?.last_sync_at;
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

    let cursor = state?.cursor || null;
    let fetchedItems = 0;
    let upsertedItems = 0;
    let pageCount = 0;

    while (pageCount < mondayConfig.maxPagesPerRun) {
      const page = await queryBoardItems(boardId, cursor, logger);
      fetchedItems += page.items.length;
      pageCount += 1;

      for (const item of page.items) {
        const normalized = normalizeBoardItem(item, mapping);
        if (!normalized) continue;

        // Initial run uses a bounded historical window to avoid pulling the entire board.
        if (initialSync && normalized.updatedAt < backfillCutoff) continue;
        if (!initialSync && lastSyncAt && normalized.updatedAt <= lastSyncAt) continue;

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

export const runMondayMaintenanceCycle = async (
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<void> => {
  if (mondayCycleInFlight) {
    logger?.info?.('Skipping monday cycle: previous cycle still running');
    return;
  }
  mondayCycleInFlight = true;

  try {
    const syncResult = await syncMondayAcquisitionsBoard(logger);
    if (syncResult.status === 'error') {
      logger?.warn?.('Monday sync cycle failed', syncResult.error);
    }

    if (mondayConfig.writebackEnabled) {
      try {
        const weekly = await import('./weekly-manager-summary.js');
        await weekly.syncWeeklySummaryToMonday({}, logger);
      } catch (error) {
        logger?.warn?.('Monday weekly writeback failed', error);
      }
    }

    if (mondayConfig.personalSyncEnabled) {
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
  if (!mondayConfig.syncEnabled && !mondayConfig.writebackEnabled && !mondayConfig.personalSyncEnabled) {
    logger?.info?.('Monday jobs disabled');
    return () => {};
  }

  logger?.info?.('Starting monday maintenance jobs', {
    syncEnabled: mondayConfig.syncEnabled,
    writebackEnabled: mondayConfig.writebackEnabled,
    personalSyncEnabled: mondayConfig.personalSyncEnabled,
    boardId: mondayConfig.acqBoardId,
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
