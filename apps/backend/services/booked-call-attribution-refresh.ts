import type { Logger } from "@slack/bolt";
import { upsertAttributionReviewItem } from "./attribution-review-queue.js";
import {
  type BookedCallAttributionSource,
  getBookedCallAttributionSources,
  getBookedCallSequenceFromSmsEvents,
  getBookedCallSmsReplyLinks,
  normalizeContactNameKey,
} from "./booked-calls.js";
import { getPrismaClient } from "./prisma.js";

const getPrisma = () => getPrismaClient();

const normalizePhoneKey = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  return digits.length > 10 ? digits.slice(-10) : digits;
};

const normalizeEmailKey = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

type ConversationEvidence =
  | "conversation_phone"
  | "profile_phone"
  | "profile_email"
  | "profile_name";

type ConversationCandidate = {
  conversationId: string;
  lastTouchAtMs: number | null;
  evidence: Set<ConversationEvidence>;
};

type ResolvedConversationCandidate = {
  conversationId: string | null;
  conversationMatchSeconds: number | null;
  evidence: ConversationEvidence | null;
  confidence: number | null;
};

const EVIDENCE_PRIORITY: Record<ConversationEvidence, number> = {
  profile_email: 4,
  profile_phone: 3,
  conversation_phone: 2,
  profile_name: 1,
};

const PRIMARY_EVIDENCE_CONFIDENCE: Record<ConversationEvidence, number> = {
  profile_email: 0.97,
  profile_phone: 0.93,
  conversation_phone: 0.88,
  profile_name: 0.78,
};

const choosePrimaryEvidence = (
  evidence: Set<ConversationEvidence>,
): ConversationEvidence | null => {
  let best: ConversationEvidence | null = null;
  let bestPriority = -1;
  for (const item of evidence) {
    const priority = EVIDENCE_PRIORITY[item];
    if (priority > bestPriority) {
      best = item;
      bestPriority = priority;
    }
  }
  return best;
};

export const resolveBestConversationCandidate = (
  bookingTs: number,
  candidates: ConversationCandidate[],
): ResolvedConversationCandidate => {
  if (!Number.isFinite(bookingTs) || candidates.length === 0) {
    return {
      conversationId: null,
      conversationMatchSeconds: null,
      evidence: null,
      confidence: null,
    };
  }

  let best: {
    conversationId: string;
    score: number;
    deltaMs: number;
    evidence: ConversationEvidence;
    confidence: number;
  } | null = null;

  for (const candidate of candidates) {
    const primaryEvidence = choosePrimaryEvidence(candidate.evidence);
    if (!primaryEvidence) continue;

    const deltaMs = Number.isFinite(candidate.lastTouchAtMs || Number.NaN)
      ? Math.abs((candidate.lastTouchAtMs || 0) - bookingTs)
      : Number.POSITIVE_INFINITY;
    const hasPriorTouch =
      Number.isFinite(candidate.lastTouchAtMs || Number.NaN) &&
      (candidate.lastTouchAtMs || 0) <= bookingTs;
    const evidenceBonus = Math.max(0, candidate.evidence.size - 1) * 1.5;
    const timingBonus = Number.isFinite(deltaMs)
      ? hasPriorTouch
        ? Math.max(0, 12 - deltaMs / (24 * 60 * 60 * 1000))
        : -Math.min(8, deltaMs / (12 * 60 * 60 * 1000))
      : -3;
    const score =
      EVIDENCE_PRIORITY[primaryEvidence] * 100 + evidenceBonus + timingBonus;
    const confidence = Math.min(
      0.995,
      PRIMARY_EVIDENCE_CONFIDENCE[primaryEvidence] +
        Math.max(0, candidate.evidence.size - 1) * 0.015,
    );

    if (
      !best ||
      score > best.score ||
      (score === best.score && deltaMs < best.deltaMs) ||
      (score === best.score &&
        deltaMs === best.deltaMs &&
        candidate.conversationId < best.conversationId)
    ) {
      best = {
        conversationId: candidate.conversationId,
        score,
        deltaMs,
        evidence: primaryEvidence,
        confidence,
      };
    }
  }

  return {
    conversationId: best?.conversationId || null,
    conversationMatchSeconds:
      best && Number.isFinite(best.deltaMs)
        ? Math.round(best.deltaMs / 1000)
        : null,
    evidence: best?.evidence || null,
    confidence: best?.confidence || null,
  };
};

