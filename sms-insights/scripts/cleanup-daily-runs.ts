/**
 * Cleanup script for `daily_runs`.
 *
 * Goals:
 * - Identify and remove obvious duplicates (same channel_id + report_type + status + summary_text + full_report + duration_ms)
 *   within a short time window.
 * - Optionally remove "test" runs.
 *
 * Usage:
 *   # Dry run (prints what would be deleted)
 *   cd sms-insights
 *   DATABASE_URL=... npx tsx scripts/cleanup-daily-runs.ts --dry-run
 *
 *   # Apply deletions
 *   DATABASE_URL=... npx tsx scripts/cleanup-daily-runs.ts --apply
 *
 * Options:
 *   --days-back <n>        Only consider runs newer than N days (default 90)
 *   --window-minutes <n>   Dedupe window in minutes (default 10)
 *   --include-test         Also delete report_type='test' runs (default false)
 *   --channel <id>         Only clean a single channel_id
 */
import { Pool } from 'pg';

type Args = {
  dryRun: boolean;
  apply: boolean;
  daysBack: number;
  windowMinutes: number;
  includeTest: boolean;
  channel?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    dryRun: false,
    apply: false,
    daysBack: 90,
    windowMinutes: 10,
    includeTest: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--apply') args.apply = true;
    else if (a === '--include-test') args.includeTest = true;
    else if (a === '--days-back') args.daysBack = Number(argv[++i]);
    else if (a === '--window-minutes') args.windowMinutes = Number(argv[++i]);
    else if (a === '--channel') args.channel = argv[++i];
  }

  if (!args.dryRun && !args.apply) args.dryRun = true;
  if (args.dryRun && args.apply) throw new Error('Choose only one: --dry-run or --apply');
  if (!Number.isFinite(args.daysBack) || args.daysBack <= 0) throw new Error('--days-back must be a positive number');
  if (!Number.isFinite(args.windowMinutes) || args.windowMinutes <= 0)
    throw new Error('--window-minutes must be a positive number');

  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const pool = new Pool({ connectionString: databaseUrl });

  // Dedupe strategy:
  // - Partition by a "content signature" (channel_id, report_type, status, summary_text, full_report, duration_ms)
  // - Order by timestamp asc
  // - If two adjacent rows are within windowMinutes, treat later ones as duplicates and delete them.
  //
  // This is conservative: it won't delete runs that differ in content, and it won't delete runs far apart in time.
  const whereParts: string[] = [`timestamp > NOW() - INTERVAL '${args.daysBack} days'`];
  if (!args.includeTest) whereParts.push(`report_type <> 'test'`);
  if (args.channel) whereParts.push(`channel_id = $1`);
  const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';

  const query = `
    WITH ordered AS (
      SELECT
        id,
        timestamp,
        channel_id,
        report_type,
        status,
        summary_text,
        full_report,
        duration_ms,
        LAG(timestamp) OVER (
          PARTITION BY channel_id, report_type, status, summary_text, full_report, duration_ms
          ORDER BY timestamp ASC
        ) AS prev_ts
      FROM daily_runs
      ${whereSql}
    ),
    dups AS (
      SELECT
        id,
        timestamp,
        channel_id,
        report_type,
        status
      FROM ordered
      WHERE prev_ts IS NOT NULL
        AND timestamp - prev_ts <= INTERVAL '${args.windowMinutes} minutes'
    )
    SELECT * FROM dups
    ORDER BY timestamp DESC
    LIMIT 5000;
  `;

  const client = await pool.connect();
  try {
    const res = await client.query(query, args.channel ? [args.channel] : []);
    const rows = res.rows as Array<{
      id: string;
      timestamp: string;
      channel_id: string;
      report_type: string;
      status: string;
    }>;

    console.log(
      JSON.stringify(
        {
          mode: args.apply ? 'apply' : 'dry-run',
          daysBack: args.daysBack,
          windowMinutes: args.windowMinutes,
          includeTest: args.includeTest,
          channel: args.channel ?? null,
          duplicateCandidates: rows.length,
        },
        null,
        2,
      ),
    );

    if (rows.length === 0) return;

    // Print a small sample
    console.log('Sample duplicates (up to 25):');
    for (const r of rows.slice(0, 25)) {
      console.log(`${r.timestamp}  ${r.channel_id}  ${r.report_type}  ${r.status}  ${r.id}`);
    }

    if (args.apply) {
      const ids = rows.map((r) => r.id);
      const del = await client.query(`DELETE FROM daily_runs WHERE id = ANY($1::uuid[])`, [ids]);
      console.log(`Deleted rows: ${del.rowCount ?? 0}`);
    } else {
      console.log('Dry run only; no deletions performed.');
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
