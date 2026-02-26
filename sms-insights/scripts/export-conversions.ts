import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:WglVXtUmBjZIhCtOTLcLbeWpxsganAsi@crossover.proxy.rlwy.net:56263/railway'
});

async function main() {
  // Get full conversation threads that led to bookings
  const { rows: bookedConvos } = await pool.query(`
    WITH booking_contacts AS (
      SELECT DISTINCT contact_phone
      FROM sms_events
      WHERE direction = 'outbound'
        AND (
          body ILIKE '%I will go ahead and get you setup%'
          OR body ILIKE '%calendar invite%'
          OR body ILIKE '%lock%in%'
          OR body ILIKE '%get you scheduled%'
        )
    )
    SELECT
      bc.contact_phone,
      json_agg(
        json_build_object(
          'direction', e.direction,
          'body', e.body,
          'sequence', e.sequence
        ) ORDER BY e.event_ts
      ) as messages
    FROM booking_contacts bc
    JOIN sms_events e ON e.contact_phone = bc.contact_phone
    WHERE e.body IS NOT NULL
    GROUP BY bc.contact_phone
    LIMIT 20
  `);

  console.log('=== FULL CONVERSATION THREADS THAT LED TO BOOKINGS ===\n');

  bookedConvos.forEach((convo, i) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`CONVERSATION ${i+1} (${convo.contact_phone})`);
    console.log('='.repeat(60));

    convo.messages.forEach((msg: any) => {
      const prefix = msg.direction === 'outbound' ? '>>> SETTER:' : '<<< PROSPECT:';
      const seq = msg.sequence ? ` [${msg.sequence}]` : '';
      console.log(`\n${prefix}${seq}`);
      console.log(msg.body);
    });
  });

  await pool.end();
}

main();
