#!/usr/bin/env node

import pg from 'pg';

const client = new pg.Client(process.env.DATABASE_URL);

async function runAnalysis() {
  console.log('🚀 SMS Conversation Analysis - Real Data (PG Direct)\\n');

  try {
    // 1. Message Volume Analysis
    console.log('📊 1. MESSAGE VOLUME ANALYSIS');
    console.log('='.repeat(50));

    const q1 = \`SELECT
      DATE_TRUNC('day', event_ts) as date,
      direction,
      COUNT(*) as message_count,
      COUNT(DISTINCT contact_phone) as unique_contacts
    FROM sms_events
    WHERE event_ts >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY date, direction
    ORDER BY date DESC, direction
    LIMIT 20;\`;

    const r1 = await client.query(q1);
    console.log('Recent Daily Message Volumes:');
    console.table(r1.rows);

    // 2. Sequence Performance Analysis
    console.log('\\n📊 2. SEQUENCE PERFORMANCE ANALYSIS');
    console.log('='.repeat(50));

    const q2 = \`SELECT
      COALESCE(sr.label, 'No Sequence') as sequence_name,
      COUNT(se.id) as messages_sent,
      COUNT(DISTINCT se.contact_phone) as unique_contacts,
      ROUND(
        COUNT(DISTINCT CASE WHEN EXISTS (
          SELECT 1 FROM sms_events se2
          WHERE se2.contact_phone = se.contact_phone
          AND se2.direction = 'inbound'
          AND se2.event_ts > se.event_ts
          AND se2.event_ts <= se.event_ts + INTERVAL '7 days'
        ) THEN se.contact_phone END
      )::decimal / NULLIF(COUNT(DISTINCT se.contact_phone), 0) * 100, 1
      ) as reply_rate_pct,
      COUNT(DISTINCT bc.id) as bookings
    FROM sms_events se
    LEFT JOIN sequence_registry sr ON sr.id = se.sequence_id
    LEFT JOIN booked_calls bc ON bc.contact_phone = se.contact_phone
      AND bc.event_ts >= se.event_ts
      AND bc.event_ts <= se.event_ts + INTERVAL '14 days'
    WHERE se.direction = 'outbound'
      AND se.event_ts >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY sr.label
    ORDER BY messages_sent DESC
    LIMIT 10;\`;

    const r2 = await client.query(q2);
    console.log('Top Sequences by Message Volume:');
    console.table(r2.rows);

    // 3. Response Time Analysis
    console.log('\\n📊 3. RESPONSE TIME ANALYSIS');
    console.log('='.repeat(50));

    const q3 = \`SELECT
      EXTRACT(EPOCH FROM (inbound.event_ts - outbound.event_ts))/3600 as response_hours,
      COUNT(*) as frequency
    FROM sms_events inbound
    JOIN sms_events outbound ON inbound.contact_phone = outbound.contact_phone
      AND outbound.direction = 'outbound'
      AND inbound.direction = 'inbound'
    WHERE inbound.event_ts > outbound.event_ts
      AND inbound.event_ts <= outbound.event_ts + INTERVAL '24 hours'
      AND outbound.event_ts >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY response_hours
    ORDER BY response_hours
    LIMIT 20;\`;

    const r3 = await client.query(q3);
    console.log('Response Time Distribution (hours):');
    console.table(r3.rows);

    // 4. Engagement Analysis
    console.log('\\n📊 4. ENGAGEMENT ANALYSIS');
    console.log('='.repeat(50));

    const q4 = \`SELECT
      DATE_TRUNC('day', outbound.event_ts) as date,
      COUNT(DISTINCT outbound.contact_phone) as contacts_reached,
      COUNT(DISTINCT CASE WHEN inbound.contact_phone IS NOT NULL THEN inbound.contact_phone END) as contacts_replied,
      ROUND(
        COUNT(DISTINCT CASE WHEN inbound.contact_phone IS NOT NULL THEN inbound.contact_phone END)::decimal /
        NULLIF(COUNT(DISTINCT outbound.contact_phone), 0) * 100, 1
      ) as engagement_rate_pct
    FROM sms_events outbound
    LEFT JOIN sms_events inbound ON inbound.contact_phone = outbound.contact_phone
      AND inbound.direction = 'inbound'
      AND inbound.event_ts > outbound.event_ts
      AND inbound.event_ts <= outbound.event_ts + INTERVAL '7 days'
    WHERE outbound.direction = 'outbound'
      AND outbound.event_ts >= CURRENT_DATE - INTERVAL '30 days'
    GROUP BY date
    ORDER BY date DESC
    LIMIT 14;\`;

    const r4 = await client.query(q4);
    console.log('Daily Engagement Rates:');
    console.table(r4.rows);

    // 5. Conversation Pattern Analysis
    console.log('\\n📊 5. CONVERSATION PATTERN ANALYSIS');
    console.log('='.repeat(50));

    const q5 = \`WITH conversation_lengths AS (
      SELECT
        c.id,
        COUNT(se.id) as message_count
      FROM conversations c
      LEFT JOIN sms_events se ON se.conversation_id = c.id
      WHERE c.created_at >= CURRENT_DATE - INTERVAL '30 days'
      GROUP BY c.id
    )
    SELECT
      CASE
        WHEN message_count = 1 THEN 'Single Message'
        WHEN message_count BETWEEN 2 AND 3 THEN '2-3 Messages'
        WHEN message_count BETWEEN 4 AND 10 THEN '4-10 Messages'
        ELSE 'Long Conversation'
      END as conversation_type,
      COUNT(*) as count,
      ROUND(COUNT(*)::decimal / SUM(COUNT(*)) OVER() * 100, 1) as percentage
    FROM conversation_lengths
    GROUP BY conversation_type
    ORDER BY count DESC;\`;

    const r5 = await client.query(q5);
    console.log('Conversation Length Distribution:');
    console.table(r5.rows);

    // 6. Attribution Analysis
    console.log('\\n📊 6. ATTRIBUTION ANALYSIS');
    console.log('='.repeat(50));

    const q6 = \`SELECT
      COUNT(*) as total_bookings,
      COUNT(CASE WHEN resolved_sequence_label != sms_sequence_label THEN 1 END) as attribution_conflicts,
      ROUND(
        COUNT(CASE WHEN resolved_sequence_label != sms_sequence_label THEN 1 END)::decimal /
        NULLIF(COUNT(*), 0) * 100, 1
      ) as conflict_rate_pct
    FROM booked_call_attribution bca
    WHERE bca.created_at >= CURRENT_DATE - INTERVAL '30 days';\`;

    const r6 = await client.query(q6);
    console.log('Attribution Analysis:');
    console.table(r6.rows);

    console.log('\\n✅ Analysis Complete!');
  } catch (error) {
    console.error('❌ Analysis failed:', error);
  } finally {
    await client.end();
  }
}

runAnalysis();
