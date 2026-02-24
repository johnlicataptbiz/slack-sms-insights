/**
 * Cleanup script to remove irrelevant and duplicate booked_calls entries.
 * Run with:
 *   DATABASE_URL=<connection_string> npx tsx scripts/cleanup-booked-calls-dupes.ts
 *
 * When running locally, pass the public Railway URL via DATABASE_URL.
 * When running inside Railway, DATABASE_URL should point to the private endpoint.
 */
import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL environment variable is required');

async function cleanupBookedCalls() {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log('Connecting to the database...');
    await pool.query('SELECT NOW()'); // Test connection
    console.log('Database connection successful.');

    // First check current count
    const before = await pool.query('SELECT COUNT(*) as cnt FROM booked_calls');
    console.log('Before cleanup, total rows:', before.rows[0]?.cnt ?? 'N/A');

    // Step 1: Delete irrelevant entries
    console.log("Deleting irrelevant entries (not 'New booked call.')...");
    const deleteIrrelevantResult = await pool.query(`
      DELETE FROM booked_calls
      WHERE text != 'New booked call. '
    `);
    console.log(`Deleted ${deleteIrrelevantResult.rowCount} irrelevant rows.`);

    // Step 2: Delete duplicates based on slack_message_ts
    console.log('Deleting duplicate "New booked call." entries...');
    const deleteDuplicatesResult = await pool.query(`
      DELETE FROM booked_calls
      WHERE id IN (
        SELECT id FROM (
          SELECT
            id,
            ROW_NUMBER() OVER(
              PARTITION BY slack_message_ts
              ORDER BY created_at ASC
            ) as rn
          FROM booked_calls
          WHERE text = 'New booked call. '
        ) t
        WHERE t.rn > 1
      )
    `);
    console.log(`Deleted ${deleteDuplicatesResult.rowCount} duplicate rows.`);

    // Check after
    const after = await pool.query('SELECT COUNT(*) as cnt FROM booked_calls');
    console.log('After cleanup, total rows:', after.rows[0]?.cnt ?? 'N/A');

    // Show breakdown by date
    const byDate = await pool.query(`
      SELECT COUNT(*) as cnt, DATE(created_at) as dt
      FROM booked_calls
      GROUP BY DATE(created_at)
      ORDER BY dt DESC
      LIMIT 10
    `);
    console.log('\nCounts by date after cleanup:');
    byDate.rows.forEach(row => {
      const date = new Date(row.dt);
      const adjustedDate = new Date(date.getTime() + date.getTimezoneOffset() * 60000);
      console.log(`  ${adjustedDate.toISOString().split('T')[0]}: ${row.cnt}`);
    });

    console.log('\n✅ Cleanup complete!');
  } catch (e) {
    if (e instanceof Error) {
      console.error('Error during cleanup:', e.message);
    } else {
      console.error('An unknown error occurred:', e);
    }
    process.exit(1);
  } finally {
    await pool.end();
    console.log('Database pool closed.');
  }
}

cleanupBookedCalls();
