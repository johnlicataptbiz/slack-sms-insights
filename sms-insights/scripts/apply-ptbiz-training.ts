/**
 * Apply PT Biz training data:
 * 1. Update qualification inference with real PT Biz language patterns
 * 2. Add real message templates from the Language Playbook
 * 3. Add conversion examples from successful conversations
 */

import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString:
    'postgresql://postgres:WglVXtUmBjZIhCtOTLcLbeWpxsganAsi@crossover.proxy.rlwy.net:56263/railway',
});

// ─── EMPLOYMENT PATTERNS (from PT Biz Core Client Definition + Language Playbook) ───
const FULL_TIME_PATTERNS = [
  'full time', 'full-time', 'fulltime',
  'still working', 'day job', 'still employed',
  'hospital', 'outpatient', 'inpatient',
  'clinic director', 'staff pt', 'staff therapist',
  'corporate pt', 'insurance clinic',
  'w2', 'salary',
  '20 patients a day', '30 patients', 'production model',
  'seeing patients all day',
];

const PART_TIME_PATTERNS = [
  'part time', 'part-time', 'parttime',
  'side gig', 'side hustle', 'side business',
  'building on the side', 'prn', 'per diem',
  'evenings', 'weekends', 'after hours',
  'just started', 'just launched',
  '1-2 patients', 'few patients',
];

const SELF_EMPLOYED_PATTERNS = [
  'own my own', 'my own practice', 'own practice',
  'own clinic', 'clinic owner', 'practice owner',
  'running my', 'opened my', 'started my clinic',
  'self employed', 'self-employed',
  'cash based', 'cash-based', 'cash practice',
  'hybrid', 'concierge',
  'year 1', 'year 2', 'year 3',
];

// ─── REVENUE MIX PATTERNS ───────────────────────────────────────────────────
const CASH_PATTERNS = [
  'cash based', 'cash-based', 'cash pay', 'out of pocket',
  'cash only', 'private pay', 'out of network', 'out-of-network',
  'oon', 'no insurance', 'dropped insurance',
  'concierge', '1:1', 'one on one', 'one-on-one',
  'performance based', 'performance-based',
  'direct access',
];

const INSURANCE_PATTERNS = [
  'insurance', 'in-network', 'in network',
  'medicare', 'medicaid', 'blue cross', 'aetna', 'united',
  'takes insurance', 'billing', 'prior auth',
  'reimbursement', 'eob', 'copay',
  'traditional pt', 'traditional model',
];

const HYBRID_PATTERNS = [
  'hybrid', 'mix of', 'some insurance',
  'cash and insurance', 'insurance and cash',
  'trying to shift', 'moving toward cash',
  'transitioning', 'weaning off insurance',
];

// ─── COACHING INTEREST PATTERNS ──────────────────────────────────────────────
const HIGH_INTEREST_PATTERNS = [
  // Urgency signals
  'ready to go', 'ready now', 'as soon as possible', 'asap',
  'this month', 'right now', 'immediately',
  // Specific triggers (from sales framework section 1)
  'turning away patients', 'maxed out', 'maxed my schedule',
  'just quit my job', 'quit my job',
  'cant take any more patients',
  'need help now', 'need this now',
  // Strong pain signals
  'burning out', 'burned out', 'so frustrated',
  'cant keep doing this', 'need to make a change',
  'not making enough', 'leaving money',
  // Decision signals
  'how do i sign up', 'how do i get started',
  'what are the next steps', 'i want to join',
  'tell me more about working with you',
  // Positive responses to outreach
  'yes i would love', 'yes absolutely', 'definitely interested',
  'very interested', 'sounds great', 'perfect',
  'excited to learn', 'excited to connect',
];

const MEDIUM_INTEREST_PATTERNS = [
  'interested', 'would love to learn', 'tell me more',
  'sounds interesting', 'worth exploring',
  'open to it', 'open to that',
  'could be good', 'might work',
  'want to learn more', 'looking into it',
  'exploring options', 'doing research',
  // Conditional
  'if the price is right', 'depending on cost',
  'i have questions', 'curious about',
  // Soft scheduling agreement
  'that works', 'that would work', 'let me check',
  'should be able to', 'probably',
];

