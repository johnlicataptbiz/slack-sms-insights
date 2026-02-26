import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:WglVXtUmBjZIhCtOTLcLbeWpxsganAsi@crossover.proxy.rlwy.net:56263/railway'
});

async function main() {
  console.log('Running database migrations...\n');

  // 1. Add rejection tracking to draft_suggestions
  try {
    await pool.query(`
      ALTER TABLE draft_suggestions
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
      ADD COLUMN IF NOT EXISTS rejection_feedback TEXT,
      ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ
    `);
    console.log('✅ Added rejection tracking to draft_suggestions');
  } catch (e) {
    console.log('⚠️ Rejection tracking columns may already exist');
  }

  // 2. Create audit_logs table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        action VARCHAR(100) NOT NULL,
        resource_type VARCHAR(100) NOT NULL,
        resource_id VARCHAR(255) NOT NULL,
        user_id VARCHAR(255),
        details JSONB DEFAULT '{}',
        ip_address INET,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Created audit_logs table');

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action)`);
    console.log('✅ Created audit_logs indexes');
  } catch (e: any) {
    console.log('⚠️ audit_logs table may already exist:', e.message);
  }

  // 3. Create goals table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS goals (
        id VARCHAR(100) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        target DECIMAL NOT NULL,
        unit VARCHAR(50) NOT NULL,
        period VARCHAR(20) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Created goals table');

    // Insert default goals
    await pool.query(`
      INSERT INTO goals (id, name, target, unit, period) VALUES
        ('daily-bookings', 'Daily Bookings', 3, 'bookings', 'daily'),
        ('weekly-reply-rate', 'Weekly Reply Rate', 10, '%', 'weekly'),
        ('weekly-opt-out-rate', 'Weekly Opt-out Rate', 3, '% (max)', 'weekly'),
        ('monthly-bookings', 'Monthly Bookings', 60, 'bookings', 'monthly')
      ON CONFLICT (id) DO NOTHING
    `);
    console.log('✅ Inserted default goals');
  } catch (e: any) {
    console.log('⚠️ goals table issue:', e.message);
  }

  // 4. Create trend_alerts table
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS trend_alerts (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        alert_type VARCHAR(100) NOT NULL,
        severity VARCHAR(20) NOT NULL,
        metric VARCHAR(100) NOT NULL,
        message TEXT NOT NULL,
        value DECIMAL,
        threshold DECIMAL,
        acknowledged_at TIMESTAMPTZ,
        acknowledged_by VARCHAR(255),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    console.log('✅ Created trend_alerts table');

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_trend_alerts_created_at ON trend_alerts(created_at DESC)`);
    console.log('✅ Created trend_alerts indexes');
  } catch (e: any) {
    console.log('⚠️ trend_alerts table issue:', e.message);
  }

  // 5. Normalize line names - Jack
  try {
    const jackResult = await pool.query(`
      UPDATE sms_events
      SET line = $1
      WHERE (line LIKE '%817-580-9950%' OR line LIKE '%8175809950%')
        AND line != $1
    `, ["Jack's Personal Line (+1 817-580-9950)"]);
    console.log(`✅ Normalized ${jackResult.rowCount || 0} Jack line entries`);
  } catch (e: any) {
    console.log('⚠️ Jack line normalization issue:', e.message);
  }

  // 6. Normalize line names - Brandon
  try {
    const brandonResult = await pool.query(`
      UPDATE sms_events
      SET line = $1
      WHERE (line LIKE '%678-820-3770%' OR line LIKE '%6788203770%')
        AND line != $1
    `, ["Brandon's Personal Line (+1 678-820-3770)"]);
    console.log(`✅ Normalized ${brandonResult.rowCount || 0} Brandon line entries`);
  } catch (e: any) {
    console.log('⚠️ Brandon line normalization issue:', e.message);
  }

  // 7. Auto-assign unassigned work items
  try {
    const assignResult = await pool.query(`
      WITH work_item_lines AS (
        SELECT
          wi.id AS work_item_id,
          (
            SELECT line FROM sms_events
            WHERE contact_phone = c.contact_phone
            AND direction = 'outbound'
            ORDER BY event_ts DESC
            LIMIT 1
          ) AS last_line
        FROM work_items wi
        JOIN conversations c ON wi.conversation_id = c.id
        WHERE wi.rep_id IS NULL AND wi.resolved_at IS NULL
      )
      UPDATE work_items wi
      SET rep_id = CASE
        WHEN wil.last_line ILIKE '%jack%' OR wil.last_line LIKE '%817-580-9950%' THEN 'jack'
        WHEN wil.last_line ILIKE '%brandon%' OR wil.last_line LIKE '%678-820-3770%' THEN 'brandon'
        ELSE 'jack'
      END,
      updated_at = NOW()
      FROM work_item_lines wil
      WHERE wi.id = wil.work_item_id
    `);
    console.log(`✅ Auto-assigned ${assignResult.rowCount || 0} work items`);
  } catch (e: any) {
    console.log('⚠️ Work item assignment issue:', e.message);
  }

  await pool.end();
  console.log('\n✅ All migrations completed!');
}

main().catch(console.error);
