import pg from 'pg';

const { Pool } = pg;

const databaseUrl = (process.env.DATABASE_URL || '').trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const shouldDelete = process.env.CONFIRM_DEDUPE === 'true';
const previewLimit = Number(process.env.DEDUPE_PREVIEW_LIMIT || 50);

const pool = new Pool({
  connectionString: databaseUrl,
});

async function main(): Promise<void> {
  try {
    const duplicatesResult = await pool.query<{
      board_id: string;
      total_rows: string;
      duplicate_rows: string;
    }>(`
      SELECT
        board_id,
        COUNT(*)::text AS total_rows,
        (COUNT(*) - 1)::text AS duplicate_rows
      FROM monday_board_registry
      GROUP BY board_id
      HAVING COUNT(*) > 1
      ORDER BY COUNT(*) DESC, board_id ASC
      LIMIT $1;
    `, [previewLimit]);

    const countResult = await pool.query<{ duplicate_count: string }>(`
      WITH duplicates AS (
        SELECT board_id, COUNT(*) - 1 AS dupes
        FROM monday_board_registry
        GROUP BY board_id
        HAVING COUNT(*) > 1
      )
      SELECT COALESCE(SUM(dupes), 0) AS duplicate_count FROM duplicates;
    `);
    const duplicateCount = Number(countResult.rows[0]?.duplicate_count || 0);

    if (duplicatesResult.rows.length > 0) {
      console.log(`🔎 Duplicate board preview (max ${previewLimit} rows):`);
      for (const row of duplicatesResult.rows) {
        const totalRows = Number(row.total_rows);
        const duplicateRows = Number(row.duplicate_rows);
        console.log(
          `- board_id=${row.board_id} total=${totalRows} duplicates=${duplicateRows}`,
        );
      }
    } else {
      console.log('✅ No duplicate board_id groups found.');
    }

    if (!shouldDelete) {
      console.log(`✅ Dry run: found ${duplicateCount} duplicate monday_board_registry rows.`);
      console.log('Set CONFIRM_DEDUPE=true to perform the deletion.');
      return;
    }

    const deletedResult = await pool.query<{ deleted_count: string }>(`
      WITH duplicates AS (
        SELECT ctid
        FROM (
          SELECT ctid,
            ROW_NUMBER() OVER (PARTITION BY board_id ORDER BY updated_at DESC NULLS LAST, ctid DESC) AS rn
          FROM monday_board_registry
        ) t
        WHERE rn > 1
      ), deleted AS (
        DELETE FROM monday_board_registry
        WHERE ctid IN (SELECT ctid FROM duplicates)
        RETURNING 1
      )
      SELECT COUNT(*)::text AS deleted_count FROM deleted;
    `);

    const deletedCount = Number(deletedResult.rows[0]?.deleted_count || 0);
    console.log(`✅ Removed ${deletedCount} duplicate Monday board entries.`);

    const postCheckResult = await pool.query<{
      duplicate_count: string;
      distinct_boards: string;
      total_rows: string;
    }>(`
      WITH duplicates AS (
        SELECT COUNT(*) - 1 AS dupes
        FROM monday_board_registry
        GROUP BY board_id
        HAVING COUNT(*) > 1
      )
      SELECT
        COALESCE((SELECT SUM(dupes) FROM duplicates), 0)::text AS duplicate_count,
        COUNT(DISTINCT board_id)::text AS distinct_boards,
        COUNT(*)::text AS total_rows
      FROM monday_board_registry;
    `);

    const post = postCheckResult.rows[0];
    console.log(
      `📊 Post-check: duplicates=${post?.duplicate_count || '0'} boards=${post?.distinct_boards || '0'} rows=${post?.total_rows || '0'}`,
    );
  } catch (error) {
    console.error('❌ Failed to deduplicate monday_board_registry:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error('❌ Unexpected failure during deduplication:', error);
  process.exit(1);
});