const LOW_INTEREST_PATTERNS = [
  'not sure', 'just browsing', 'just looking',
  'just exploring', 'not ready yet',
  'maybe someday', 'not the right time',
  'too busy right now', 'on hold',
  'i need to think', 'need to think about it',
  // Price objections
  'too expensive', 'cant afford', 'out of budget',
  'what does it cost', 'how much is it',
  'investment concern',
];

// ─── NICHE NORMALIZATION (from Clinic Owner Language Playbook + Core Client) ──
const NICHE_MAPPINGS: Record<string, string[]> = {
  'sports_ortho': [
    'sports', 'ortho', 'orthopedic', 'musculoskeletal',
    'athlete', 'athletes', 'sport', 'athletic',
    'acl', 'rotator cuff', 'post-op', 'post op',
    'return to sport', 'strength', 'performance',
    'crossfit', 'weightlifting', 'powerlifting',
  ],
  'pelvic_health': [
    'pelvic', 'pelvic health', 'pelvic floor',
    'womens health', 'postpartum', 'prenatal', 'pregnancy',
    'incontinence', 'prolapse', 'pelvic pain',
  ],
  'pediatrics': [
    'pediatric', 'pediatrics', 'kids', 'children', 'child',
    'school', 'developmental', 'autism',
  ],
  'active_aging': [
    'active aging', 'older adult', 'senior', 'elderly',
    'geriatric', '55+', '60+', 'balance', 'fall prevention',
  ],
  'runners': [
    'running', 'runner', 'runners', 'marathon', 'triathlon',
    'endurance', 'gait analysis', 'run dna', 'rundna', 'helix',
  ],
  'dance': [
    'dance', 'dancer', 'ballet', 'cheer', 'gymnastics', 'performing arts',
  ],
  'general_wellness': [
    'wellness', 'general', 'all ages', 'variety', 'mixed',
    'functional medicine', 'holistic',
  ],
  'chiro': [
    'chiro', 'chiropractor', 'chiropractic', 'dc', 'adjustment',
    'spinal', 'spine',
  ],
};

async function inferEmployment(pool: pg.Pool) {
  console.log('\n=== INFERRING EMPLOYMENT STATUS (PT Biz Language) ===');

  // Build SQL pattern arrays
  const fullTimeSQL = FULL_TIME_PATTERNS.map((p) => `body ILIKE '%${p}%'`).join(' OR ');
  const partTimeSQL = PART_TIME_PATTERNS.map((p) => `body ILIKE '%${p}%'`).join(' OR ');
  const selfEmployedSQL = SELF_EMPLOYED_PATTERNS.map((p) => `body ILIKE '%${p}%'`).join(' OR ');

  // Get conversations where inbound messages contain these patterns
  const { rows } = await pool.query(`
    SELECT DISTINCT e.contact_phone, array_agg(e.body ORDER BY e.event_ts) as messages
    FROM sms_events e
    WHERE e.direction = 'inbound'
      AND e.body IS NOT NULL
    GROUP BY e.contact_phone
  `);

  let ftCount = 0, ptCount = 0, seCount = 0;

  for (const row of rows) {
    const text = row.messages.join(' ').toLowerCase();

    let employment: string | null = null;

    // Check patterns in priority order
    if (SELF_EMPLOYED_PATTERNS.some((p) => text.includes(p.toLowerCase()))) {
      employment = 'self_employed';
      seCount++;
    } else if (PART_TIME_PATTERNS.some((p) => text.includes(p.toLowerCase()))) {
      employment = 'part_time';
      ptCount++;
    } else if (FULL_TIME_PATTERNS.some((p) => text.includes(p.toLowerCase()))) {
      employment = 'full_time';
      ftCount++;
    }

    if (employment) {
      await pool.query(`
        UPDATE conversation_state
        SET qualification_full_or_part_time = $1, updated_at = NOW()
        WHERE conversation_id IN (SELECT id FROM conversations WHERE contact_phone = $2)
          AND (qualification_full_or_part_time IS NULL OR qualification_full_or_part_time = '')
      `, [employment, row.contact_phone]);
    }
  }

  console.log(`  Full-time: ${ftCount}, Part-time: ${ptCount}, Self-employed: ${seCount}`);
}

