import { Client } from 'pg';

const targets = [
  'Dylan McLean',
  'Adrian Ferreira',
  'Alexander Leto',
  'Anthony Meyer',
];

const main = async () => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL missing');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  for (const name of targets) {
    const rows = await client.query(
      `select conversation_id, contact_name, contact_phone, direction, event_ts, body, sequence, line
       from sms_events
       where contact_name ilike $1
       order by event_ts desc
       limit 80`,
      [`%${name}%`],
    );

    console.log(`\n=== ${name} ===`);
    if (rows.rowCount === 0) {
      console.log('No rows found');
      continue;
    }

    const convoId = rows.rows.find((r) => r.conversation_id)?.conversation_id ?? null;
    if (!convoId) {
      console.log('No conversation_id found (showing latest rows)');
      for (const r of rows.rows.slice(0, 10).reverse()) {
        console.log(`${r.event_ts.toISOString()} | ${r.direction} | ${r.body ?? ''}`);
      }
      continue;
    }

    const convoRows = await client.query(
      `select conversation_id, contact_name, contact_phone, direction, event_ts, body, sequence, line
       from sms_events
       where conversation_id = $1
       order by event_ts asc`,
      [convoId],
    );

    console.log(`Conversation ID: ${convoId}`);
    console.log(`Phone: ${convoRows.rows[0]?.contact_phone ?? 'unknown'}`);
    console.log(`Sequence: ${convoRows.rows[0]?.sequence ?? 'n/a'}`);
    const tail = convoRows.rows.slice(-30);
    for (const r of tail) {
      console.log(`${r.event_ts.toISOString()} | ${r.direction} | ${r.body ?? ''}`);
    }
  }

  await client.end();
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
