import 'dotenv/config';
import type { Logger } from '@slack/bolt';
import { closeDatabase, initDatabase, initializeSchema } from '../services/db.js';
import { getDefaultLrnBackfillOptions, runLrnBackfill, type LrnBackfillOptions } from '../services/lrn-refresh.js';

const logger: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'> = {
  debug: (msg: string, ...args: unknown[]) => console.debug(`[DEBUG] ${msg}`, ...args),
  info: (msg: string, ...args: unknown[]) => console.info(`[INFO] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) => console.warn(`[WARN] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) => console.error(`[ERROR] ${msg}`, ...args),
};

const parseIntFlag = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const parseArgs = (argv: string[]): LrnBackfillOptions => {
  const options = getDefaultLrnBackfillOptions();

  for (const arg of argv) {
    if (arg === '--write') {
      options.dryRun = false;
      continue;
    }
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    if (arg === '--force-all') {
      options.forceAll = true;
      continue;
    }
    if (arg.startsWith('--limit=')) {
      options.limit = parseIntFlag(arg.slice('--limit='.length), options.limit);
      continue;
    }
    if (arg.startsWith('--offset=')) {
      options.offset = parseIntFlag(arg.slice('--offset='.length), options.offset);
      continue;
    }
    if (arg.startsWith('--delay-ms=')) {
      options.delayMs = parseIntFlag(arg.slice('--delay-ms='.length), options.delayMs);
      continue;
    }
    if (arg.startsWith('--stale-days=')) {
      options.staleDays = parseIntFlag(arg.slice('--stale-days='.length), options.staleDays);
    }
  }

  options.limit = Math.max(1, options.limit);
  options.offset = Math.max(0, options.offset);
  options.delayMs = Math.max(0, options.delayMs);
  options.staleDays = Math.max(0, options.staleDays);

  return options;
};

const main = async (): Promise<void> => {
  const options = parseArgs(process.argv.slice(2));
  await initDatabase(logger);
  await initializeSchema();

  let lastProgressCount = 0;
  const summary = await runLrnBackfill(options, logger, {
    onProgress: (currentSummary, current, total) => {
      if (current % 25 !== 0 && current !== total) return;
      if (lastProgressCount === current) return;
      lastProgressCount = current;
      console.log(
        JSON.stringify(
          {
            progress: `${current}/${total}`,
            lookedUp: currentSummary.lookedUp,
            updated: currentSummary.updated,
            withResult: currentSummary.withResult,
            errors: currentSummary.errors,
          },
          null,
          2,
        ),
      );
    },
  });

  console.log(JSON.stringify(summary, null, 2));
};

main()
  .catch((error) => {
    console.error('backfill-contact-profiles-lrn failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });
