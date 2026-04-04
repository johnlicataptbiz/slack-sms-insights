import pg from 'pg';
const { Pool } = pg;

const databaseUrl = (process.env.DATABASE_URL || '').trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

async function main() {
  const pool = new Pool({
    connectionString: databaseUrl,
  });

  const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'booked_calls'");
  console.log('booked_calls columns:', r.rows.map((x: any) => x.column_name));

  // Check sample data
  const sample = await pool.query("SELECT * FROM booked_calls LIMIT 1");
  if (sample.rows.length > 0) {
    console.log('\nSample row keys:', Object.keys(sample.rows[0]));
  }

  await pool.end();
}

main().catch(console.error);
