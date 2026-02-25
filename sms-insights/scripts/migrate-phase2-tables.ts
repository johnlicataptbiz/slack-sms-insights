import { initDatabase, getPool } from '../services/db.js';

async function migrate() {
  await initDatabase();
  const db = getPool();
  if (!db) throw new Error('DB pool not initialized');

  console.log('Creating conversation_notes table...');
  await db.query(`
    CREATE TABLE IF NOT EXISTS conversation_notes (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      author TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_conv_notes_cid
    ON conversation_notes(conversation_id)
  `);
  console.log('✅ conversation_notes ready');

  console.log('Creating message_templates table...');
  await db.query(`
    CREATE TABLE IF NOT EXISTS message_templates (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name TEXT NOT NULL,
      body TEXT NOT NULL,
      created_by TEXT NOT NULL DEFAULT 'agent',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  console.log('✅ message_templates ready');

  const r = await db.query(`
    SELECT 'conversation_notes' AS t, COUNT(*)::int AS cnt FROM conversation_notes
    UNION ALL
    SELECT 'message_templates', COUNT(*)::int FROM message_templates
  `);
  console.log('Row counts:', r.rows);
  process.exit(0);
}

migrate().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
