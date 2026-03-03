import { getPool } from './db.js';
import { DEFAULT_BUSINESS_TIMEZONE } from './time-range.js';

// ═══════════════════════════════════════════════════════════════════════════════
// COMPREHENSIVE FIXES FOR ALL IDENTIFIED ISSUES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Issue #1, #2, #3: Auto-assign unassigned work items ────────────────────────
export const autoAssignWorkItems = async (): Promise<{ assigned: number; errors: string[] }> => {
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  const errors: string[] = [];

  // Get distribution of current workload by rep
  const { rows: workloadRows } = await pool.query<{ rep_id: string; count: string }>(`
    SELECT rep_id, COUNT(*)::text AS count
    FROM work_items
    WHERE resolved_at IS NULL AND rep_id IS NOT NULL
    GROUP BY rep_id
  `);

  const workload: Record<string, number> = {};
  for (const row of workloadRows) {
    workload[row.rep_id] = Number.parseInt(row.count, 10);
  }

  // Get unassigned work items with their conversation's last outbound line
  const { rows: unassignedRows } = await pool.query<{ id: string; conversation_id: string; line: string | null }>(`
    SELECT
      wi.id,
      wi.conversation_id,
      (
        SELECT line FROM sms_events
        WHERE contact_phone = c.contact_phone
        AND direction = 'outbound'
        ORDER BY event_ts DESC
        LIMIT 1
      ) AS line
    FROM work_items wi
    JOIN conversations c ON wi.conversation_id = c.id
    WHERE wi.rep_id IS NULL AND wi.resolved_at IS NULL
    LIMIT 500
  `);

  let assigned = 0;

  for (const row of unassignedRows) {
    let repId: string | null = null;

    // Determine rep based on line
    const line = row.line?.toLowerCase() || '';
    if (line.includes('jack') || line.includes('817-580-9950') || line.includes('8175809950')) {
      repId = 'jack';
    } else if (line.includes('brandon') || line.includes('678-820-3770') || line.includes('6788203770')) {
      repId = 'brandon';
    } else {
      // Round-robin assignment based on current workload
      const jackLoad = workload['jack'] || 0;
      const brandonLoad = workload['brandon'] || 0;
      repId = jackLoad <= brandonLoad ? 'jack' : 'brandon';
    }

    try {
      await pool.query('UPDATE work_items SET rep_id = $1, updated_at = NOW() WHERE id = $2', [repId, row.id]);
      workload[repId] = (workload[repId] || 0) + 1;
      assigned++;
    } catch (err) {
      errors.push(`Failed to assign ${row.id}: ${err}`);
    }
  }

  return { assigned, errors };
};

// ─── Issue #4: AI Draft improvements - track why drafts are rejected ────────────
export type DraftRejectionReason =
  | 'too_long'
  | 'wrong_tone'
  | 'factually_wrong'
  | 'not_relevant'
  | 'prefer_manual'
  | 'other';

export const trackDraftRejection = async (
  draftId: string,
  reason: DraftRejectionReason,
  feedback?: string,
): Promise<void> => {
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  await pool.query(
    `
    UPDATE draft_suggestions
    SET
      rejection_reason = $2,
      rejection_feedback = $3,
      rejected_at = NOW()
    WHERE id = $1
  `,
    [draftId, reason, feedback || null],
  );
};

export const getDraftRejectionStats = async (): Promise<{
  total: number;
  byReason: Record<string, number>;
  commonFeedback: string[];
}> => {
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  const { rows } = await pool.query<{ reason: string; count: string; sample_feedback: string[] }>(`
    SELECT
      COALESCE(rejection_reason, 'unknown') AS reason,
      COUNT(*)::text AS count,
      ARRAY_AGG(DISTINCT rejection_feedback) FILTER (WHERE rejection_feedback IS NOT NULL) AS sample_feedback
    FROM draft_suggestions
    WHERE accepted = false
    GROUP BY rejection_reason
  `);

  const byReason: Record<string, number> = {};
  const allFeedback: string[] = [];

  for (const row of rows) {
    byReason[row.reason] = Number.parseInt(row.count, 10);
    if (row.sample_feedback) {
      allFeedback.push(...row.sample_feedback.slice(0, 3));
    }
  }

  return {
    total: Object.values(byReason).reduce((a, b) => a + b, 0),
    byReason,
    commonFeedback: allFeedback.slice(0, 10),
  };
};

