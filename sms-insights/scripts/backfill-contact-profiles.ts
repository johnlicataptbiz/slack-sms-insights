import 'dotenv/config';
import { closeDatabase, getPool, initDatabase, initializeSchema } from '../services/db.js';

const main = async (): Promise<void> => {
  await initDatabase(console);
  await initializeSchema();

  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  const result = await pool.query<{ updated_rows: number }>(`
    WITH updated AS (
      UPDATE inbox_contact_profiles p
      SET
        lead_source = COALESCE(p.lead_source, NULLIF(BTRIM(COALESCE(p.raw->>'intake_source', p.raw->>'lead_source_id')), '')),
        sequence_id = COALESCE(p.sequence_id, NULLIF(BTRIM(p.raw->>'sequence_id'), '')),
        disposition_status_id = COALESCE(p.disposition_status_id, NULLIF(BTRIM(p.raw->>'disposition_status_id'), '')),
        tags = COALESCE(
          p.tags,
          CASE WHEN jsonb_typeof(p.raw->'tags') = 'array' THEN p.raw->'tags' ELSE NULL END
        ),
        text_authorized = COALESCE(
          p.text_authorized,
          CASE
            WHEN LOWER(COALESCE(p.raw->>'text_authorized', '')) IN ('true', '1', 'yes') THEN true
            WHEN LOWER(COALESCE(p.raw->>'text_authorized', '')) IN ('false', '0', 'no') THEN false
            ELSE NULL
          END
        ),
        is_blocked = COALESCE(
          p.is_blocked,
          CASE
            WHEN LOWER(COALESCE(p.raw->>'is_blocked', '')) IN ('true', '1', 'yes') THEN true
            WHEN LOWER(COALESCE(p.raw->>'is_blocked', '')) IN ('false', '0', 'no') THEN false
            ELSE NULL
          END
        ),
        cnam_city = COALESCE(p.cnam_city, NULLIF(BTRIM(p.raw->>'cnam_city'), '')),
        cnam_state = COALESCE(p.cnam_state, NULLIF(BTRIM(p.raw->>'cnam_state'), '')),
        cnam_country = COALESCE(p.cnam_country, NULLIF(BTRIM(p.raw->>'cnam_country'), '')),
        last_engagement_at = COALESCE(
          p.last_engagement_at,
          CASE
            WHEN COALESCE(p.raw->>'last_engagement_at', '') ~ '^\\d{4}-\\d{2}-\\d{2}'
              THEN (p.raw->>'last_engagement_at')::timestamptz
            ELSE NULL
          END
        ),
        inbound_sms_count = COALESCE(
          p.inbound_sms_count,
          CASE
            WHEN COALESCE(p.raw->>'inbound_sms_count', '') ~ '^-?\\d+$' THEN (p.raw->>'inbound_sms_count')::int
            ELSE NULL
          END
        ),
        outbound_sms_count = COALESCE(
          p.outbound_sms_count,
          CASE
            WHEN COALESCE(p.raw->>'outbound_sms_count', '') ~ '^-?\\d+$' THEN (p.raw->>'outbound_sms_count')::int
            ELSE NULL
          END
        ),
        inbound_call_count = COALESCE(
          p.inbound_call_count,
          CASE
            WHEN COALESCE(p.raw->>'inbound_call_count', '') ~ '^-?\\d+$' THEN (p.raw->>'inbound_call_count')::int
            ELSE NULL
          END
        ),
        outbound_call_count = COALESCE(
          p.outbound_call_count,
          CASE
            WHEN COALESCE(p.raw->>'outbound_call_count', '') ~ '^-?\\d+$' THEN (p.raw->>'outbound_call_count')::int
            ELSE NULL
          END
        ),
        unread_count = COALESCE(
          p.unread_count,
          CASE
            WHEN COALESCE(p.raw->>'unread_count', '') ~ '^-?\\d+$' THEN (p.raw->>'unread_count')::int
            ELSE NULL
          END
        ),
        updated_at = NOW()
      WHERE p.raw IS NOT NULL
      RETURNING 1
    )
    SELECT COUNT(*)::int AS updated_rows
    FROM updated;
  `);

  const coverage = await pool.query<{
    total: number;
    with_lead_source: number;
    with_sequence: number;
    with_disposition_status: number;
    with_tags: number;
    with_text_authorized: number;
    with_is_blocked: number;
    with_last_engagement: number;
  }>(`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE lead_source IS NOT NULL AND BTRIM(lead_source) <> '')::int AS with_lead_source,
      COUNT(*) FILTER (WHERE sequence_id IS NOT NULL AND BTRIM(sequence_id) <> '')::int AS with_sequence,
      COUNT(*) FILTER (WHERE disposition_status_id IS NOT NULL AND BTRIM(disposition_status_id) <> '')::int AS with_disposition_status,
      COUNT(*) FILTER (WHERE tags IS NOT NULL)::int AS with_tags,
      COUNT(*) FILTER (WHERE text_authorized IS NOT NULL)::int AS with_text_authorized,
      COUNT(*) FILTER (WHERE is_blocked IS NOT NULL)::int AS with_is_blocked,
      COUNT(*) FILTER (WHERE last_engagement_at IS NOT NULL)::int AS with_last_engagement
    FROM inbox_contact_profiles;
  `);

  console.log({
    updatedRows: result.rows[0]?.updated_rows ?? 0,
    coverage: coverage.rows[0],
  });
};

main()
  .catch((error) => {
    console.error('backfill-contact-profiles failed', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeDatabase();
  });

