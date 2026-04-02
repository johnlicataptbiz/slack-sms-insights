/**
 * Cleanup script to remove all booked_calls entries from the bad backfill on 2026-02-19.
 * Run with:
 *   DATABASE_URL=<connection_string> npx tsx scripts/clear-bad-backfill.ts
 *
 * When running locally, pass the public Railway URL via DATABASE_URL.
 * When running inside Railway, DATABASE_URL should point to the private endpoint.
 */
import pg from 'pg';

const { Pool } = pg;

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL environment variable is required');

async function clearBadBackfill() {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    console.log('Connecting to the database...');
    await pool.query('SELECT NOW()'); // Test connection
    console.log('Database connection successful.');

    // First check current count
    const before = await pool.query('SELECT COUNT(*) as cnt FROM booked_calls');
    console.log('Before cleanup, total rows:', before.rows[0]?.cnt ?? 'N/A');

    // Delete all records from the bad backfill date
    console.log("Deleting all records from the bad backfill on 2026-02-19...");
    const result = await pool.query(`
      DELETE FROM booked_calls
      WHERE DATE(created_at) = '2026-02-19'
    `);
    console.log(`Deleted ${result.rowCount} rows from the bad backfill.`);

    // Check after
    const after = await pool.query('SELECT COUNT(*) as cnt FROM booked_calls');
    console.log('After cleanup, total rows:', after.rows[0]?.cnt ?? 'N/A');

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

clearBadBackfill();