async function inferRevenueMix(pool: pg.Pool) {
  console.log('\n=== INFERRING REVENUE MIX ===');

  const { rows } = await pool.query(`
    SELECT DISTINCT e.contact_phone, array_agg(e.body ORDER BY e.event_ts) as messages
    FROM sms_events e
    WHERE e.direction = 'inbound' AND e.body IS NOT NULL
    GROUP BY e.contact_phone
  `);

  let cashCount = 0, insCount = 0, hybridCount = 0;

  for (const row of rows) {
    const text = row.messages.join(' ').toLowerCase();

    let revenueMix: string | null = null;

    if (HYBRID_PATTERNS.some((p) => text.includes(p.toLowerCase()))) {
      revenueMix = 'balanced';
      hybridCount++;
    } else if (CASH_PATTERNS.some((p) => text.includes(p.toLowerCase()))) {
      revenueMix = 'mostly_cash';
      cashCount++;
    } else if (INSURANCE_PATTERNS.some((p) => text.includes(p.toLowerCase()))) {
      revenueMix = 'mostly_insurance';
      insCount++;
    }

    if (revenueMix) {
      await pool.query(`
        UPDATE conversation_state
        SET qualification_revenue_mix = $1, updated_at = NOW()
        WHERE conversation_id IN (SELECT id FROM conversations WHERE contact_phone = $2)
          AND (qualification_revenue_mix IS NULL OR qualification_revenue_mix = '')
      `, [revenueMix, row.contact_phone]);
    }
  }

  console.log(`  Cash: ${cashCount}, Insurance: ${insCount}, Hybrid: ${hybridCount}`);
}

async function inferCoachingInterest(pool: pg.Pool) {
  console.log('\n=== INFERRING COACHING INTEREST ===');

  const { rows } = await pool.query(`
    SELECT DISTINCT e.contact_phone, array_agg(e.body ORDER BY e.event_ts) as messages
    FROM sms_events e
    WHERE e.direction = 'inbound' AND e.body IS NOT NULL
    GROUP BY e.contact_phone
  `);

  let highCount = 0, medCount = 0, lowCount = 0;

  for (const row of rows) {
    const text = row.messages.join(' ').toLowerCase();

    let interest: string | null = null;

    if (HIGH_INTEREST_PATTERNS.some((p) => text.includes(p.toLowerCase()))) {
      interest = 'high';
      highCount++;
    } else if (LOW_INTEREST_PATTERNS.some((p) => text.includes(p.toLowerCase()))) {
      interest = 'low';
      lowCount++;
    } else if (MEDIUM_INTEREST_PATTERNS.some((p) => text.includes(p.toLowerCase()))) {
      interest = 'medium';
      medCount++;
    }

    if (interest) {
      await pool.query(`
        UPDATE conversation_state
        SET qualification_coaching_interest = $1, updated_at = NOW()
        WHERE conversation_id IN (SELECT id FROM conversations WHERE contact_phone = $2)
          AND (qualification_coaching_interest IS NULL OR qualification_coaching_interest = '')
      `, [interest, row.contact_phone]);
    }
  }

  console.log(`  High: ${highCount}, Medium: ${medCount}, Low: ${lowCount}`);
}

async function normalizeNiches(pool: pg.Pool) {
  console.log('\n=== NORMALIZING NICHE DATA ===');

  const { rows } = await pool.query(`
    SELECT contact_id, phone, niche FROM inbox_contact_profiles
    WHERE niche IS NOT NULL AND niche != ''
  `);

  let updated = 0;

  for (const row of rows) {
    const nicheText = row.niche.toLowerCase();
    let normalizedNiche: string | null = null;

    for (const [normalized, patterns] of Object.entries(NICHE_MAPPINGS)) {
      if (patterns.some((p) => nicheText.includes(p))) {
        normalizedNiche = normalized;
        break;
      }
    }

    if (normalizedNiche && normalizedNiche !== row.niche) {
      await pool.query(`
        UPDATE inbox_contact_profiles
        SET niche = $1, updated_at = NOW()
        WHERE contact_id = $2
      `, [normalizedNiche, row.contact_id]);
      updated++;
    }
  }

  // Also infer niche from SMS content
  const { rows: contacts } = await pool.query(`
    SELECT DISTINCT e.contact_phone, array_agg(e.body ORDER BY e.event_ts) as messages
    FROM sms_events e
    WHERE e.direction = 'inbound' AND e.body IS NOT NULL
    GROUP BY e.contact_phone
  `);

  let inferred = 0;

  for (const row of contacts) {
    const text = row.messages.join(' ').toLowerCase();
    let detectedNiche: string | null = null;

    for (const [normalized, patterns] of Object.entries(NICHE_MAPPINGS)) {
      if (patterns.some((p) => text.includes(p))) {
        detectedNiche = normalized;
        break;
      }
    }

    if (detectedNiche) {
      const { rowCount } = await pool.query(`
        UPDATE inbox_contact_profiles
        SET niche = $1, updated_at = NOW()
        WHERE phone = $2
          AND (niche IS NULL OR niche = '')
      `, [detectedNiche, row.contact_phone]);
      if (rowCount && rowCount > 0) inferred++;
    }
  }

  console.log(`  Normalized: ${updated}, Inferred from SMS: ${inferred}`);
}

