import pg from 'pg';
const { Pool } = pg;

async function main() {
  const pool = new Pool({
    connectionString: 'postgresql://postgres:WglVXtUmBjZIhCtOTLcLbeWpxsganAsi@crossover.proxy.rlwy.net:56263/railway'
  });

  const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'conversation_state'");
  console.log('conversation_state columns:', r.rows.map((x: any) => x.column_name));

  await pool.end();
}

main().catch(console.error);