// ─── Issue #5: Track line activity balance and alert on imbalance ────────────────
export const getLineActivityBalance = async (): Promise<{
  lines: Array<{ line: string; messagesSent: number; share: number; isImbalanced: boolean }>;
  alert: string | null;
}> => {
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  const { rows } = await pool.query<{ line: string; count: string }>(`
    SELECT
      COALESCE(NULLIF(TRIM(line), ''), 'Unknown') AS line,
      COUNT(*)::text AS count
    FROM sms_events
    WHERE direction = 'outbound'
      AND event_ts >= NOW() - INTERVAL '7 days'
    GROUP BY 1
    ORDER BY COUNT(*) DESC
  `);

  const total = rows.reduce((sum, r) => sum + Number.parseInt(r.count, 10), 0);

  const lines = rows.map((row) => {
    const count = Number.parseInt(row.count, 10);
    const share = total > 0 ? (count / total) * 100 : 0;
    return {
      line: row.line,
      messagesSent: count,
      share,
      isImbalanced: share < 10 || share > 90, // Flag if <10% or >90% of volume
    };
  });

  // Generate alert if severe imbalance
  const imbalanced = lines.filter((l) => l.isImbalanced);
  let alert: string | null = null;

  if (imbalanced.length > 0) {
    const lowLines = imbalanced.filter((l) => l.share < 10).map((l) => l.line);
    if (lowLines.length > 0) {
      alert = `Line activity imbalance: ${lowLines.join(', ')} has <10% of volume in the last 7 days`;
    }
  }

  return { lines, alert };
};