async function addPTBizTemplates(pool: pg.Pool) {
  console.log('\n=== ADDING PT BIZ LANGUAGE TEMPLATES ===');

  const templates = [
    // ── Initial Outreach Templates ────────────────────────────────────────────
    {
      title: 'CPFM Check-In (Side Hustle)',
      body: 'Hey {firstName}! Quick question — are you looking to go all-in on your own thing, or still testing the waters? Most of our clients start exactly where you are, treating on the side while keeping their day job. 9 out of 10 go full-time within 6 months once they have the right structure.',
      category: 'initial_outreach',
      tags: ['side-hustle', 'part-time', 'cpfm'],
    },
    {
      title: 'Cash-Based Practice Opener',
      body: "Love that you're looking at cash-based! Are you thinking of going out-of-network only, or keeping some insurance as a bridge while you build? The answer totally changes the strategy.",
      category: 'initial_outreach',
      tags: ['cash-based', 'insurance', 'hybrid'],
    },
    {
      title: 'Hiring Guide Opener (Clinic Owner)',
      body: "Hey {firstName}, Jack here with PT Biz. Saw you grabbed the Hiring Guide — are you looking to bring on your first PT, or building out a team you've already started?",
      category: 'initial_outreach',
      tags: ['hiring', 'clinic-owner', 'team'],
    },
    // ── Discovery Questions ───────────────────────────────────────────────────
    {
      title: 'Stage Discovery',
      body: "Where are you at right now? Are you still in the planning phase, have you already started seeing patients, or do you have an established practice you're looking to grow?",
      category: 'discovery',
      tags: ['qualification', 'stage'],
    },
    {
      title: 'Revenue Discovery',
      body: "Are you guys fully cash-based, out-of-network, or still dealing with some insurance? And what does your current setup look like — solo or do you have a team?",
      category: 'discovery',
      tags: ['qualification', 'revenue-mix'],
    },
    {
      title: 'Trigger Discovery',
      body: "What's happening right now that made you reach out? Was there a specific thing that triggered it, or are you more in the exploring phase?",
      category: 'discovery',
      tags: ['qualification', 'urgency'],
    },
    {
      title: 'Schedule Discovery (Maxed Out)',
      body: "Are you guys maxed on your schedules right now, or do you still have room to grow before you'd need another clinician?",
      category: 'discovery',
      tags: ['capacity', 'hiring', 'scaling'],
    },
    // ── Pitch Templates ───────────────────────────────────────────────────────
    {
      title: 'Strategy Call Pitch (Performance Practice)',
      body: "That's a great setup. We work almost exclusively with performance-based cash practices, so there's strong alignment here. We do a free strategy call where we'd look at how to consistently fill your caseload, free up your time without stalling growth, and what a clean path to scaling looks like. It's not something we offer everyone since we stay pretty specialized — but you seem like a strong fit. What weekdays tend to work best? AM or PM better?",
      category: 'pitch',
      tags: ['strategy-call', 'performance', 'cash-based'],
    },
    {
      title: 'Strategy Call Pitch (Pre-Launch)',
      body: "Everything you're describing is exactly what we help map out on a strategy call. We'd look at your niche, pricing, and how to structure the first 90 days so you're not just hoping clients show up. It's not something we offer to everyone since our training is pretty specialized around cash-based practices — but based on where you're at, you seem like a strong fit. If you're open to it, what weekdays tend to work best? AM or PM?",
      category: 'pitch',
      tags: ['strategy-call', 'pre-launch', 'side-hustle'],
    },
    {
      title: 'Strategy Call Pitch (Scaling Owner)',
      body: "When clinics hit that almost-maxed phase, it's usually not a demand issue — that's the harder one to solve. It's more about tightening up systems so your new clinician fills up without you staying stuck in treatment. This is exactly what we help performance-based cash clinics map out. We'd look at how to consistently fill that new clinician's caseload, how to free up your time without stalling growth, and what a clean path beyond owner capacity looks like. What weekdays work best? AM or PM?",
      category: 'pitch',
      tags: ['strategy-call', 'scaling', 'hiring'],
    },
    // ── Booking Confirmation Templates ────────────────────────────────────────
    {
      title: 'Booking Confirmation + VIP Link',
      body: "You are all set {firstName}! I'll send the calendar invite now. Also sending you a link here with a few words from our founders Danny + Yves about what to expect on the call — definitely worth a quick watch before we connect! 🔗",
      category: 'booking_confirmation',
      tags: ['booking', 'confirmation', 'vip-link'],
    },
    {
      title: 'Booking Confirmation (Reschedule Reminder)',
      body: "Locked you in! You'll get an email invite with the Zoom link, plus a reschedule link inside in case anything comes up. Looking forward to connecting {firstName}!",
      category: 'booking_confirmation',
      tags: ['booking', 'confirmation', 'reschedule'],
    },
    // ── Follow-Up Templates ───────────────────────────────────────────────────
    {
      title: 'Bump (No Reply)',
      body: "Hey, just wanted to bump this in case it got buried. No pressure at all — if now's not the right time, totally fine. Just let me know 👍",
      category: 'follow_up',
      tags: ['no-reply', 'bump', 'follow-up'],
    },
    {
      title: 'Stats Social Proof',
      body: "Most people don't realize this, but 9 out of 10 clients who join our business residency start while still working full time. And 83% of them are able to go full time in their own practice within 6 months of working with us. Something we're really proud of!",
      category: 'social_proof',
      tags: ['stats', 'social-proof', 'credibility'],
    },
    {
      title: 'Free Call Clarification',
      body: "Great question! The strategy call itself is completely free. It's a deep dive into where you're at, how you're positioning your practice, and what's not landing. If it makes sense and we genuinely believe we can help you, we'll walk you through what working together looks like and answer any investment questions then. No pressure either way.",
      category: 'objection_handling',
      tags: ['free-call', 'pricing-objection', 'clarification'],
    },
    // ── Objection Handling ────────────────────────────────────────────────────
    {
      title: 'Objection: Not Ready Yet',
      body: "Totally fair — timing matters. Just out of curiosity, what would need to change for you to feel ready? A lot of our clients said the same thing right before they joined, and looking back most of them say they wish they'd started sooner. Either way, no pressure at all.",
      category: 'objection_handling',
      tags: ['not-ready', 'timing-objection'],
    },
    {
      title: 'Objection: Already in a Mastermind',
      body: "Appreciate you sharing that. A lot of our best clients actually came from other masterminds — usually because they wanted something more specialized around the cash-based model specifically. What would make it worth exploring what's different about how we work?",
      category: 'objection_handling',
      tags: ['mastermind', 'competitor-objection'],
    },
  ];

  let added = 0;
  let skipped = 0;

  for (const tmpl of templates) {
    // Check if already exists
    const { rows } = await pool.query(
      `SELECT id FROM message_templates WHERE name = $1`,
      [tmpl.title],
    );

    if (rows.length > 0) {
      skipped++;
      continue;
    }

    await pool.query(`
      INSERT INTO message_templates (id, name, body, created_by, created_at)
      VALUES (
        gen_random_uuid(),
        $1, $2, 'ptbiz-training', NOW()
      )
    `, [tmpl.title, tmpl.body]);
    added++;
  }

  console.log(`  Added: ${added}, Skipped (already exist): ${skipped}`);
}

async function updateConversionExamples(pool: pg.Pool) {
  console.log('\n=== ADDING HIGH-QUALITY CONVERSION EXAMPLES ===');

  // Find outbound messages sent within 24h BEFORE a booked call from same contact
  // These are the actual messages that directly preceded bookings
  const { rows } = await pool.query(`
    SELECT DISTINCT ON (e.contact_phone, e.id)
      e.id as event_id,
      e.contact_phone,
      e.body,
      e.sequence,
      e.line,
      e.event_ts,
      bc.event_ts as booked_at,
      EXTRACT(EPOCH FROM (bc.event_ts - e.event_ts))/3600 as hours_before_booking
    FROM sms_events e
    JOIN booked_calls bc ON (
      bc.text ILIKE '%' || regexp_replace(e.contact_phone, '[^0-9]', '', 'g') || '%'
      
    )
    WHERE e.direction = 'outbound'
      AND e.body IS NOT NULL
      AND LENGTH(e.body) > 40
      AND bc.event_ts > e.event_ts
      AND bc.event_ts < e.event_ts + INTERVAL '72 hours'
    ORDER BY e.contact_phone, e.id, hours_before_booking ASC
    LIMIT 500
  `);

  let added = 0;
  let skipped = 0;

  for (const row of rows) {
    // Check if already exists
    const { rows: existing } = await pool.query(
      `SELECT id FROM conversion_examples WHERE source_outbound_event_id = $1`,
      [row.event_id],
    );

    if (existing.length > 0) {
      skipped++;
      continue;
    }

    await pool.query(`
      INSERT INTO conversion_examples (
        id, source_outbound_event_id,
        booked_call_label, channel_marker, created_at
      ) VALUES (
        gen_random_uuid(),
        $1, 'pre_booking_message', $2, NOW()
      )
    `, [
      row.event_id,
      row.sequence || 'manual',
    ]);
    added++;
  }

  // Also add outbound messages that got replies (positive training signals)
  const { rows: highReplyMsgs } = await pool.query(`
    SELECT
      e.id,
      e.contact_phone,
      e.sequence,
      e.line
    FROM sms_events e
    WHERE e.direction = 'outbound'
      AND e.body IS NOT NULL
      AND LENGTH(e.body) BETWEEN 50 AND 500
      AND EXISTS (
        SELECT 1 FROM sms_events r
        WHERE r.contact_phone = e.contact_phone
          AND r.direction = 'inbound'
          AND r.event_ts > e.event_ts
          AND r.event_ts < e.event_ts + INTERVAL '48 hours'
          AND LENGTH(r.body) > 20
      )
      AND NOT EXISTS (
        SELECT 1 FROM conversion_examples ce
        WHERE ce.source_outbound_event_id = e.id
      )
    ORDER BY e.event_ts DESC
    LIMIT 1000
  `);

  for (const row of highReplyMsgs) {
    await pool.query(`
      INSERT INTO conversion_examples (
        id, source_outbound_event_id,
        booked_call_label, channel_marker, created_at
      ) VALUES (
        gen_random_uuid(),
        $1, 'got_reply', $2, NOW()
      )
    `, [
      row.id,
      row.sequence || 'manual',
    ]);
    added++;
  }

  console.log(`  Added: ${added}, Skipped: ${skipped}`);
}

