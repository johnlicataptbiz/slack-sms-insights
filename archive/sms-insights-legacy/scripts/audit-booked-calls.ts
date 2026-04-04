/**
 * Audit script: full booked_calls inspection for a given date.
 * Run with: DATABASE_URL=... npx tsx scripts/audit-booked-calls.ts [YYYY-MM-DD]
 */
import pg from 'pg';

const { Pool } = pg;

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const targetDate = process.argv[2] || '2026-02-23';
  console.log(`\n=== BOOKED CALLS AUDIT FOR ${targetDate} ===\n`);

  // 1. Raw booked_calls rows for the target date (UTC)
  const raw = await pool.query(`
    SELECT
      bc.id,
      bc.event_ts,
      bc.text,
      bc.slack_message_ts,
      bc.slack_channel_id,
      json_agg(
        json_build_object(
          'reaction', r.reaction_name,
          'count', r.reaction_count,
          'users', r.users
        )
      ) FILTER (WHERE r.reaction_name IS NOT NULL) AS reactions
    FROM booked_calls bc
    LEFT JOIN booked_call_reactions r ON r.booked_call_id = bc.id
    WHERE bc.event_ts >= $1::date::timestamptz
      AND bc.event_ts < ($1::date + INTERVAL '1 day')::timestamptz
    GROUP BY bc.id, bc.event_ts, bc.text, bc.slack_message_ts, bc.slack_channel_id
    ORDER BY bc.event_ts ASC
  `, [targetDate]);

  console.log(`Total booked_calls rows for ${targetDate} UTC: ${raw.rowCount}`);
  for (const r of raw.rows) {
    console.log('---');
    console.log('  id:', r.id);
    console.log('  event_ts:', r.event_ts);
    console.log('  text:', r.text);
    console.log('  reactions:', JSON.stringify(r.reactions));
  }

  // 2. Check with America/Chicago timezone (business timezone) — day boundary is UTC-6
  const chicagoFrom = `${targetDate}T06:00:00Z`; // midnight Chicago = 06:00 UTC
  const chicagoTo = new Date(new Date(chicagoFrom).getTime() + 24 * 60 * 60 * 1000).toISOString();

  const tzCheck = await pool.query(`
    SELECT
      bc.id,
      bc.event_ts,
      bc.event_ts AT TIME ZONE 'America/Chicago' AS event_ts_chicago,
      bc.text,
      json_agg(
        json_build_object(
          'reaction', r.reaction_name,
          'count', r.reaction_count,
          'users', r.users
        )
      ) FILTER (WHERE r.reaction_name IS NOT NULL) AS reactions
    FROM booked_calls bc
    LEFT JOIN booked_call_reactions r ON r.booked_call_id = bc.id
    WHERE bc.event_ts >= $1::timestamptz
      AND bc.event_ts < $2::timestamptz
    GROUP BY bc.id, bc.event_ts, bc.text, bc.slack_message_ts, bc.slack_channel_id
    ORDER BY bc.event_ts ASC
  `, [chicagoFrom, chicagoTo]);

  console.log(`\n=== BOOKED CALLS FOR ${targetDate} IN CHICAGO TIME (UTC-6) ===`);
  console.log('Count:', tzCheck.rowCount);
  for (const r of tzCheck.rows) {
    console.log('---');
    console.log('  event_ts_chicago:', r.event_ts_chicago);
    console.log('  text:', r.text?.substring(0, 80));
    console.log('  reactions:', JSON.stringify(r.reactions));
  }

  // 3. Distinct channels
  console.log('\n=== DISTINCT CHANNELS IN booked_calls (all time) ===');
  const channels = await pool.query(`
    SELECT slack_channel_id, COUNT(*) as cnt
    FROM booked_calls
    GROUP BY slack_channel_id
    ORDER BY cnt DESC
  `);
  for (const r of channels.rows) {
    console.log(' ', r.slack_channel_id, ':', r.cnt, 'total calls');
  }

  // 4. Recent 7 days summary by day (Chicago time)
  console.log('\n=== LAST 7 DAYS SUMMARY (Chicago time) ===');
  const summary = await pool.query(`
    SELECT
      (bc.event_ts AT TIME ZONE 'America/Chicago')::date AS day_chicago,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE r.reaction_name = 'jack') AS jack_reactions,
      COUNT(*) FILTER (WHERE r.reaction_name = 'me') AS brandon_reactions,
      COUNT(DISTINCT bc.id) FILTER (WHERE r.reaction_name IS NULL) AS no_reactions
    FROM booked_calls bc
    LEFT JOIN booked_call_reactions r ON r.booked_call_id = bc.id
    WHERE bc.event_ts >= NOW() - INTERVAL '7 days'
    GROUP BY day_chicago
    ORDER BY day_chicago DESC
  `);
  for (const r of summary.rows) {
    console.log(`  ${r.day_chicago}: total=${r.total} jack_reactions=${r.jack_reactions} brandon_reactions=${r.brandon_reactions} no_reactions=${r.no_reactions}`);
  }

  // 5. Check for any booked_calls with no reactions at all (potential self-bookings)
  console.log('\n=== CALLS WITH NO REACTIONS (last 7 days) ===');
  const noReactions = await pool.query(`
    SELECT bc.id, bc.event_ts, bc.text
    FROM booked_calls bc
    LEFT JOIN booked_call_reactions r ON r.booked_call_id = bc.id
    WHERE bc.event_ts >= NOW() - INTERVAL '7 days'
      AND r.id IS NULL
    ORDER BY bc.event_ts DESC
  `);
  console.log('Count:', noReactions.rowCount);
  for (const r of noReactions.rows) {
    console.log('  event_ts:', r.event_ts, '| text:', r.text?.substring(0, 60));
  }

  await pool.end();
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exit(1);
});