const getOrCreateConversationCandidate = (
  map: Map<string, ConversationCandidate>,
  conversationId: string,
  lastTouchAtMs: number | null,
): ConversationCandidate => {
  const existing = map.get(conversationId);
  if (existing) {
    if (existing.lastTouchAtMs == null && lastTouchAtMs != null) {
      existing.lastTouchAtMs = lastTouchAtMs;
    }
    return existing;
  }

  const created: ConversationCandidate = {
    conversationId,
    lastTouchAtMs,
    evidence: new Set(),
  };
  map.set(conversationId, created);
  return created;
};

const buildSourceIdentity = (source: BookedCallAttributionSource) => ({
  phoneKey: normalizePhoneKey(source.contactPhone),
  emailKey: normalizeEmailKey(source.contactEmail),
  nameKey: normalizeContactNameKey(source.contactName),
});

const mapSetterFromBucket = (
  bucket: "jack" | "brandon" | "selfBooked",
): string => {
  if (bucket === "jack") return "Jack Licata";
  if (bucket === "brandon") return "Brandon Erwin";
  return "Self Booked";
};

const mapSetterHint = (
  bucket: "jack" | "brandon" | "selfBooked",
): string | null => {
  if (bucket === "jack") return "jack";
  if (bucket === "brandon") return "brandon";
  return null;
};

const confidenceBandFor = (confidence: number | null): string | null => {
  if (confidence == null || !Number.isFinite(confidence)) return null;
  if (confidence >= 0.9) return "high";
  if (confidence >= 0.75) return "medium";
  return "low";
};

const buildAttributionStatus = (args: {
  hasConversation: boolean;
  confidence: number | null;
  smsMatched: boolean;
  replyLinked: boolean;
}): {
  attributionStatus: string;
  attributionConfidenceBand: string | null;
  fallbackUsed: boolean;
  needsReview: boolean;
  reviewReason: string | null;
  attributionPath: string;
} => {
  const confidenceBand = confidenceBandFor(args.confidence);
  const fallbackUsed = !args.smsMatched || !args.replyLinked;
  const needsReview =
    !args.hasConversation ||
    (args.confidence != null && args.confidence < 0.8) ||
    !args.smsMatched;
  const reviewReason = !args.hasConversation
    ? "conversation_unresolved"
    : !args.smsMatched
      ? "sms_sequence_unresolved"
      : args.confidence != null && args.confidence < 0.8
        ? "low_confidence"
        : null;
  const attributionStatus = needsReview ? "needs_review" : "confirmed";
  const attributionPath = [
    args.replyLinked ? "reply_link" : "no_reply_link",
    args.smsMatched ? "sms_lookup" : "candidate_resolution",
    confidenceBand || "no_confidence",
  ].join(" > ");

  return {
    attributionStatus,
    attributionConfidenceBand: confidenceBand,
    fallbackUsed,
    needsReview,
    reviewReason,
    attributionPath,
  };
};

export type RefreshBookedCallAttributionResult = {
  processed: number;
  upserted: number;
  matchedConversations: number;
};

