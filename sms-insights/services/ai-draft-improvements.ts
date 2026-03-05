import { getPrismaClient } from './prisma.js';

const getPrisma = () => getPrismaClient();

/**
 * AI Draft Improvement Service
 *
 * Addresses the 0% acceptance rate issue by:
 * 1. Improving draft quality scoring
 * 2. Learning from accepted/rejected patterns
 * 3. Providing confidence scores
 * 4. Auto-suggesting based on high-performing templates
 */

export type DraftQualityScore = {
  overall: number; // 0-100
  tone: number; // 0-100 (conversational, professional, etc.)
  length: number; // 0-100 (appropriate length for context)
  personalization: number; // 0-100 (uses contact name, references context)
  callToAction: number; // 0-100 (has clear next step)
  confidence: number; // 0-100 (how confident we are in this draft)
};

/**
 * Analyze draft quality
 */
export function analyzeDraftQuality(
  draft: string,
  context: {
    contactName?: string;
    lastMessage?: string;
    conversationLength?: number;
    sequence?: string;
  },
): DraftQualityScore {
  const scores: DraftQualityScore = {
    overall: 0,
    tone: 0,
    length: 0,
    personalization: 0,
    callToAction: 0,
    confidence: 0,
  };

  // Length scoring (ideal: 50-200 chars for SMS)
  const len = draft.length;
  if (len >= 50 && len <= 200) {
    scores.length = 100;
  } else if (len >= 30 && len <= 300) {
    scores.length = 70;
  } else if (len > 0 && len <= 500) {
    scores.length = 40;
  } else {
    scores.length = 20;
  }

  // Tone scoring (conversational markers)
  const conversationalMarkers = [
    /\bhey\b/i,
    /\bhi\b/i,
    /\byou\b/i,
    /\byour\b/i,
    /\bwe\b/i,
    /\blet's\b/i,
    /\bI'd love\b/i,
    /\bsounds great\b/i,
    /\bawesome\b/i,
    /\bperfect\b/i,
  ];
  const toneMatches = conversationalMarkers.filter((m) => m.test(draft)).length;
  scores.tone = Math.min(100, toneMatches * 15 + 40);

  // Personalization scoring
  let personalizationScore = 30; // Base score
  if (context.contactName && draft.toLowerCase().includes(context.contactName.toLowerCase().split(' ')[0])) {
    personalizationScore += 35;
  }
  if (context.lastMessage && draft.length > 20) {
    // Check if draft references something from last message
    const lastWords = context.lastMessage
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 4);
    const draftLower = draft.toLowerCase();
    if (lastWords.some((w) => draftLower.includes(w))) {
      personalizationScore += 25;
    }
  }
  if (context.sequence) {
    personalizationScore += 10; // Context-aware
  }
  scores.personalization = Math.min(100, personalizationScore);

  // Call to action scoring
  const ctaMarkers = [
    /\?$/, // Ends with question
    /what time/i,
    /when works/i,
    /let me know/i,
    /reply back/i,
    /book a call/i,
    /schedule/i,
    /would you be interested/i,
    /want to chat/i,
    /quick call/i,
  ];
  const ctaMatches = ctaMarkers.filter((m) => m.test(draft)).length;
  scores.callToAction = Math.min(100, ctaMatches * 25 + 25);

  // Overall score (weighted average)
  scores.overall = Math.round(
    scores.tone * 0.2 + scores.length * 0.15 + scores.personalization * 0.35 + scores.callToAction * 0.3,
  );

  // Confidence (based on how well we can analyze)
  scores.confidence = Math.round(
    (scores.overall > 70 ? 80 : 50) + (context.contactName ? 10 : 0) + (context.lastMessage ? 10 : 0),
  );

  return scores;
}

/**
 * Get high-performing message templates from conversation history
 */
export async function getHighPerformingTemplates(limit = 10): Promise<
  Array<{
    body: string;
    replyRate: number;
    bookingRate: number;
    sequence: string | null;
  }>