async function main() {
  try {
    console.log('=== PT BIZ TRAINING DATA APPLY ===\n');

    await inferEmployment(pool);
    await inferRevenueMix(pool);
    await inferCoachingInterest(pool);
    await normalizeNiches(pool);
    await addPTBizTemplates(pool);
    await updateConversionExamples(pool);

    // Show final stats
    const { rows: stats } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM conversation_state WHERE qualification_full_or_part_time IS NOT NULL AND qualification_full_or_part_time != '') as employment_known,
        (SELECT COUNT(*) FROM conversation_state WHERE qualification_revenue_mix IS NOT NULL AND qualification_revenue_mix != '') as revenue_known,
        (SELECT COUNT(*) FROM conversation_state WHERE qualification_coaching_interest IS NOT NULL AND qualification_coaching_interest != '') as interest_known,
        (SELECT COUNT(*) FROM conversation_state WHERE qualification_coaching_interest = 'high') as high_interest,
        (SELECT COUNT(*) FROM inbox_contact_profiles WHERE niche IS NOT NULL AND niche != '') as niche_known,
        (SELECT COUNT(*) FROM message_templates) as templates,
        (SELECT COUNT(*) FROM conversion_examples) as conversion_examples
    `);

    console.log('\n=== FINAL STATS ===');
    console.table(stats[0]);

  } finally {
    await pool.end();
  }
}

main().catch(console.error);