// ─── Issue #6, #7: Auto-infer qualification from conversation text ────────────────
export const bulkInferQualification = async (limit = 100): Promise<{ processed: number; updated: number }> => {
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  // Get conversations with unknown qualification but recent activity
  const { rows } = await pool.query<{ conversation_id: string; contact_phone: string }>(
    `
    SELECT DISTINCT c.id AS conversation_id, c.contact_phone
    FROM conversations c
    LEFT JOIN conversation_state cs ON c.id = cs.conversation_id
    WHERE (
      cs.qualification_full_or_part_time = 'unknown' OR cs.qualification_full_or_part_time IS NULL
      OR cs.qualification_coaching_interest = 'unknown' OR cs.qualification_coaching_interest IS NULL
    )
    AND c.id IN (
      SELECT DISTINCT contact_phone_to_conversation_id(contact_phone)
      FROM sms_events
      WHERE event_ts >= NOW() - INTERVAL '30 days'
    )
    LIMIT $1
  `,
    [limit],
  );

  let updated = 0;

  for (const row of rows) {
    // Get conversation text
    const { rows: messages } = await pool.query<{ body: string; direction: string }>(
      `
      SELECT body, direction
      FROM sms_events
      WHERE contact_phone = $1
      ORDER BY event_ts
      LIMIT 50
    `,
      [row.contact_phone],
    );

    const inboundText = messages
      .filter((m) => m.direction === 'inbound' && m.body)
      .map((m) => m.body)
      .join(' ');

    if (!inboundText || inboundText.length < 20) continue;

    // Simple keyword-based inference (can be enhanced with AI)
    const inferredState: {
      employment?: 'full_time' | 'part_time' | 'unknown';
      interest?: 'high' | 'medium' | 'low' | 'unknown';
      revenueMix?: 'mostly_cash' | 'mostly_insurance' | 'balanced' | 'unknown';
      deliveryModel?: 'brick_and_mortar' | 'mobile' | 'online' | 'hybrid' | 'unknown';
    } = {};

    const lowerText = inboundText.toLowerCase();

    // ── Employment inference (LENIENT: err on over-classifying) ──────────────
    const fullTimeSignals = [
      'full time', 'full-time', 'fulltime',
      'my practice', 'own practice', 'own a practice', 'own my practice',
      'my clinic', 'own a clinic', 'own my clinic', 'clinic owner',
      'practice owner', 'i own', 'we own', 'opened my own', 'running my own',
      'went out on my own', 'on my own', 'solo practice', 'independent practice',
      'private practice', 'left my job', 'left the hospital', 'left the clinic',
      'quit my job', 'left employment', 'left my position', 'left outpatient',
      'left my pt job', 'left my chiro job', 'left my at job',
      'high volume', 'high-volume', 'insurance mill', 'insurance-based clinic',
      'working at a clinic', 'work at a clinic', 'employed at',
      'salary', 'w2', 'on payroll', 'getting paid by',
    ];
    const partTimeSignals = [
      'part time', 'part-time', 'parttime',
      'side gig', 'side hustle', 'side-gig', 'side-hustle',
      'moonlighting', 'on the side', 'building on the side',
      'still employed', 'still working', 'still at my job',
      'still at the hospital', 'still at the clinic', 'still have my job',
      'while i still work', 'while working', 'while still employed',
      'evenings and weekends', 'after hours', 'extra income',
      'supplementing', 'building while', 'planning to leave',
      'thinking about leaving', 'want to leave', 'want to quit',
    ];
    const fullTimeHits = fullTimeSignals.filter(s => lowerText.includes(s)).length;
    const partTimeHits = partTimeSignals.filter(s => lowerText.includes(s)).length;
    if (fullTimeHits > 0 || partTimeHits > 0) {
      inferredState.employment = fullTimeHits >= partTimeHits ? 'full_time' : 'part_time';
    }

    // ── Interest inference (LENIENT: err on over-classifying) ─────────────────
    const highInterestSignals = [
      'very interested', 'super interested', 'extremely interested',
      'definitely', 'absolutely', 'for sure', '100%',
      'love to', "let's do it", 'lets do it', 'count me in',
      'ready to go', 'ready to start', 'sign me up', 'book the call',
      'sounds great', 'sounds amazing', 'sounds perfect', 'yes please',
      'im in', "i'm in", 'hit me up', 'reach out to me',
      'when can we', 'how do i get started', 'how do i sign up',
      'i want to', 'i need this', 'this is exactly what i need',
      'this is perfect', 'this is amazing', 'this is great',
      'excited', 'pumped', 'stoked', 'fired up',
      'lets talk', "let's talk", 'set up a call', 'schedule a call',
    ];
    const mediumInterestSignals = [
      'interested', 'could be', 'might be', 'maybe', 'possibly',
      'tell me more', 'what does', 'how would', 'explain',
      'learn more', 'more info', 'more information', 'sounds interesting',
      'considering', 'thinking about', 'looking into', 'exploring',
      'curious', 'want to learn', 'want to know', 'want to hear',
      'still deciding', 'on the fence', 'not sure yet',
      "haven't decided", 'havent decided', 'open to it', 'open to',
      'what would', 'how much', 'what is the cost', 'what does it cost',
      'what are the details', 'tell me about', 'what is this',
    ];
    const lowInterestSignals = [
      'not interested', 'no thanks', 'not for me',
      'stop contacting', 'stop messaging', 'remove me', 'take me off',
      'unsubscribe', 'do not contact', 'leave me alone',
      'not the right time', 'not right now', 'not at this time',
      'not ready', 'not convinced', 'not a good fit', 'not a fit',
      "doesn't fit", "doesn't work", "doesn't apply",
      'too busy', 'no time for this', "don't have time",
    ];
    const highHits = highInterestSignals.filter(s => lowerText.includes(s)).length;
    const mediumHits = mediumInterestSignals.filter(s => lowerText.includes(s)).length;
    const lowHits = lowInterestSignals.filter(s => lowerText.includes(s)).length;
    if (highHits > 0 || mediumHits > 0 || lowHits > 0) {
      if (lowHits > highHits && lowHits > mediumHits) {
        inferredState.interest = 'low';
      } else if (highHits >= mediumHits) {
        inferredState.interest = 'high';
      } else {
        inferredState.interest = 'medium';
      }
    }

    // ── Revenue mix inference (LENIENT: err on over-classifying) ─────────────
    const cashSignals = [
      'cash', 'cash pay', 'cash patient', 'cash patients', 'cash based', 'cash-based',
      'out of pocket', 'self-pay', 'self pay', 'private pay',
      'membership', 'membership model', 'direct primary care', 'dpc',
      'retainer', 'fee for service', 'fee-for-service',
      'no insurance', 'without insurance', "don't bill insurance", 'dont bill insurance',
      'dropped insurance', 'dropped out of network', 'out of network', 'out-of-network',
      'concierge', 'direct access', 'direct care', 'direct pay',
      'cash flow', 'cash model', 'cash practice',
    ];
    const insuranceSignals = [
      'insurance', 'in-network', 'in network', 'billing', 'billed',
      'submit claim', 'claims', 'copay', 'deductible', 'coverage', 'covered',
      'blue cross', 'bcbs', 'aetna', 'cigna', 'united health', 'humana',
      'medicare', 'medicaid', 'tricare', 'eob', 'explanation of benefits',
      'prior auth', 'prior authorization', 'insurance based', 'insurance-based',
      'insurance dependent', 'insurance reliant', 'insurance heavy',
      'mostly insurance', 'mainly insurance', 'primarily insurance',
    ];
    const cashHits = cashSignals.filter(s => lowerText.includes(s)).length;
    const insuranceHits = insuranceSignals.filter(s => lowerText.includes(s)).length;
    if (cashHits > 0 || insuranceHits > 0) {
      // If both present, lean cash (cash-based is the target market)
      inferredState.revenueMix = cashHits >= insuranceHits ? 'mostly_cash' : 'mostly_insurance';
    }

    // ── Delivery model inference (LENIENT: new field) ─────────────────────────
    const brickMortarSignals = [
      'clinic', 'office', 'storefront', 'physical location', 'brick and mortar',
      'brick & mortar', 'building', 'facility', 'treatment room', 'treatment space',
      'in person', 'in-person', 'face to face', 'face-to-face', 'my space',
      'my suite', 'my studio', 'my office', 'my clinic', 'my location',
      'patients come to me', 'patients come in', 'come to my',
    ];
    const mobileSignals = [
      'mobile', 'mobile pt', 'mobile physio', 'mobile chiro',
      'drive to', 'driving to', 'travel to', 'i travel', 'i go to them',
      'patient homes', 'home based', 'home-based', 'home visits', 'house calls',
      'in-home', 'in home', 'at-home', 'at home', 'concierge mobile',
      'mobile clinic', 'mobile service', 'mobile practice',
    ];
    const onlineSignals = [
      'online', 'telehealth', 'tele health', 'virtual', 'video call',
      'zoom', 'facetime', 'phone only', 'remote', 'remote pt',
      'tele-pt', 'digital', 'app based', 'software platform',
      'no in person', 'not in person', 'never meet in person',
    ];
    const hybridSignals = [
      'hybrid', 'mix of', 'combination of', 'both in person',
      'some virtual', 'sometimes virtual', 'mix virtual and',
      'in person and online', 'online and in person',
      'in clinic and online', 'online and in clinic',
    ];
    const brickHits = brickMortarSignals.filter(s => lowerText.includes(s)).length;
    const mobileHits = mobileSignals.filter(s => lowerText.includes(s)).length;
    const onlineHits = onlineSignals.filter(s => lowerText.includes(s)).length;
    const hybridHits = hybridSignals.filter(s => lowerText.includes(s)).length;
    if (brickHits > 0 || mobileHits > 0 || onlineHits > 0 || hybridHits > 0) {
      const maxHits = Math.max(brickHits, mobileHits, onlineHits, hybridHits);
      if (hybridHits === maxHits && hybridHits > 0) {
        inferredState.deliveryModel = 'hybrid';
      } else if (onlineHits === maxHits && onlineHits > 0) {
        inferredState.deliveryModel = 'online';
      } else if (mobileHits === maxHits && mobileHits > 0) {
        inferredState.deliveryModel = 'mobile';
      } else {
        inferredState.deliveryModel = 'brick_and_mortar';
      }
    }

    // Update if we found anything
    if (Object.keys(inferredState).length > 0) {
      const updates: string[] = [];
      const values: unknown[] = [row.conversation_id];
      let paramIndex = 2;

      if (inferredState.employment) {
        updates.push(`qualification_full_or_part_time = $${paramIndex++}`);
        values.push(inferredState.employment);
      }
      if (inferredState.interest) {
        updates.push(`qualification_coaching_interest = $${paramIndex++}`);
        values.push(inferredState.interest);
      }
      if (inferredState.revenueMix) {
        updates.push(`qualification_revenue_mix = $${paramIndex++}`);
        values.push(inferredState.revenueMix);
      }
      if (inferredState.deliveryModel) {
        updates.push(`qualification_delivery_model = $${paramIndex++}`);
        values.push(inferredState.deliveryModel);
      }

      if (updates.length > 0) {
        await pool.query(
          `
          UPDATE conversation_state
          SET ${updates.join(', ')}, updated_at = NOW()
          WHERE conversation_id = $1
        `,
          values,
        );
        updated++;
      }
    }
  }

  return { processed: rows.length, updated };
};

