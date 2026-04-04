import 'dotenv/config';
import { closeDatabase, initDatabase, initializeSchema } from '../services/db.js';
import { listMondaySyncBoardIds, syncMondayBoard } from '../services/monday-sync.js';
import { purgeMondayNormalizedRowsForNonFunnelBoards } from '../services/monday-store.js';

type CliOptions = {
  skipSync: boolean;
};

const parseArgs = (argv: string[]): CliOptions => ({
  skipSync: argv.includes('--skip-sync'),
});

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2));
  await initDatabase(console);
  await initializeSchema();

  console.log('Purging non-funnel normalized monday rows...');
  const purgeResult = await purgeMondayNormalizedRowsForNonFunnelBoards(console);
  console.log('Purge result:', JSON.stringify(purgeResult, null, 2));

  if (options.skipSync) {
    console.log('Skipping sync (--skip-sync enabled).');
    return;
  }

  const boardIds = listMondaySyncBoardIds();
  console.log(`Resyncing ${boardIds.length} monday boards with --force...`);
  for (const boardId of boardIds) {
    const result = await syncMondayBoard(boardId, console, { force: true });
    console.log(`Sync result (${boardId}):`, JSON.stringify(result, null, 2));
  }
};

main()
  .catch((error) => {
    console.error('rebuild-monday-governed-analytics failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
