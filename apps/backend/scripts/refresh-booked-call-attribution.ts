import 'dotenv/config';
import { closeDatabase, initDatabase, initializeSchema } from '../services/db.js';
import { refreshBookedCallAttribution } from '../services/booked-call-attribution-refresh.js';

const parseIntOr = (value: string | undefined, fallback: number): number => {
  const parsed = Number.parseInt((value || '').trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const main = async (): Promise<void> => {
  const lookbackDays = Math.max(1, parseIntOr(process.env.BOOKED_ATTRIBUTION_LOOKBACK_DAYS, 30));
  const now = new Date();
  const from = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

  await initDatabase(console);
  await initializeSchema();

  const result = await refreshBookedCallAttribution(
    {
      from,
      to: now,
      channelId: process.env.BOOKED_CALLS_CHANNEL_ID || undefined,
    },
    console,
  );

  console.log(
    JSON.stringify(
      {
        lookbackDays,
        from: from.toISOString(),
        to: now.toISOString(),
        ...result,
      },
      null,
      2,
    ),
  );
};

main()
  .catch((error) => {
    console.error('refresh-booked-call-attribution failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });

