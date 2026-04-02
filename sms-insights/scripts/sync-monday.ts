import 'dotenv/config';
import { closeDatabase, initDatabase, initializeSchema } from '../services/db.js';
import { syncRecentSetterBookedCallsToMonday } from '../services/monday-personal-writeback.js';
import { listMondaySyncBoardIds, mondayConfig, syncMondayBoard } from '../services/monday-sync.js';
import { syncWeeklySummaryToMonday } from '../services/weekly-manager-summary.js';

type CliOptions = {
  boardId: string;
  allBoards: boolean;
  writeback: boolean;
  personal: boolean;
  force: boolean;
  weekStart?: string;
  timeZone?: string;
};

const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    boardId: mondayConfig.acqBoardId,
    allBoards: false,
    writeback: false,
    personal: false,
    force: false,
  };

  for (const arg of argv) {
    if (arg === '--writeback') {
      options.writeback = true;
      continue;
    }
    if (arg === '--personal') {
      options.personal = true;
      continue;
    }
    if (arg === '--force') {
      options.force = true;
      continue;
    }
    if (arg === '--all') {
      options.allBoards = true;
      continue;
    }
    if (arg.startsWith('--board=')) {
      options.boardId = arg.slice('--board='.length).trim() || options.boardId;
      continue;
    }
    if (arg.startsWith('--week-start=')) {
      options.weekStart = arg.slice('--week-start='.length).trim() || undefined;
      continue;
    }
    if (arg.startsWith('--tz=')) {
      options.timeZone = arg.slice('--tz='.length).trim() || undefined;
    }
  }

  return options;
};

const syncBoardFully = async (
  boardId: string,
  force: boolean,
): Promise<{
  status: 'success' | 'error';
  boardId: string;
  fetchedItems: number;
  upsertedItems: number;
  pages: number;
  nextCursor: string | null;
  error?: string;
}> => {
  let fetchedItems = 0;
  let upsertedItems = 0;
  let pages = 0;
  let nextCursor: string | null = null;

  while (true) {
    const result = await syncMondayBoard(boardId, console, { force });
    pages += 1;
    fetchedItems += result.fetchedItems;
    upsertedItems += result.upsertedItems;
    nextCursor = result.nextCursor;

    if (result.status !== 'success') {
      return {
        status: 'error',
        boardId,
        fetchedItems,
        upsertedItems,
        pages,
        nextCursor,
        error: result.error || 'sync failed',
      };
    }

    if (!nextCursor) {
      return {
        status: 'success',
        boardId,
        fetchedItems,
        upsertedItems,
        pages,
        nextCursor: null,
      };
    }

    console.log(
      `Board ${boardId}: continuing pagination (page ${pages}, fetched so far ${fetchedItems}, next cursor present)`,
    );
  }
};

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2));
  await initDatabase(console);
  await initializeSchema();

  if (options.allBoards) {
    const boardIds = listMondaySyncBoardIds();
    console.log(`Starting monday sync for ${boardIds.length} board(s): ${boardIds.join(', ')}`);
    for (const boardId of boardIds) {
      const result = await syncBoardFully(boardId, options.force);
      console.log(`Sync result (${boardId}):`, JSON.stringify(result, null, 2));
    }
  } else {
    console.log(`Starting monday sync for board ${options.boardId}...`);
    const result = await syncBoardFully(options.boardId, options.force);
    console.log('Sync result:', JSON.stringify(result, null, 2));
  }

  if (options.writeback) {
    console.log('Running weekly summary writeback...');
    const writeResult = await syncWeeklySummaryToMonday(
      {
        weekStart: options.weekStart,
        timeZone: options.timeZone,
      },
      console,
    );
    console.log('Writeback result:', JSON.stringify(writeResult, null, 2));
  }

  if (options.personal) {
    console.log('Running personal booked-call writeback...');
    const personalResult = await syncRecentSetterBookedCallsToMonday(console);
    console.log('Personal writeback result:', JSON.stringify(personalResult, null, 2));
  }
};

main()
  .catch((error) => {
    console.error('sync-monday failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