export const refreshBookedCallAttribution = async (
  params: { from: Date; to: Date; channelId?: string },
  logger?: Pick<Logger, "info" | "warn" | "error">,
): Promise<RefreshBookedCallAttributionResult> => {
  const prisma = getPrisma();
  const sources = await getBookedCallAttributionSources({
    from: params.from,
    to: params.to,
    channelId: params.channelId,
  });
  const attributionLogger = logger
    ? { ...logger, debug: logger.info }
    : undefined;
  const [smsReplyLinks, smsSequenceLookup, sequenceRows] = await Promise.all([
    getBookedCallSmsReplyLinks(sources, attributionLogger),
    getBookedCallSequenceFromSmsEvents(sources, attributionLogger),
    prisma.sequence_registry.findMany({
      select: { id: true, label: true, normalizedLabel: true },
    }),
  ]);
  const sequenceIdByLabel = new Map(
    sequenceRows
      .filter((row) => row.normalizedLabel)
      .map((row) => [row.normalizedLabel!.trim().toLowerCase(), row.id]),
  );
  const existingRows =
    sources.length === 0
      ? []
      : await prisma.booked_call_attribution.findMany({
          where: {
            booked_call_id: {
              in: sources.map((source) => source.bookedCallId),
            },
          },
          select: {
            booked_call_id: true,
            conversation_id: true,
            conversation_match_seconds: true,
            first_conversion: true,
            resolved_sequence_id: true,
            resolved_sequence_label: true,
          },
        });
  const existingByBookedCallId = new Map(
    existingRows.map((row) => [row.booked_call_id, row]),
  );

  const phoneKeys = Array.from(
    new Set(
      sources
        .map((source) => normalizePhoneKey(source.contactPhone))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const emailKeys = Array.from(
    new Set(
      sources
        .map((source) => normalizeEmailKey(source.contactEmail))
        .filter((value): value is string => Boolean(value)),
    ),
  );
  const nameKeys = Array.from(
    new Set(
      sources
        .map((source) => normalizeContactNameKey(source.contactName))
        .filter((value): value is string => Boolean(value)),
    ),
  );

  const conversationRows =
    phoneKeys.length === 0
      ? []
      : await prisma.$queryRawUnsafe<
          Array<{
            id: string;
            contact_phone: string | null;
            last_touch_at: Date | null;
          }>
        >(
          `
          SELECT id, contact_phone, last_touch_at
          FROM conversations
          WHERE contact_phone IS NOT NULL
            AND RIGHT(regexp_replace(contact_phone, '\\D', '', 'g'), 10) = ANY($1::text[])
          `,
          phoneKeys,
        );

  const profileRows =
    phoneKeys.length === 0 && emailKeys.length === 0 && nameKeys.length === 0
      ? []
      : await prisma.$queryRawUnsafe<
          Array<{
            conversation_id: string;
            last_touch_at: Date | null;
            profile_phone: string | null;
            profile_email: string | null;
            profile_name: string | null;
          }>
        >(
          `
          SELECT
            icp.conversation_id,
            c.last_touch_at,
            icp.phone AS profile_phone,
            icp.email AS profile_email,
            icp.name AS profile_name
          FROM inbox_contact_profiles icp
          INNER JOIN conversations c ON c.id = icp.conversation_id
          WHERE icp.conversation_id IS NOT NULL
            AND (
              (array_length($1::text[], 1) IS NOT NULL AND RIGHT(regexp_replace(COALESCE(icp.phone, ''), '\\D', '', 'g'), 10) = ANY($1::text[]))
              OR (array_length($2::text[], 1) IS NOT NULL AND LOWER(TRIM(COALESCE(icp.email, ''))) = ANY($2::text[]))
              OR (array_length($3::text[], 1) IS NOT NULL AND LOWER(regexp_replace(TRIM(COALESCE(icp.name, '')), '\\s+', ' ', 'g')) = ANY($3::text[]))
            )
          `,
          phoneKeys,
          emailKeys,
          nameKeys,
        );

  const byPhone = new Map<
    string,
    Array<{ id: string; lastTouchAtMs: number | null }>
  >();
  for (const row of conversationRows) {
    const key = normalizePhoneKey(row.contact_phone);
    if (!key) continue;
    const list = byPhone.get(key) || [];
    list.push({
      id: row.id,
      lastTouchAtMs: row.last_touch_at ? row.last_touch_at.getTime() : null,
    });
    byPhone.set(key, list);
  }

  const profileRowsByPhone = new Map<
    string,
    Array<{ id: string; lastTouchAtMs: number | null }>
  >();
  const profileRowsByEmail = new Map<
    string,
    Array<{ id: string; lastTouchAtMs: number | null }>
  >();
  const profileRowsByName = new Map<
    string,
    Array<{ id: string; lastTouchAtMs: number | null }>
  >();

  for (const row of profileRows) {
    const lastTouchAtMs = row.last_touch_at
      ? row.last_touch_at.getTime()
      : null;
    const phoneKey = normalizePhoneKey(row.profile_phone);
    const emailKey = normalizeEmailKey(row.profile_email);
    const nameKey = normalizeContactNameKey(row.profile_name);

    if (phoneKey) {
      const list = profileRowsByPhone.get(phoneKey) || [];
      list.push({ id: row.conversation_id, lastTouchAtMs });
      profileRowsByPhone.set(phoneKey, list);
    }

    if (emailKey) {
      const list = profileRowsByEmail.get(emailKey) || [];
      list.push({ id: row.conversation_id, lastTouchAtMs });
      profileRowsByEmail.set(emailKey, list);
    }

    if (nameKey) {
      const list = profileRowsByName.get(nameKey) || [];
      list.push({ id: row.conversation_id, lastTouchAtMs });
      profileRowsByName.set(nameKey, list);
    }
  }

  let upserted = 0;
  let matchedConversations = 0;

  for (const source of sources) {
    const bookingTs = new Date(source.eventTs).getTime();
    const identity = buildSourceIdentity(source);
    const candidatesByConversationId = new Map<string, ConversationCandidate>();
    if (identity.phoneKey) {
      for (const candidate of byPhone.get(identity.phoneKey) || []) {
        getOrCreateConversationCandidate(
          candidatesByConversationId,
          candidate.id,
          candidate.lastTouchAtMs,
        ).evidence.add("conversation_phone");
      }
      for (const candidate of profileRowsByPhone.get(identity.phoneKey) || []) {
        getOrCreateConversationCandidate(
          candidatesByConversationId,
          candidate.id,
          candidate.lastTouchAtMs,
        ).evidence.add("profile_phone");
      }
    }
    if (identity.emailKey) {
      for (const candidate of profileRowsByEmail.get(identity.emailKey) || []) {
        getOrCreateConversationCandidate(
          candidatesByConversationId,
          candidate.id,
          candidate.lastTouchAtMs,
        ).evidence.add("profile_email");
      }
    }
    if (identity.nameKey) {
      for (const candidate of profileRowsByName.get(identity.nameKey) || []) {
        getOrCreateConversationCandidate(
          candidatesByConversationId,
          candidate.id,
          candidate.lastTouchAtMs,
        ).evidence.add("profile_name");
      }
    }

    const smsLookup = smsSequenceLookup.get(source.bookedCallId);
    const replyLink = smsReplyLinks.get(
      `${source.slackChannelId}::${source.slackMessageTs}`,
    );
    const existing = existingByBookedCallId.get(source.bookedCallId);
    const candidateResolution = resolveBestConversationCandidate(bookingTs, [
      ...candidatesByConversationId.values(),
    ]);

    const resolvedConversationId =
      smsLookup?.conversationId ||
      candidateResolution.conversationId ||
      existing?.conversation_id ||
      null;
    const resolvedConversationMatchSeconds =
      smsLookup?.conversationId === resolvedConversationId
        ? 0
        : (candidateResolution.conversationMatchSeconds ??
          existing?.conversation_match_seconds ??
          null);
    const resolvedFirstConversion =
      source.firstConversion ||
      smsLookup?.sequenceLabel ||
      existing?.first_conversion ||
      null;
    const smartConversationMethod =
      candidateResolution.evidence != null
        ? `reaction_bucket_v3_${candidateResolution.evidence}`
        : "reaction_bucket_v2";
    const mappingMethod =
      smsLookup?.sequenceLabel || smsLookup?.conversationId
        ? "reaction_bucket_v3_sms_lookup"
        : smartConversationMethod;
    const mapperVersion =
      smsLookup?.sequenceLabel || smsLookup?.conversationId
        ? "v3.reaction-bucket.sms-lookup"
        : candidateResolution.evidence
          ? `v3.reaction-bucket.${candidateResolution.evidence}`
          : "v2.reaction-bucket";
    const matchConfidence =
      smsLookup?.conversationId || smsLookup?.sequenceLabel
        ? source.bucket === "selfBooked"
          ? 0.82
          : 0.98
        : (candidateResolution.confidence ??
          (source.bucket === "selfBooked" ? 0.7 : 0.95));
    const attributionState = buildAttributionStatus({
      hasConversation: Boolean(resolvedConversationId),
      confidence: matchConfidence,
      smsMatched: Boolean(
        smsLookup?.sequenceLabel || smsLookup?.conversationId,
      ),
      replyLinked: Boolean(replyLink?.hasPriorReply),
    });
    const resolvedSequenceLabel =
      smsLookup?.sequenceLabel ||
      resolvedFirstConversion ||
      existing?.resolved_sequence_label ||
      null;
    const resolvedSequenceId =
      (resolvedSequenceLabel
        ? sequenceIdByLabel.get(resolvedSequenceLabel.trim().toLowerCase()) ||
          null
        : null) ||
      existing?.resolved_sequence_id ||
      null;

    await prisma.booked_call_attribution.upsert({
      where: { booked_call_id: source.bookedCallId },
      create: {
        booked_call_id: source.bookedCallId,
        booked_event_ts: new Date(source.eventTs),
        booked_text: source.text || null,
        canonical_booking: true,
        mapping_method: mappingMethod,
        match_confidence: matchConfidence,
        attribution_status: attributionState.attributionStatus,
        attribution_confidence_band: attributionState.attributionConfidenceBand,
        fallback_used: attributionState.fallbackUsed,
        needs_review: attributionState.needsReview,
        review_reason: attributionState.reviewReason,
        conversation_id: resolvedConversationId,
        conversation_match_seconds: resolvedConversationMatchSeconds,
        setter_hint: mapSetterHint(source.bucket),
        setter_final: mapSetterFromBucket(source.bucket),
        closer_final: null,
        first_conversion: resolvedFirstConversion,
        source_bucket:
          source.bucket === "selfBooked" ? "self_booked" : "setter_attributed",
        resolved_sequence_id: resolvedSequenceId,
        resolved_sequence_label: resolvedSequenceLabel,
        attribution_path: attributionState.attributionPath,
        matched_via_phone: Boolean(
          source.contactPhone && smsLookup?.conversationId,
        ),
        matched_via_fuzzy: Boolean(
          candidateResolution.evidence && !smsLookup?.conversationId,
        ),
        matched_via_reply_link: Boolean(replyLink?.hasPriorReply),
        hubspot_contact_id: null,
        lead_score: null,
        lead_score_source: null,
        mapper_version: mapperVersion,
      },
      update: {
        booked_event_ts: new Date(source.eventTs),
        booked_text: source.text || null,
        canonical_booking: true,
        mapping_method: mappingMethod,
        match_confidence: matchConfidence,
        attribution_status: attributionState.attributionStatus,
        attribution_confidence_band: attributionState.attributionConfidenceBand,
        fallback_used: attributionState.fallbackUsed,
        needs_review: attributionState.needsReview,
        review_reason: attributionState.reviewReason,
        conversation_id: resolvedConversationId,
        conversation_match_seconds: resolvedConversationMatchSeconds,
        setter_hint: mapSetterHint(source.bucket),
        setter_final: mapSetterFromBucket(source.bucket),
        first_conversion: resolvedFirstConversion,
        source_bucket:
          source.bucket === "selfBooked" ? "self_booked" : "setter_attributed",
        resolved_sequence_id: resolvedSequenceId,
        resolved_sequence_label: resolvedSequenceLabel,
        attribution_path: attributionState.attributionPath,
        matched_via_phone: Boolean(
          source.contactPhone && smsLookup?.conversationId,
        ),
        matched_via_fuzzy: Boolean(
          candidateResolution.evidence && !smsLookup?.conversationId,
        ),
        matched_via_reply_link: Boolean(replyLink?.hasPriorReply),
        mapper_version: mapperVersion,
      },
    });

    if (attributionState.needsReview) {
      await upsertAttributionReviewItem({
        booked_call_id: source.bookedCallId,
        priority: matchConfidence != null && matchConfidence < 0.8 ? 80 : 50,
        issue_type: attributionState.reviewReason || "needs_review",
        issue_summary: `Attribution needs review for ${source.contactName || source.contactPhone || source.bookedCallId}`,
        candidate_sequences: {
          booked_call_id: source.bookedCallId,
          resolved_sequence_id: resolvedSequenceId,
          resolved_sequence_label: resolvedSequenceLabel,
          confidence: matchConfidence,
          conversation_id: resolvedConversationId,
        },
        status: "open",
      });
    }

    upserted += 1;
    if (resolvedConversationId) matchedConversations += 1;
  }

  logger?.info?.("booked-call-attribution: refreshed", {
    from: params.from.toISOString(),
    to: params.to.toISOString(),
    processed: sources.length,
    upserted,
    matchedConversations,
  });

  return {
    processed: sources.length,
    upserted,
    matchedConversations,
  };
};
