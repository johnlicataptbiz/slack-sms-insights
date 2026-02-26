import pg from 'pg';
const { Pool } = pg;

async function main() {
  const pool = new Pool({
    connectionString: 'postgresql://postgres:WglVXtUmBjZIhCtOTLcLbeWpxsganAsi@crossover.proxy.rlwy.net:56263/railway'
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