// ─── Issue #8: Deduplicate line names ────────────────────────────────────────────
export const normalizeLineName = (line: string): string => {
  if (!line) return 'Unknown Line';

  const lower = line.toLowerCase().trim();

  // Jack's line variations
  if (lower.includes('817-580-9950') || lower.includes('8175809950') || lower.includes("jack's")) {
    return "Jack's Personal Line (+1 817-580-9950)";
  }

  // Brandon's line variations
  if (lower.includes('678-820-3770') || lower.includes('6788203770') || lower.includes("brandon's")) {
    return "Brandon's Personal Line (+1 678-820-3770)";
  }

  // Main line
  if (lower === 'main' || lower.includes('main line')) {
    return 'Main Line';
  }

  return line;
};

export const deduplicateLines = async (): Promise<{ updated: number }> => {
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  // Update Jack's line variations
  const { rowCount: jackUpdated } = await pool.query(`
    UPDATE sms_events
    SET line = 'Jack''s Personal Line (+1 817-580-9950)'
    WHERE line LIKE '%817-580-9950%' OR line LIKE '%8175809950%'
      AND line != 'Jack''s Personal Line (+1 817-580-9950)'
  `);

  // Update Brandon's line variations
  const { rowCount: brandonUpdated } = await pool.query(`
    UPDATE sms_events
    SET line = 'Brandon''s Personal Line (+1 678-820-3770)'
    WHERE line LIKE '%678-820-3770%' OR line LIKE '%6788203770%'
      AND line != 'Brandon''s Personal Line (+1 678-820-3770)'
  `);

  return { updated: (jackUpdated || 0) + (brandonUpdated || 0) };
};

