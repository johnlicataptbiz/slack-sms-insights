import { initDatabase, getPool } from '../services/db.js';

async function migrate() {
  await initDatabase();
  const db = getPool();
  if (!db) throw new Error('DB pool not initialized');

  console.log('Adding Phase 3 columns to conversation_state...');

  await db.query(`
    ALTER TABLE conversation_state
      ADD COLUMN IF NOT EXISTS objection_tags TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS guardrail_override_count INT NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS call_outcome TEXT
  `);
  console.log('✅ conversation_state columns added');

  // Verify
  const r = await db.query(`
    SELECT
      column_name,
      data_type,
      column_default
    FROM information_schema.columns
    WHERE table_name = 'conversation_state'
      AND column_name IN ('objection_tags', 'guardrail_override_count', 'call_outcome')
    ORDER BY column_name
  `);
  console.log('New columns:', r.rows);

  process.exit(0);
}

migrate().catch((e) => {
  console.error('Migration failed:', e.message);
  process.exit(1);
});
