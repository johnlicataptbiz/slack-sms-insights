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

  const r = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'conversation_state'");
  console.log('conversation_state columns:', r.rows.map((x: any) => x.column_name));

  await pool.end();
}

main().catch(console.error);
