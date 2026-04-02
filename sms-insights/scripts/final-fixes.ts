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
  console.log('=== RUNNING FINAL FIXES ===\n');

  // 1. Add more templates
  const templates = [
    { name: 'Quick Call CTA', body: 'Hey {name}! What time works for a quick 15-min call today or tomorrow?' },
    { name: 'Follow Up - No Response', body: 'Hey {name}, just circling back - did you get a chance to look at that? Happy to hop on a quick call if easier!' },
    { name: 'Value Add', body: 'Hey {name}! Quick thought - been seeing a lot of practices like yours [specific result]. Would love to share how. Free for a call?' },
    { name: 'Re-engage Cold', body: 'Hey {name}! Been a minute - wanted to check in. Still focused on growing the cash side of your practice?' },
    { name: 'Soft Close', body: 'Hey {name}, sounds like this could be a fit. Want to grab 15 min to see if we can help?' },
    { name: 'Objection - Busy', body: 'Totally get it {name}! What if we did just 10 min this week? I can work around your schedule.' },
    { name: 'Objection - Not Interested', body: "No worries at all! Mind if I ask what you are focused on instead? Always curious what is working for practices like yours." }
  ];

  for (const t of templates) {
    try {
      await pool.query(
        'INSERT INTO message_templates (id, name, body, category, created_by, created_at) VALUES ($1, $2, $3, $4, $5, NOW()) ON CONFLICT (id) DO NOTHING',
        ['tpl-' + t.name.toLowerCase().replace(/\s+/g, '-'), t.name, t.body, 'outbound', 'system']
      );
    } catch (e) {
      // Ignore duplicates
    }
  }

  const { rows: tplCount } = await pool.query('SELECT COUNT(*) as cnt FROM message_templates');
  console.log('1. Templates:', tplCount[0].cnt);

  // 2. Bulk infer qualification data by joining conversation_state to conversations to sms_events
  const empUpdate = await pool.query(`
    UPDATE conversation_state cs
    SET qualification_full_or_part_time = 'full_time'
    WHERE qualification_full_or_part_time = 'unknown'
    AND EXISTS (
      SELECT 1 FROM conversations c
      JOIN sms_events e ON e.contact_phone = c.contact_phone
      WHERE c.id = cs.conversation_id
      AND e.direction = 'inbound'
      AND (e.body ILIKE '%full time%' OR e.body ILIKE '%fulltime%' OR e.body ILIKE '%full-time%')
    )
  `);
  console.log('2a. Employment (full_time) updates:', empUpdate.rowCount);

  const empUpdate2 = await pool.query(`
    UPDATE conversation_state cs
    SET qualification_full_or_part_time = 'part_time'
    WHERE qualification_full_or_part_time = 'unknown'
    AND EXISTS (
      SELECT 1 FROM conversations c
      JOIN sms_events e ON e.contact_phone = c.contact_phone
      WHERE c.id = cs.conversation_id
      AND e.direction = 'inbound'
      AND (e.body ILIKE '%part time%' OR e.body ILIKE '%parttime%' OR e.body ILIKE '%part-time%')
    )
  `);
  console.log('2b. Employment (part_time) updates:', empUpdate2.rowCount);

  const revUpdate = await pool.query(`
    UPDATE conversation_state cs
    SET qualification_revenue_mix = 'mostly_cash'
    WHERE qualification_revenue_mix = 'unknown'
    AND EXISTS (
      SELECT 1 FROM conversations c
      JOIN sms_events e ON e.contact_phone = c.contact_phone
      WHERE c.id = cs.conversation_id
      AND e.direction = 'inbound'
      AND (e.body ILIKE '%cash%' OR e.body ILIKE '%out of pocket%' OR e.body ILIKE '%private pay%')
    )
  `);
  console.log('2c. Revenue (cash) updates:', revUpdate.rowCount);

  const revUpdate2 = await pool.query(`
    UPDATE conversation_state cs
    SET qualification_revenue_mix = 'mostly_insurance'
    WHERE qualification_revenue_mix = 'unknown'
    AND EXISTS (
      SELECT 1 FROM conversations c
      JOIN sms_events e ON e.contact_phone = c.contact_phone
      WHERE c.id = cs.conversation_id
      AND e.direction = 'inbound'
      AND (e.body ILIKE '%insurance%' OR e.body ILIKE '%in network%' OR e.body ILIKE '%in-network%')
    )
  `);
  console.log('2d. Revenue (insurance) updates:', revUpdate2.rowCount);

  const intUpdate = await pool.query(`
    UPDATE conversation_state cs
    SET qualification_coaching_interest = 'high'
    WHERE qualification_coaching_interest = 'unknown'
    AND EXISTS (
      SELECT 1 FROM conversations c
      JOIN sms_events e ON e.contact_phone = c.contact_phone
      WHERE c.id = cs.conversation_id
      AND e.direction = 'inbound'
      AND (
        e.body ILIKE '%yes%' OR
        e.body ILIKE '%interested%' OR
        e.body ILIKE '%love to%' OR
        e.body ILIKE '%lets do it%' OR
        e.body ILIKE '%sounds great%' OR
        e.body ILIKE '%sign me up%'
      )
    )
  `);
  console.log('2e. Interest (high) updates:', intUpdate.rowCount);

  const intUpdate2 = await pool.query(`
    UPDATE conversation_state cs
    SET qualification_coaching_interest = 'medium'
    WHERE qualification_coaching_interest = 'unknown'
    AND EXISTS (
      SELECT 1 FROM conversations c
      JOIN sms_events e ON e.contact_phone = c.contact_phone
      WHERE c.id = cs.conversation_id
      AND e.direction = 'inbound'
      AND (
        e.body ILIKE '%maybe%' OR
        e.body ILIKE '%tell me more%' OR
        e.body ILIKE '%what is%' OR
        e.body ILIKE '%how does%' OR
        e.body ILIKE '%more info%'
      )
    )
  `);
  console.log('2f. Interest (medium) updates:', intUpdate2.rowCount);

  // 3. Check current stats
  const { rows: stats } = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE qualification_full_or_part_time != 'unknown') as emp_known,
      COUNT(*) FILTER (WHERE qualification_revenue_mix != 'unknown') as rev_known,
      COUNT(*) FILTER (WHERE qualification_coaching_interest != 'unknown') as int_known
    FROM conversation_state
  `);

  console.log('\n3. Current qualification coverage:');
  console.log('   Total:', stats[0].total);
  console.log('   Employment known:', stats[0].emp_known, '(' + Math.round(100 * stats[0].emp_known / stats[0].total) + '%)');
  console.log('   Revenue known:', stats[0].rev_known, '(' + Math.round(100 * stats[0].rev_known / stats[0].total) + '%)');
  console.log('   Interest known:', stats[0].int_known, '(' + Math.round(100 * stats[0].int_known / stats[0].total) + '%)');

  await pool.end();
}

main().catch(console.error);
