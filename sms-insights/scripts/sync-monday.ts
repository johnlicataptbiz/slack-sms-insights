import 'dotenv/config';
import { closeDatabase, initDatabase, initializeSchema } from '../services/db.js';
import { syncRecentSetterBookedCallsToMonday } from '../services/monday-personal-writeback.js';
import { mondayConfig, syncMondayBoard } from '../services/monday-sync.js';
import { syncWeeklySummaryToMonday } from '../services/weekly-manager-summary.js';

type CliOptions = {
  boardId: string;
  writeback: boolean;
  personal: boolean;
  weekStart?: string;
  timeZone?: string;
};

const parseArgs = (argv: string[]): CliOptions => {
  const options: CliOptions = {
    boardId: mondayConfig.acqBoardId,
    writeback: false,
    personal: false,
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

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2));
  await initDatabase(console);
  await initializeSchema();

  console.log(`Starting monday sync for board ${options.boardId}...`);
  const result = await syncMondayBoard(options.boardId, console);
  console.log('Sync result:', JSON.stringify(result, null, 2));

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