// ─── Issue #23: Time-to-booking metric ────────────────────────────────────────────
export type TimeToBookingStats = {
  avgDays: number;
  medianDays: number;
  minDays: number;
  maxDays: number;
  bySequence: Array<{
    sequence: string;
    avgDays: number;
    bookings: number;
  }>;
};

export const getTimeToBookingStats = async (): Promise<TimeToBookingStats> => {
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  const { rows } = await pool.query<{
    avg_days: string;
    median_days: string;
    min_days: string;
    max_days: string;
  }>(`
    WITH booking_times AS (
      SELECT
        bc.event_time,
        (
          SELECT MIN(event_ts)
          FROM sms_events
          WHERE contact_phone = (
            SELECT contact_phone FROM conversations WHERE id = bc.conversation_id
          )
          AND direction = 'outbound'
        ) AS first_contact
      FROM booked_calls bc
      WHERE bc.conversation_id IS NOT NULL
    )
    SELECT
      COALESCE(AVG(EXTRACT(EPOCH FROM (event_time - first_contact)) / 86400), 0)::text AS avg_days,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (event_time - first_contact)) / 86400), 0)::text AS median_days,
      COALESCE(MIN(EXTRACT(EPOCH FROM (event_time - first_contact)) / 86400), 0)::text AS min_days,
      COALESCE(MAX(EXTRACT(EPOCH FROM (event_time - first_contact)) / 86400), 0)::text AS max_days
    FROM booking_times
    WHERE first_contact IS NOT NULL
  `);

  const stats = rows[0];

  // By sequence
  const { rows: sequenceRows } = await pool.query<{
    sequence: string;
    avg_days: string;
    bookings: string;
  }>(`
    WITH booking_times AS (
      SELECT
        bc.event_time,
        bc.conversation_id,
        (
          SELECT sequence FROM sms_events
          WHERE contact_phone = (
            SELECT contact_phone FROM conversations WHERE id = bc.conversation_id
          )
          AND direction = 'outbound' AND sequence IS NOT NULL
          ORDER BY event_ts LIMIT 1
        ) AS sequence,
        (
          SELECT MIN(event_ts) FROM sms_events
          WHERE contact_phone = (
            SELECT contact_phone FROM conversations WHERE id = bc.conversation_id
          )
          AND direction = 'outbound'
        ) AS first_contact
      FROM booked_calls bc
      WHERE bc.conversation_id IS NOT NULL
    )
    SELECT
      COALESCE(sequence, 'Manual') AS sequence,
      AVG(EXTRACT(EPOCH FROM (event_time - first_contact)) / 86400)::text AS avg_days,
      COUNT(*)::text AS bookings
    FROM booking_times
    WHERE first_contact IS NOT NULL
    GROUP BY sequence
    ORDER BY COUNT(*) DESC
    LIMIT 10
  `);

  return {
    avgDays: Number.parseFloat(stats.avg_days),
    medianDays: Number.parseFloat(stats.median_days),
    minDays: Number.parseFloat(stats.min_days),
    maxDays: Number.parseFloat(stats.max_days),
    bySequence: sequenceRows.map((r) => ({
      sequence: r.sequence,
      avgDays: Number.parseFloat(r.avg_days),
      bookings: Number.parseInt(r.bookings, 10),
    })),
  };
};

// ─── Issue #25: Response time tracking ────────────────────────────────────────────
export type ResponseTimeStats = {
  avgMinutes: number;
  medianMinutes: number;
  p95Minutes: number;
  byRep: Array<{
    rep: string;
    avgMinutes: number;
    responses: number;
  }>;
  byHour: Array<{
    hour: number;
    avgMinutes: number;
  }>;
};