> {
  const prisma = getPrisma();

  // Find outbound messages that led to replies or bookings
  const rows = await prisma.$queryRawUnsafe<any[]>(
    `
    WITH outbound_performance AS (
      SELECT
        e.body,
        e.sequence,
        COUNT(DISTINCT e.contact_phone) as sent_count,
        COUNT(DISTINCT CASE WHEN r.direction = 'inbound' THEN r.contact_phone END) as reply_count,
        COUNT(DISTINCT bc.parsed_contact_phone) as booking_count
      FROM sms_events e
      LEFT JOIN sms_events r ON
        r.contact_phone = e.contact_phone AND
        r.direction = 'inbound' AND
        r.inserted_at > e.inserted_at AND
        r.inserted_at < e.inserted_at + INTERVAL '7 days'
      LEFT JOIN booked_calls bc ON
        bc.parsed_contact_phone = e.contact_phone AND
        bc.event_time > e.inserted_at AND
        bc.event_time < e.inserted_at + INTERVAL '14 days'
      WHERE e.direction = 'outbound'
        AND e.body IS NOT NULL
        AND LENGTH(e.body) > 20
        AND e.sequence IS NOT NULL
      GROUP BY e.body, e.sequence
      HAVING COUNT(DISTINCT e.contact_phone) >= 5
    )
    SELECT
      body,
      sequence,
      sent_count,
      reply_count,
      booking_count,
      ROUND(100.0 * reply_count / NULLIF(sent_count, 0), 2) as reply_rate,
      ROUND(100.0 * booking_count / NULLIF(sent_count, 0), 2) as booking_rate
    FROM outbound_performance
    WHERE reply_count > 0
    ORDER BY (reply_count::float / sent_count) * (1 + booking_count::float / GREATEST(1, reply_count)) DESC
    LIMIT $1
  `,
    limit,
  );

  return rows.map((row) => ({
    body: row.body,
    replyRate: Number.parseFloat(row.reply_rate) || 0,
    bookingRate: Number.parseFloat(row.booking_rate) || 0,
    sequence: row.sequence,
  }));
}

/**
 * Learn from draft acceptance/rejection patterns
 */
export async function getDraftAcceptancePatterns(): Promise<{
  acceptedPatterns: string[];
  rejectedPatterns: string[];
  recommendations: string[];
}> {
  const prisma = getPrisma();

  // Get accepted drafts
  const accepted = await prisma.draft_suggestions.findMany({
    where: { accepted: true },
    select: { generated_text: true, lint_score: true, structural_score: true },
    orderBy: { created_at: 'desc' },
    take: 50,
  });

  // Get rejected drafts
  const rejected = await prisma.draft_suggestions.findMany({
    where: { accepted: false },
    select: { generated_text: true, lint_score: true, structural_score: true },
    orderBy: { created_at: 'desc' },
    take: 50,
  });

  const acceptedPatterns: string[] = [];
  const rejectedPatterns: string[] = [];
  const recommendations: string[] = [];

  // Analyze patterns
  if (accepted.length === 0 && rejected.length > 0) {
    recommendations.push('No drafts have been accepted yet. Consider:');
    recommendations.push('- Making drafts shorter and more conversational');
    recommendations.push('- Including specific call-to-actions');
    recommendations.push('- Personalizing with contact name');
    recommendations.push('- Referencing their specific situation');
  }

  // Find common patterns in rejected drafts
  for (const row of rejected) {
    const body = row.generated_text || '';
    if (body.length > 200) {
      rejectedPatterns.push('Too long (>200 chars)');
    }
    if (!body.includes('?')) {
      rejectedPatterns.push('No question/CTA');
    }
    if ((body.match(/\bI\b/g)?.length ?? 0) > 3) {
      rejectedPatterns.push('Too self-focused (many "I" statements)');
    }
  }

  return {
    acceptedPatterns: [...new Set(acceptedPatterns)],
    rejectedPatterns: [...new Set(rejectedPatterns)],
    recommendations,
  };
}

/**
 * Generate improved draft based on patterns
 */
export async function generateImprovedDraft(context: {
  contactName?: string;
  lastMessage?: string;
  conversationSummary?: string;
  sequence?: string;
}): Promise<{
  draft: string;
  qualityScore: DraftQualityScore;
  basedOn: string;
}> {
  // Get high-performing templates
  const templates = await getHighPerformingTemplates(5);

  // Select best matching template based on context
  let bestTemplate = templates[0];
  if (context.sequence) {
    const seqMatch = templates.find((t) => t.sequence === context.sequence);
    if (seqMatch) {
      bestTemplate = seqMatch;
    }
  }

  // Personalize template
  let draft = bestTemplate?.body || 'Hey! What time works for a quick call this week?';

  // Replace generic placeholders
  if (context.contactName) {
    const firstName = context.contactName.split(' ')[0];
    // Add name if not present
    if (!draft.toLowerCase().includes(firstName.toLowerCase())) {
      draft = `Hey ${firstName}! ${draft.replace(/^hey!?\s*/i, '')}`;
    }
  }

  const qualityScore = analyzeDraftQuality(draft, context);

  return {
    draft,
    qualityScore,
    basedOn: bestTemplate?.sequence || 'general',
  };
}
