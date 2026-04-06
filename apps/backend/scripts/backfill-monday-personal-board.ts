import 'dotenv/config';
import { refreshBookedCallAttribution } from '../services/booked-call-attribution-refresh.js';
import {
  closeDatabase,
  initDatabase,
  initializeSchema,
} from '../services/db.js';
import { syncRecentSetterBookedCallsToMonday } from '../services/monday-personal-writeback.js';

const parseIntOr = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt((value || '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const main = async (): Promise<void> => {
  const lookbackDays = Math.max(
    1,
    parseIntOr(process.env.BOOKED_ATTRIBUTION_LOOKBACK_DAYS, 90),
  );
  const now = new Date();
  const from = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  await initDatabase(console);
  await initializeSchema();

  console.log(`Refreshing booked-call attribution for ${lookbackDays} days...`);
  const attributionResult = await refreshBookedCallAttribution(
    {
      from,
      to: now,
      channelId: process.env.BOOKED_CALLS_CHANNEL_ID || undefined,
    },
    console,
  );

  console.log(
    'Attribution refresh result:',
    JSON.stringify(attributionResult, null, 2),
  );
  console.log('Running forced personal Monday re-sync...');

  const personalResult = await syncRecentSetterBookedCallsToMonday(
    {
      forceResync: true,
      lookbackDays,
    },
    console,
  );

  console.log(
    'Personal board backfill result:',
    JSON.stringify(personalResult, null, 2),
  );
  console.log(
    JSON.stringify(
      {
        lookbackDays,
        from: from.toISOString(),
        to: now.toISOString(),
        attribution: attributionResult,
        mondayPersonal: personalResult,
      },
      null,
      2,
    ),
  );
};

main()
  .catch((error) => {
    console.error('backfill-monday-personal-board failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