export const getResponseTimeStats = async (params: { from: Date; to: Date }): Promise<ResponseTimeStats> => {
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  const { rows } = await pool.query<{
    avg_minutes: string;
    median_minutes: string;
    p95_minutes: string;
  }>(
    `
    WITH response_pairs AS (
      SELECT
        inbound.event_ts AS inbound_time,
        outbound.event_ts AS response_time,
        outbound.line,
        EXTRACT(EPOCH FROM (outbound.event_ts - inbound.event_ts)) / 60 AS response_minutes
      FROM sms_events inbound
      JOIN sms_events outbound ON inbound.contact_phone = outbound.contact_phone
        AND outbound.direction = 'outbound'
        AND outbound.event_ts > inbound.event_ts
        AND outbound.event_ts < inbound.event_ts + INTERVAL '24 hours'
      WHERE inbound.direction = 'inbound'
        AND inbound.event_ts >= $1::timestamptz
        AND inbound.event_ts <= $2::timestamptz
        AND NOT EXISTS (
          SELECT 1 FROM sms_events e2
          WHERE e2.contact_phone = inbound.contact_phone
            AND e2.direction = 'outbound'
            AND e2.event_ts > inbound.event_ts
            AND e2.event_ts < outbound.event_ts
        )
    )
    SELECT
      COALESCE(AVG(response_minutes), 0)::text AS avg_minutes,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY response_minutes), 0)::text AS median_minutes,
      COALESCE(PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY response_minutes), 0)::text AS p95_minutes
    FROM response_pairs
    WHERE response_minutes > 0 AND response_minutes < 1440
  `,
    [params.from.toISOString(), params.to.toISOString()],
  );

  const stats = rows[0];

  // By rep (based on line)
  const { rows: repRows } = await pool.query<{
    rep: string;
    avg_minutes: string;
    responses: string;
  }>(
    `
    WITH response_pairs AS (
      SELECT
        outbound.line,
        EXTRACT(EPOCH FROM (outbound.event_ts - inbound.event_ts)) / 60 AS response_minutes
      FROM sms_events inbound
      JOIN sms_events outbound ON inbound.contact_phone = outbound.contact_phone
        AND outbound.direction = 'outbound'
        AND outbound.event_ts > inbound.event_ts
        AND outbound.event_ts < inbound.event_ts + INTERVAL '24 hours'
      WHERE inbound.direction = 'inbound'
        AND inbound.event_ts >= $1::timestamptz
        AND inbound.event_ts <= $2::timestamptz
        AND NOT EXISTS (
          SELECT 1 FROM sms_events e2
          WHERE e2.contact_phone = inbound.contact_phone
            AND e2.direction = 'outbound'
            AND e2.event_ts > inbound.event_ts
            AND e2.event_ts < outbound.event_ts
        )
    )
    SELECT
      CASE
        WHEN line ILIKE '%jack%' OR line LIKE '%817-580-9950%' THEN 'Jack'
        WHEN line ILIKE '%brandon%' OR line LIKE '%678-820-3770%' THEN 'Brandon'
        ELSE 'Other'
      END AS rep,
      AVG(response_minutes)::text AS avg_minutes,
      COUNT(*)::text AS responses
    FROM response_pairs
    WHERE response_minutes > 0 AND response_minutes < 1440
    GROUP BY 1
    ORDER BY AVG(response_minutes)
  `,
    [params.from.toISOString(), params.to.toISOString()],
  );

  // By hour
  const { rows: hourRows } = await pool.query<{
    hour: string;
    avg_minutes: string;
  }>(
    `
    WITH response_pairs AS (
      SELECT
        EXTRACT(HOUR FROM inbound.event_ts AT TIME ZONE 'America/Chicago') AS hour,
        EXTRACT(EPOCH FROM (outbound.event_ts - inbound.event_ts)) / 60 AS response_minutes
      FROM sms_events inbound
      JOIN sms_events outbound ON inbound.contact_phone = outbound.contact_phone
        AND outbound.direction = 'outbound'
        AND outbound.event_ts > inbound.event_ts
        AND outbound.event_ts < inbound.event_ts + INTERVAL '24 hours'
      WHERE inbound.direction = 'inbound'
        AND inbound.event_ts >= $1::timestamptz
        AND inbound.event_ts <= $2::timestamptz
    )
    SELECT
      hour::text,
      AVG(response_minutes)::text AS avg_minutes
    FROM response_pairs
    WHERE response_minutes > 0 AND response_minutes < 1440
    GROUP BY hour
    ORDER BY hour
  `,
    [params.from.toISOString(), params.to.toISOString()],
  );

  return {
    avgMinutes: Number.parseFloat(stats.avg_minutes),
    medianMinutes: Number.parseFloat(stats.median_minutes),
    p95Minutes: Number.parseFloat(stats.p95_minutes),
    byRep: repRows.map((r) => ({
      rep: r.rep,
      avgMinutes: Number.parseFloat(r.avg_minutes),
      responses: Number.parseInt(r.responses, 10),
    })),
    byHour: hourRows.map((r) => ({
      hour: Number.parseInt(r.hour, 10),
      avgMinutes: Number.parseFloat(r.avg_minutes),
    })),
  };
};

// ─── Issue #27: Goal tracking ────────────────────────────────────────────────────
export type Goal = {
  id: string;
  name: string;
  target: number;
  current: number;
  unit: string;
  period: 'daily' | 'weekly' | 'monthly';
  progressPct: number;
  isOnTrack: boolean;
};

