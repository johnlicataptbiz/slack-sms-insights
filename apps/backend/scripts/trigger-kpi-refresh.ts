#!/usr/bin/env tsx
/**
 * Trigger KPI facts refresh for a given date range.
 * Usage: tsx scripts/trigger-kpi-refresh.ts [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--tz America/Chicago]
 */
import { refreshKpiFacts } from '../services/kpi-facts-fixed.js';

const parseArgs = () => {
  const args = process.argv.slice(2);
  let from = new Date();
  from.setDate(from.getDate() - 35);
  from.setHours(0, 0, 0, 0);
  let to = new Date();
  to.setHours(23, 59, 59, 999);
  let tz = 'America/Chicago';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from' && args[i + 1]) {
      from = new Date(`${args[i + 1]}T00:00:00.000Z`);
      i++;
    } else if (args[i] === '--to' && args[i + 1]) {
      to = new Date(`${args[i + 1]}T23:59:59.999Z`);
      i++;
    } else if (args[i] === '--tz' && args[i + 1]) {
      tz = args[i + 1];
      i++;
    }
  }

  return { from, to, tz };
};

const main = async () => {
  const { from, to, tz } = parseArgs();
  console.log(`KPI Facts Refresh: ${from.toISOString().slice(0, 10)} → ${to.toISOString().slice(0, 10)} (tz: ${tz})`);

  const result = await refreshKpiFacts(
    { from, to, timeZone: tz },
    {
      info: (...args: unknown[]) => console.log('[INFO]', ...args),
      warn: (...args: unknown[]) => console.warn('[WARN]', ...args),
      error: (...args: unknown[]) => console.error('[ERROR]', ...args),
    },
  );

  console.log('Result:', JSON.stringify(result, null, 2));
};

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
