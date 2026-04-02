import pg from 'pg';
const { Pool } = pg;

const databaseUrl = (process.env.DATABASE_URL || '').trim();
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required');
}

const pool = new Pool({
  connectionString: databaseUrl,
});

async function main() {
  console.log('=== APPLYING ALL FIXES ===\n');

  // 1. Templates count
  const templates2 = await pool.query('SELECT COUNT(*) as c FROM message_templates');
  console.log('1. Templates:', templates2.rows[0].c);

  // 2. Infer employment from messages using correct column name
  console.log('\n2. Inferring employment status...');
  const empResult = await pool.query(`
    WITH inferred AS (
      SELECT DISTINCT c.id as conv_id,
        CASE
          WHEN e.body ILIKE '%full time%' OR e.body ILIKE '%full-time%' OR e.body ILIKE '%fulltime%' THEN 'full_time'
          WHEN e.body ILIKE '%part time%' OR e.body ILIKE '%part-time%' OR e.body ILIKE '%parttime%' OR e.body ILIKE '%side gig%' OR e.body ILIKE '%weekend%' THEN 'part_time'
        END as emp
      FROM conversations c
      JOIN sms_events e ON e.contact_phone = c.contact_phone
      WHERE e.direction = 'inbound'
    )
    UPDATE conversation_state cs
    SET qualification_full_or_part_time = i.emp
    FROM inferred i
    WHERE cs.conversation_id = i.conv_id
      AND cs.qualification_full_or_part_time IS NULL
      AND i.emp IS NOT NULL
  `);
  console.log('   Employment inferred:', empResult.rowCount);

  // 3. Infer coaching interest
  console.log('\n3. Inferring coaching interest...');
  const interestResult = await pool.query(`
    WITH inferred AS (
      SELECT DISTINCT c.id as conv_id,
        CASE
          WHEN e.body ILIKE '%definitely%' OR e.body ILIKE '%very interested%' OR e.body ILIKE '%sign me up%' OR e.body ILIKE '%lets do it%' OR e.body ILIKE '%im in%' THEN 'high'
          WHEN e.body ILIKE '%maybe%' OR e.body ILIKE '%possibly%' OR e.body ILIKE '%tell me more%' OR e.body ILIKE '%interested%' THEN 'medium'
          WHEN e.body ILIKE '%not sure%' OR e.body ILIKE '%not right now%' OR e.body ILIKE '%later%' THEN 'low'
        END as interest
      FROM conversations c
      JOIN sms_events e ON e.contact_phone = c.contact_phone
      WHERE e.direction = 'inbound'
    )
    UPDATE conversation_state cs
    SET qualification_coaching_interest = i.interest
    FROM inferred i
    WHERE cs.conversation_id = i.conv_id
      AND cs.qualification_coaching_interest IS NULL
      AND i.interest IS NOT NULL
  `);
  console.log('   Interest inferred:', interestResult.rowCount);

  // 4. Infer revenue mix
  console.log('\n4. Inferring revenue mix...');
  const revenueResult = await pool.query(`
    WITH inferred AS (
      SELECT DISTINCT c.id as conv_id,
        CASE
          WHEN e.body ILIKE '%cash%' OR e.body ILIKE '%out of pocket%' OR e.body ILIKE '%self pay%' OR e.body ILIKE '%cash pay%' THEN 'mostly_cash'
          WHEN e.body ILIKE '%insurance%' OR e.body ILIKE '%in-network%' OR e.body ILIKE '%medicare%' OR e.body ILIKE '%medicaid%' THEN 'mostly_insurance'
          WHEN e.body ILIKE '%both%' OR e.body ILIKE '%mix%' OR e.body ILIKE '%hybrid%' THEN 'balanced'
        END as rev
      FROM conversations c
      JOIN sms_events e ON e.contact_phone = c.contact_phone
      WHERE e.direction = 'inbound'
    )
    UPDATE conversation_state cs
    SET qualification_revenue_mix = i.rev
    FROM inferred i
    WHERE cs.conversation_id = i.conv_id
      AND cs.qualification_revenue_mix IS NULL
      AND i.rev IS NOT NULL
  `);
  console.log('   Revenue mix inferred:', revenueResult.rowCount);

  // 5. Add first_sms_touch_at column and enrich time-to-booking
  console.log('\n5. Enriching time-to-booking data...');
  try {
    await pool.query('ALTER TABLE booked_calls ADD COLUMN IF NOT EXISTS first_sms_touch_at TIMESTAMPTZ');
  } catch (e) {
    // Column might already exist
  }

  const bookingResult = await pool.query(`
    UPDATE booked_calls bc
    SET first_sms_touch_at = (
      SELECT MIN(e.inserted_at)
      FROM sms_events e
      WHERE e.contact_phone = bc.parsed_contact_phone
        AND e.direction = 'outbound'
    )
    WHERE bc.first_sms_touch_at IS NULL
      AND bc.parsed_contact_phone IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM sms_events e
        WHERE e.contact_phone = bc.parsed_contact_phone
        AND e.direction = 'outbound'
      )
  `);
  console.log('   Time-to-booking enriched:', bookingResult.rowCount);

  // Print final stats
  console.log('\n=== FINAL STATS ===');

  const qual = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE qualification_full_or_part_time IS NOT NULL) as emp_known,
      COUNT(*) FILTER (WHERE qualification_coaching_interest IS NOT NULL) as interest_known,
      COUNT(*) FILTER (WHERE qualification_revenue_mix IS NOT NULL) as revenue_known,
      COUNT(*) as total
    FROM conversation_state
  `);
  const q = qual.rows[0];
  console.log(`Employment known: ${q.emp_known}/${q.total} (${(Number(q.emp_known)/Number(q.total)*100).toFixed(1)}%)`);
  console.log(`Interest known: ${q.interest_known}/${q.total} (${(Number(q.interest_known)/Number(q.total)*100).toFixed(1)}%)`);
  console.log(`Revenue known: ${q.revenue_known}/${q.total} (${(Number(q.revenue_known)/Number(q.total)*100).toFixed(1)}%)`);

  const ttb = await pool.query('SELECT COUNT(*) as c FROM booked_calls WHERE first_sms_touch_at IS NOT NULL');
  console.log(`Time-to-booking data: ${ttb.rows[0].c} bookings`);

  await pool.end();
}

main().catch(console.error);