export const getGoals = async (): Promise<Goal[]> => {
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  // Define goals
  const goals: Array<{
    name: string;
    target: number;
    unit: string;
    period: 'daily' | 'weekly' | 'monthly';
    query: string;
  }> = [
    {
      name: 'Daily Bookings',
      target: 3,
      unit: 'bookings',
      period: 'daily',
      query: `SELECT COUNT(*)::text FROM booked_calls WHERE event_time >= CURRENT_DATE AT TIME ZONE 'America/Chicago'`,
    },
    {
      name: 'Weekly Reply Rate',
      target: 10,
      unit: '%',
      period: 'weekly',
      query: `
        SELECT COALESCE(
          (COUNT(DISTINCT CASE WHEN direction = 'inbound' THEN contact_phone END)::float /
           NULLIF(COUNT(DISTINCT CASE WHEN direction = 'outbound' THEN contact_phone END), 0) * 100),
          0
        )::text
        FROM sms_events WHERE event_ts >= CURRENT_DATE - INTERVAL '7 days'
      `,
    },
    {
      name: 'Weekly Opt-out Rate',
      target: 3,
      unit: '% (max)',
      period: 'weekly',
      query: `
        SELECT COALESCE(
          (COUNT(DISTINCT CASE WHEN direction = 'inbound' AND LOWER(body) ~ '(stop|unsubscribe|cancel)' THEN contact_phone END)::float /
           NULLIF(COUNT(DISTINCT CASE WHEN direction = 'outbound' THEN contact_phone END), 0) * 100),
          0
        )::text
        FROM sms_events WHERE event_ts >= CURRENT_DATE - INTERVAL '7 days'
      `,
    },
    {
      name: 'Monthly Bookings',
      target: 60,
      unit: 'bookings',
      period: 'monthly',
      query: `SELECT COUNT(*)::text FROM booked_calls WHERE event_time >= DATE_TRUNC('month', CURRENT_DATE)`,
    },
  ];

  const results: Goal[] = [];

  for (const goal of goals) {
    const { rows } = await pool.query<{ value: string }>(goal.query.replace('::text', '::text AS value'));
    const current = Number.parseFloat(rows[0]?.value || '0');

    // For "max" targets like opt-out rate, invert the logic
    const isMaxTarget = goal.unit.includes('max');
    const progressPct = isMaxTarget
      ? Math.max(0, 100 - (current / goal.target) * 100)
      : Math.min(100, (current / goal.target) * 100);

    const isOnTrack = isMaxTarget ? current <= goal.target : current >= goal.target * 0.8;

    results.push({
      id: goal.name.toLowerCase().replace(/\s+/g, '-'),
      name: goal.name,
      target: goal.target,
      current: Math.round(current * 100) / 100,
      unit: goal.unit,
      period: goal.period,
      progressPct: Math.round(progressPct),
      isOnTrack,
    });
  }

  return results;
};

// ─── Issue #28: Trend alerts (anomaly detection) ────────────────────────────────
export type TrendAlert = {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  metric: string;
  message: string;
  value: number;
  threshold: number;
  detectedAt: string;
};

