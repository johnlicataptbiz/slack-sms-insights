import 'dotenv/config';
import { closeDatabase, initDatabase } from '../services/db.js';
import { getPool } from '../services/db.js';
import { isDailySnapshotReport } from '../services/daily-report-summary.js';

type Args = {
  dryRun: boolean;
  limit?: number;
  offset?: number;
  daysBack?: number;
};

const DATE_PATTERN = /^Date:\s*(.+)$/im;

const parseArgs = (): Args => {
  const argv = process.argv.slice(2);
  const get = (name: string): string | undefined => {
    const idx = argv.indexOf(name);
    if (idx === -1) return undefined;
    return argv[idx + 1];
  };

  const dryRun = argv.includes('--dry-run');
  const limit = get('--limit') ? Number.parseInt(get('--limit') as string, 10) : undefined;
  const offset = get('--offset') ? Number.parseInt(get('--offset') as string, 10) : undefined;
  const daysBack = get('--days-back') ? Number.parseInt(get('--days-back') as string, 10) : undefined;

  return {
    dryRun,
    limit: Number.isFinite(limit as number) ? limit : undefined,
    offset: Number.isFinite(offset as number) ? offset : undefined,
    daysBack: Number.isFinite(daysBack as number) ? daysBack : undefined,
  };
};

const normalizeSummary = (fullReport: string, maxLen = 220): string => {
  const oneLine = fullReport.replace(/\s+/g, ' ').trim();
  if (oneLine.length <= maxLen) return oneLine;
  return `${oneLine.slice(0, maxLen - 3)}...`;
};

const extractReportDate = (fullReport: string): string | null => {
  const m = fullReport.match(DATE_PATTERN);
  if (!m?.[1]) return null;

  // Store as ISO date at UTC midnight if parseable; otherwise store raw string.
  // The DB column is text, and the frontend formats it as a date if it looks like a date.
  const raw = m[1].trim();
  const parsed = new Date(raw);
  if (Number.isFinite(parsed.getTime())) {
    // Normalize to UTC date string (YYYY-MM-DD) to keep sorting stable.
    const yyyy = parsed.getUTCFullYear();
    const mm = String(parsed.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return raw;
};

async function main() {
  const args = parseArgs();
  if (!args.dryRun) {
    console.log('⚠️  Running in APPLY mode (will update rows). Use --dry-run to preview.');
  }

  await initDatabase(console);
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not initialized');
  }

  const params: Array<string | number> = [];
  let query = `SELECT id, timestamp, report_type, status, report_date, summary_text, full_report
               FROM daily_runs
               WHERE 1=1`;

  if (args.daysBack) {
    query += ` AND timestamp > NOW() - INTERVAL '${args.daysBack} days'`;
  }

  query += ` ORDER BY timestamp DESC`;

  if (args.limit) {
    params.push(args.limit);
    query += ` LIMIT $${params.length}`;
  }
  if (args.offset) {
    params.push(args.offset);
    query += ` OFFSET $${params.length}`;
  }

  const { rows } = await pool.query<{
    id: string;
    timestamp: string;
    report_type: string;
    status: string;
    report_date: string | null;
    summary_text: string | null;
    full_report: string | null;
  }>(query, params);

  let scanned = 0;
  let wouldUpdate = 0;
  let updated = 0;

  for (const row of rows) {
    scanned++;

    const full = row.full_report;
    if (!full) continue;

    // Only normalize daily snapshot reports (keeps other run types untouched).
    if (!isDailySnapshotReport(full)) continue;

    const nextReportDate = extractReportDate(full);
    const nextSummary = normalizeSummary(full);

    const needsReportDate = nextReportDate && nextReportDate !== row.report_date;
    const needsSummary = nextSummary !== (row.summary_text ?? '');

    if (!needsReportDate && !needsSummary) continue;

    wouldUpdate++;

    if (args.dryRun) {
      console.log(
        [
          `# ${row.id}`,
          `  timestamp:   ${row.timestamp}`,
          `  report_type: ${row.report_type}`,
          `  status:      ${row.status}`,
          needsReportDate ? `  report_date: ${row.report_date ?? '(null)'} -> ${nextReportDate}` : `  report_date: (no change)`,
          needsSummary ? `  summary_text: ${JSON.stringify((row.summary_text ?? '').slice(0, 80))} -> ${JSON.stringify(nextSummary.slice(0, 80))}` : `  summary_text: (no change)`,
        ].join('\n'),
      );
      continue;
    }

    const updateFields: string[] = [];
    const updateParams: Array<string | null> = [];
    if (needsReportDate) {
      updateParams.push(nextReportDate);
      updateFields.push(`report_date = $${updateParams.length}`);
    }
    if (needsSummary) {
      updateParams.push(nextSummary);
      updateFields.push(`summary_text = $${updateParams.length}`);
    }

    updateParams.push(row.id);
    await pool.query(`UPDATE daily_runs SET ${updateFields.join(', ')} WHERE id = $${updateParams.length}`, updateParams);

    updated++;
  }

  console.log(
    [
      '✅ Daily runs backfill complete',
      `- scanned: ${scanned}`,
      `- would update: ${wouldUpdate}`,
      `- updated: ${updated}`,
      args.dryRun ? '- mode: dry-run' : '- mode: apply',
    ].join('\n'),
  );

  await closeDatabase();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await closeDatabase();
  } catch {
    // ignore
  }
  process.exit(1);
});