export const getTrendAlerts = async (): Promise<TrendAlert[]> => {
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  const alerts: TrendAlert[] = [];
  const now = new Date().toISOString();

  // Check reply rate drop
  const { rows: replyRateRows } = await pool.query<{ today: string; last_week: string }>(`
    SELECT
      (SELECT COUNT(DISTINCT CASE WHEN direction = 'inbound' THEN contact_phone END)::float /
       NULLIF(COUNT(DISTINCT CASE WHEN direction = 'outbound' THEN contact_phone END), 0) * 100
       FROM sms_events WHERE event_ts >= CURRENT_DATE AT TIME ZONE 'America/Chicago')::text AS today,
      (SELECT COUNT(DISTINCT CASE WHEN direction = 'inbound' THEN contact_phone END)::float /
       NULLIF(COUNT(DISTINCT CASE WHEN direction = 'outbound' THEN contact_phone END), 0) * 100
       FROM sms_events WHERE event_ts >= CURRENT_DATE - INTERVAL '7 days'
       AND event_ts < CURRENT_DATE - INTERVAL '1 day')::text AS last_week
  `);

  const todayReplyRate = Number.parseFloat(replyRateRows[0]?.today || '0');
  const lastWeekReplyRate = Number.parseFloat(replyRateRows[0]?.last_week || '0');

  if (lastWeekReplyRate > 0 && todayReplyRate < lastWeekReplyRate * 0.7) {
    alerts.push({
      id: 'reply-rate-drop',
      severity: 'warning',
      metric: 'Reply Rate',
      message: `Reply rate dropped ${Math.round((1 - todayReplyRate / lastWeekReplyRate) * 100)}% compared to last week`,
      value: todayReplyRate,
      threshold: lastWeekReplyRate * 0.7,
      detectedAt: now,
    });
  }

  // Check opt-out spike
  const { rows: optOutRows } = await pool.query<{ today: string; avg: string }>(`
    SELECT
      (SELECT COUNT(*) FROM sms_events
       WHERE direction = 'inbound'
       AND LOWER(body) ~ '(stop|unsubscribe|cancel)'
       AND event_ts >= CURRENT_DATE AT TIME ZONE 'America/Chicago')::text AS today,
      (SELECT COUNT(*) / 7.0 FROM sms_events
       WHERE direction = 'inbound'
       AND LOWER(body) ~ '(stop|unsubscribe|cancel)'
       AND event_ts >= CURRENT_DATE - INTERVAL '7 days'
       AND event_ts < CURRENT_DATE)::text AS avg
  `);

  const todayOptOuts = Number.parseInt(optOutRows[0]?.today || '0', 10);
  const avgOptOuts = Number.parseFloat(optOutRows[0]?.avg || '0');

  if (avgOptOuts > 0 && todayOptOuts > avgOptOuts * 2) {
    alerts.push({
      id: 'opt-out-spike',
      severity: 'critical',
      metric: 'Opt-outs',
      message: `Opt-outs today (${todayOptOuts}) are ${Math.round(todayOptOuts / avgOptOuts)}x the daily average`,
      value: todayOptOuts,
      threshold: avgOptOuts * 2,
      detectedAt: now,
    });
  }

  // Check for quiet day (no activity)
  const { rows: activityRows } = await pool.query<{ count: string }>(`
    SELECT COUNT(*)::text AS count
    FROM sms_events
    WHERE event_ts >= CURRENT_DATE AT TIME ZONE 'America/Chicago'
  `);

  const todayActivity = Number.parseInt(activityRows[0]?.count || '0', 10);
  const currentHour = new Date().getHours();

  // If after 10am and less than 10 messages, flag it
  if (currentHour >= 10 && todayActivity < 10) {
    alerts.push({
      id: 'low-activity',
      severity: 'info',
      metric: 'Daily Activity',
      message: `Only ${todayActivity} messages sent today. Is everything running?`,
      value: todayActivity,
      threshold: 10,
      detectedAt: now,
    });
  }

  return alerts;
};

// ─── Issue #32: Audit logging ────────────────────────────────────────────────────
export type AuditLogEntry = {
  id: string;
  action: string;
  resourceType: string;
  resourceId: string;
  userId: string | null;
  details: Record<string, unknown>;
  ipAddress: string | null;
  timestamp: string;
};

export const logAuditEvent = async (params: {
  action: string;
  resourceType: string;
  resourceId: string;
  userId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
}): Promise<void> => {
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  await pool.query(
    `
    INSERT INTO audit_logs (action, resource_type, resource_id, user_id, details, ip_address)
    VALUES ($1, $2, $3, $4, $5, $6)
  `,
    [
      params.action,
      params.resourceType,
      params.resourceId,
      params.userId || null,
      JSON.stringify(params.details || {}),
      params.ipAddress || null,
    ],
  );
};

export const getAuditLogs = async (params: {
  from?: Date;
  to?: Date;
  action?: string;
  resourceType?: string;
  userId?: string;
  limit?: number;
}): Promise<AuditLogEntry[]> => {
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  const conditions: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (params.from) {
    conditions.push(`created_at >= $${paramIndex++}::timestamptz`);
    values.push(params.from.toISOString());
  }
  if (params.to) {
    conditions.push(`created_at <= $${paramIndex++}::timestamptz`);
    values.push(params.to.toISOString());
  }
  if (params.action) {
    conditions.push(`action = $${paramIndex++}`);
    values.push(params.action);
  }
  if (params.resourceType) {
    conditions.push(`resource_type = $${paramIndex++}`);
    values.push(params.resourceType);
  }
  if (params.userId) {
    conditions.push(`user_id = $${paramIndex++}`);
    values.push(params.userId);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = params.limit || 100;

  const { rows } = await pool.query<{
    id: string;
    action: string;
    resource_type: string;
    resource_id: string;
    user_id: string | null;
    details: string;
    ip_address: string | null;
    created_at: string;
  }>(
    `
    SELECT id, action, resource_type, resource_id, user_id, details, ip_address, created_at
    FROM audit_logs
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ${limit}
  `,
    values,
  );

  return rows.map((row) => ({
    id: row.id,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    userId: row.user_id,
    details: typeof row.details === 'string' ? JSON.parse(row.details) : row.details,
    ipAddress: row.ip_address,
    timestamp: row.created_at,
  }));
};
