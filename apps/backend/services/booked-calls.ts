import type { Logger } from "@slack/bolt";
import { listBookedCallsInRange } from "./booked-calls-store.js";
import { getPrismaClient } from "./prisma.js";
import { DEFAULT_BUSINESS_TIMEZONE, dayKeyInTimeZone } from "./time-range.js";

export type BookedCallsTrendPoint = {
  day: string; // YYYY-MM-DD
  booked: number;
  jack: number;
  brandon: number;
  selfBooked: number;
};

export type BookedCallsSummary = {
  timeRange: { from: string; to: string };
  totals: {
    booked: number;
    jack: number;
    brandon: number;
    selfBooked: number;
  };
  trendByDay: BookedCallsTrendPoint[];
};

export type BookedCallAttributionBucket = "jack" | "brandon" | "selfBooked";

export type BookedCallAttributionSource = {
  bookedCallId: string;
  eventTs: string;
  bucket: BookedCallAttributionBucket;
  firstConversion: string | null;
  rep: string | null;
  line: string | null;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  slackChannelId: string;
  slackMessageTs: string;
  text: string | null;
  raw: unknown; // Add raw field to access Slack message attachments
  mappingMethod?: string | null;
  matchConfidence?: number | null;
  attributionStatus?: string | null;
  attributionConfidenceBand?: string | null;
  fallbackUsed?: boolean | null;
  needsReview?: boolean | null;
  reviewReason?: string | null;
  attributionPath?: string | null;
  resolvedSequenceLabel?: string | null;
};

export type BookedCallSmsReplyLink = {
  hasPriorReply: boolean;
  latestReplyAt: string | null;
  reason:
    | "matched_reply_before_booking"
    | "no_contact_phone"
    | "no_reply_before_booking"
    | "invalid_booking_timestamp";
};

type NormalizedBookedCallLookup = {
  key: string;
  phoneKey: string | null;
  contactNameKey: string | null;
  bookingTs: number;
};

const ATTRIBUTION_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

const normalizePhoneKey = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length < 10) return null;
  return digits.slice(-10);
};

const normalizeEmailKey = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
};

export const normalizeContactNameKey = (
  value: string | null | undefined,
): string | null => {
  if (!value) return null;
  const normalized = value.trim().toLowerCase().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : null;
};

export const bookedCallSourceKey = (
  source: Pick<
    BookedCallAttributionSource,
    "slackChannelId" | "slackMessageTs"
  >,
): string => `${source.slackChannelId}::${source.slackMessageTs}`;

const findLatestAtOrBefore = (
  values: number[],
  upperBoundMs: number,
): number | null => {
  if (values.length === 0) return null;
  let left = 0;
  let right = values.length - 1;
  let answer = -1;
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const value = values[mid];
    if (value <= upperBoundMs) {
      answer = mid;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  if (answer < 0) return null;
  return values[answer] ?? null;
};

const parseGraceSeconds = (): number => {
  const raw = Number.parseInt(
    process.env.BOOKED_CALL_ATTRIBUTION_GRACE_SECONDS || "300",
    10,
  );
  if (!Number.isFinite(raw) || raw < 0) return 300;
  return raw;
};

const BOOKED_CALL_ATTRIBUTION_GRACE_SECONDS = parseGraceSeconds();

const hasReaction = (
  reactions: Array<{ reaction_name: string; users: unknown }>,
  name: string,
  userId?: string,
): boolean => {
  const target = name.trim().toLowerCase();
  return reactions.some((r) => {
    if ((r.reaction_name || "").trim().toLowerCase() !== target) return false;
    if (!userId) return true; // Fallback if no user ID configured
    return Array.isArray(r.users) && r.users.includes(userId);
  });
};

const parseFallbackField = (fallback: string, label: string): string | null => {
  if (!fallback) return null;
  const pattern = new RegExp(
    `\\*${label.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\\\$&")}\\*:\\s*(.*)$`,
    "im",
  );
  const match = fallback.match(pattern);
  const value = (match?.[1] || "")
    .trim()
    .replace(/<mailto:[^|>]+\|([^>]+)>/gi, "$1")
    .replace(/<[^|>]+\|([^>]+)>/g, "$1");
  return value.length > 0 ? value : null;
};

const fallbackFromRaw = (raw: unknown): string => {
  if (!raw || typeof raw !== "object") return "";
  const typed = raw as { attachments?: Array<{ fallback?: string }> };
  const first = Array.isArray(typed.attachments) ? typed.attachments[0] : null;
  if (!first) return "";
  return String(first.fallback || "");
};

const parseContactNameFromFallback = (fallback: string): string | null => {
  const explicit =
    parseFallbackField(fallback, "Name") ||
    parseFallbackField(fallback, "Contact Name");
  if (explicit) return explicit;

  const first = parseFallbackField(fallback, "First Name");
  const last = parseFallbackField(fallback, "Last Name");
  const combined = [first, last]
    .filter((part): part is string => Boolean(part))
    .join(" ")
    .trim();
  return combined.length > 0 ? combined : null;
};

const parseContactPhoneFromFallback = (fallback: string): string | null => {
  const explicit =
    parseFallbackField(fallback, "Phone") ||
    parseFallbackField(fallback, "Phone Number") ||
    parseFallbackField(fallback, "Mobile Phone") ||
    parseFallbackField(fallback, "Mobile") ||
    parseFallbackField(fallback, "Cell") ||
    parseFallbackField(fallback, "SMS Number");
  if (explicit) return explicit;

  // Fallback: some Slack payload variants do not label phone, but include a US number inline.
  const inlineMatch = fallback.match(/(?:\+?1[\s\-().]*)?(?:\d[\s\-().]*){10}/);
  return inlineMatch?.[0] || null;
};

export const resolveBookedCallSmsReplyLink = (
  call: NormalizedBookedCallLookup,
  lookups: {
    inboundByPhone: Map<string, number[]>;
    inboundByName: Map<string, number[]>;
  },
): BookedCallSmsReplyLink => {
  if (!Number.isFinite(call.bookingTs)) {
    return {
      hasPriorReply: false,
      latestReplyAt: null,
      reason: "invalid_booking_timestamp",
    };
  }

  let latestReplyTs: number | null = null;

  if (call.phoneKey) {
    const phoneCandidates = lookups.inboundByPhone.get(call.phoneKey) || [];
    latestReplyTs = findLatestAtOrBefore(phoneCandidates, call.bookingTs);
  }

  if (
    (!latestReplyTs ||
      latestReplyTs < call.bookingTs - ATTRIBUTION_WINDOW_MS) &&
    call.contactNameKey
  ) {
    const nameCandidates = lookups.inboundByName.get(call.contactNameKey) || [];
    const nameMatch = findLatestAtOrBefore(nameCandidates, call.bookingTs);
    if (nameMatch && nameMatch >= call.bookingTs - ATTRIBUTION_WINDOW_MS) {
      latestReplyTs = nameMatch;
    }
  }

  if (
    !latestReplyTs ||
    latestReplyTs < call.bookingTs - ATTRIBUTION_WINDOW_MS
  ) {
    if (!call.phoneKey && !call.contactNameKey) {
      return {
        hasPriorReply: false,
        latestReplyAt: null,
        reason: "no_contact_phone",
      };
    }
    return {
      hasPriorReply: false,
      latestReplyAt: null,
      reason: "no_reply_before_booking",
    };
  }

  return {
    hasPriorReply: true,
    latestReplyAt: new Date(latestReplyTs).toISOString(),
    reason: "matched_reply_before_booking",
  };
};

export const getBookedCallsSummary = async (
  params: { from: Date; to: Date; channelId?: string; timeZone?: string },
  _logger?: Pick<Logger, "debug" | "info" | "warn" | "error">,
): Promise<BookedCallsSummary> => {
  const fromIso = params.from.toISOString();
  const toIso = params.to.toISOString();
  const timeZone = (params.timeZone || "").trim() || DEFAULT_BUSINESS_TIMEZONE;

  const calls = await getBookedCallAttributionSources({
    from: params.from,
    to: params.to,
    channelId: params.channelId,
  });

  const trendMap = new Map<string, BookedCallsTrendPoint>();

  const bump = (day: string, bucket: "jack" | "brandon" | "selfBooked") => {
    const point = trendMap.get(day) || {
      day,
      booked: 0,
      jack: 0,
      brandon: 0,
      selfBooked: 0,
    };
    point.booked += 1;
    point[bucket] += 1;
    trendMap.set(day, point);
  };

  for (const c of calls) {
    const day = dayKeyInTimeZone(c.eventTs, timeZone);
    if (!day) continue;

    bump(day, c.bucket);
  }

  const trendByDay = [...trendMap.values()].sort((a, b) =>
    a.day.localeCompare(b.day),
  );
  const totals = trendByDay.reduce(
    (acc, d) => {
      acc.booked += d.booked;
      acc.jack += d.jack;
      acc.brandon += d.brandon;
      acc.selfBooked += d.selfBooked;
      return acc;
    },
    { booked: 0, jack: 0, brandon: 0, selfBooked: 0 },
  );

  return {
    timeRange: { from: fromIso, to: toIso },
    totals,
    trendByDay,
  };
};

export const getBookedCallAttributionSources = async (params: {
  from: Date;
  to: Date;
  channelId?: string;
  slackMessageTs?: string;
}): Promise<BookedCallAttributionSource[]> => {
  const prisma = getPrismaClient();
  const calls = await listBookedCallsInRange({
    from: params.from,
    to: params.to,
    channelId: params.channelId,
    slackMessageTs: params.slackMessageTs,
  });
  const attributionRows =
    calls.length === 0
      ? []
      : await prisma.booked_call_attribution.findMany({
          where: { booked_call_id: { in: calls.map((call) => call.id) } },
          select: {
            booked_call_id: true,
            mapping_method: true,
            match_confidence: true,
            attribution_status: true,
            attribution_confidence_band: true,
            fallback_used: true,
            needs_review: true,
            review_reason: true,
            attribution_path: true,
            resolved_sequence_label: true,
          },
        });
  const attributionByBookedCallId = new Map(
    attributionRows.map((row) => [row.booked_call_id, row]),
  );
  const jackId = process.env.ALOWARE_WATCHER_JACK_USER_ID;
  const brandonId = process.env.ALOWARE_WATCHER_BRANDON_USER_ID;

  const looksLikeBookedCall = (text: string | null): boolean => {
    const t = (text || "").toLowerCase();
    if (!t) return false;
    return (
      t.includes("call booked") ||
      t.includes("booked") ||
      t.includes("appointment") ||
      t.includes("scheduled")
    );
  };

  const looksLikeManualOneOff = (text: string | null): boolean => {
    const t = (text || "").toLowerCase();
    if (!t) return false;
    return t.includes("automation") || t.includes("set");
  };

  const normalized: BookedCallAttributionSource[] = [];

  for (const c of calls) {
    const reactions = c.reactions || [];
    const isJack = hasReaction(reactions, "jack", jackId);
    const isBrandon = hasReaction(reactions, "me", brandonId);
    const hasAttribution = isJack || isBrandon;

    const fallback = fallbackFromRaw(c.raw);
    const firstConversion = parseFallbackField(fallback, "First Conversion");
    const rep =
      parseFallbackField(fallback, "Rep") ||
      parseFallbackField(fallback, "Contact owner");
    const line = parseFallbackField(fallback, "Line");
    const contactName = parseContactNameFromFallback(fallback);
    const contactPhone = parseContactPhoneFromFallback(fallback);
    // parseFallbackField strips <mailto:email|email> → plain email address
    const contactEmail =
      parseFallbackField(fallback, "Email")?.toLowerCase().trim() || null;
    const hasStructuredBookingFields = Boolean(
      firstConversion || contactEmail || contactName,
    );

    const isValid = hasAttribution
      ? looksLikeBookedCall(c.text) ||
        looksLikeManualOneOff(c.text) ||
        hasStructuredBookingFields
      : looksLikeBookedCall(c.text) || hasStructuredBookingFields;
    if (!isValid) continue;

    if (!hasAttribution) {
      const eventMs = new Date(c.event_ts).getTime();
      if (Number.isFinite(eventMs)) {
        const ageSeconds = Math.max(0, (Date.now() - eventMs) / 1000);
        if (ageSeconds < BOOKED_CALL_ATTRIBUTION_GRACE_SECONDS) {
          // Grace period: wait for setter reaction before defaulting this to self-booked.
          continue;
        }
      }
    }

    const bucket: BookedCallAttributionBucket = isJack
      ? "jack"
      : isBrandon
        ? "brandon"
        : "selfBooked";
    const attribution = attributionByBookedCallId.get(c.id);

    normalized.push({
      bookedCallId: c.id,
      eventTs: c.event_ts.toISOString(),
      bucket,
      firstConversion,
      rep,
      line,
      contactName,
      contactPhone,
      contactEmail,
      slackChannelId: c.slack_channel_id,
      slackMessageTs: c.slack_message_ts,
      text: c.text,
      raw: c.raw, // Add raw field to pass Slack message attachments
      mappingMethod: attribution?.mapping_method ?? null,
      matchConfidence:
        attribution?.match_confidence != null
          ? Number(attribution.match_confidence)
          : null,
      attributionStatus: attribution?.attribution_status ?? null,
      attributionConfidenceBand:
        attribution?.attribution_confidence_band ?? null,
      fallbackUsed: attribution?.fallback_used ?? null,
      needsReview: attribution?.needs_review ?? null,
      reviewReason: attribution?.review_reason ?? null,
      attributionPath: attribution?.attribution_path ?? null,
      resolvedSequenceLabel: attribution?.resolved_sequence_label ?? null,
    });
  }

  return normalized;
};

export type BookedCallSmsSequenceLookup = {
  sequenceLabel: string;
  latestOutboundAt: string;
  conversationId: string | null;
};

type SequenceLookupEvidence =
  | "conversation_id"
  | "profile_email"
  | "phone"
  | "profile_name";

type SequenceLookupCandidate = {
  sequenceLabel: string;
  latestOutboundTs: number;
  conversationId: string | null;
  evidence: Set<SequenceLookupEvidence>;
};

type ResolvedSequenceLookupCandidate = {
  sequenceLabel: string;
  latestOutboundTs: number;
  conversationId: string | null;
};

const SMS_SEQUENCE_LOOKBACK_DAYS = 30;

const SEQUENCE_LOOKUP_EVIDENCE_PRIORITY: Record<
  SequenceLookupEvidence,
  number
> = {
  conversation_id: 4,
  profile_email: 3,
  phone: 2,
  profile_name: 1,
};

const chooseBestSequenceEvidence = (
  evidence: Set<SequenceLookupEvidence>,
): SequenceLookupEvidence | null => {
  let best: SequenceLookupEvidence | null = null;
  let bestPriority = -1;
  for (const item of evidence) {
    const priority = SEQUENCE_LOOKUP_EVIDENCE_PRIORITY[item];
    if (priority > bestPriority) {
      best = item;
      bestPriority = priority;
    }
  }
  return best;
};

const getOrCreateSequenceCandidate = (
  candidates: Map<string, SequenceLookupCandidate>,
  candidate: {
    sequenceLabel: string;
    latestOutboundTs: number;
    conversationId: string | null;
  },
): SequenceLookupCandidate => {
  const key = `${candidate.sequenceLabel}::${candidate.conversationId || ""}::${candidate.latestOutboundTs}`;
  const existing = candidates.get(key);
  if (existing) return existing;

  const created: SequenceLookupCandidate = {
    sequenceLabel: candidate.sequenceLabel,
    latestOutboundTs: candidate.latestOutboundTs,
    conversationId: candidate.conversationId,
    evidence: new Set(),
  };
  candidates.set(key, created);
  return created;
};

export const resolveBestSequenceLookupCandidate = (
  bookingTs: number,
  candidates: SequenceLookupCandidate[],
): ResolvedSequenceLookupCandidate | null => {
  if (!Number.isFinite(bookingTs) || candidates.length === 0) return null;

  let best: {
    sequenceLabel: string;
    latestOutboundTs: number;
    conversationId: string | null;
    score: number;
  } | null = null;

  for (const candidate of candidates) {
    const evidence = chooseBestSequenceEvidence(candidate.evidence);
    if (!evidence) continue;
    if (!Number.isFinite(candidate.latestOutboundTs)) continue;
    if (candidate.latestOutboundTs > bookingTs) continue;
    if (
      bookingTs - candidate.latestOutboundTs >
      SMS_SEQUENCE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000
    )
      continue;

    const ageMs = bookingTs - candidate.latestOutboundTs;
    const recencyScore = Math.max(0, 14 - ageMs / (24 * 60 * 60 * 1000));
    const evidenceScore = SEQUENCE_LOOKUP_EVIDENCE_PRIORITY[evidence] * 100;
    const corroborationBonus = Math.max(0, candidate.evidence.size - 1) * 2;
    const score = evidenceScore + recencyScore + corroborationBonus;

    if (
      !best ||
      score > best.score ||
      (score === best.score &&
        candidate.latestOutboundTs > best.latestOutboundTs) ||
      (score === best.score &&
        candidate.latestOutboundTs === best.latestOutboundTs &&
        candidate.sequenceLabel.localeCompare(best.sequenceLabel) < 0)
    ) {
      best = {
        sequenceLabel: candidate.sequenceLabel,
        latestOutboundTs: candidate.latestOutboundTs,
        conversationId: candidate.conversationId,
        score,
      };
    }
  }

  return best
    ? {
        sequenceLabel: best.sequenceLabel,
        latestOutboundTs: best.latestOutboundTs,
        conversationId: best.conversationId,
      }
    : null;
};

/**
 * For each BookedCallAttributionSource that has a contactPhone, queries sms_events
 * for the most recent outbound sequence sent to that phone within SMS_SEQUENCE_LOOKBACK_DAYS
 * before the booking timestamp.
 *
 * Returns Map<bookedCallId, BookedCallSmsSequenceLookup>.
 * Calls with no contactPhone or no matching outbound events are omitted from the map.
 */
export const getBookedCallSequenceFromSmsEvents = async (
  calls: BookedCallAttributionSource[],
  logger?: Pick<Logger, "debug" | "info" | "warn" | "error">,
  replyLinks: Map<string, BookedCallSmsReplyLink> = new Map(),
): Promise<Map<string, BookedCallSmsSequenceLookup>> => {
  const results = new Map<string, BookedCallSmsSequenceLookup>();
  if (calls.length === 0) return results;

  const prisma = getPrismaClient();

  type CallEntry = {
    bookedCallId: string;
    bookingTs: number;
    phoneKey: string | null;
    emailKey: string | null;
    nameKey: string | null;
  };

  // Build phone key → entries (primary signal — direct phone match)
  const phoneKeyToEntries = new Map<string, CallEntry[]>();
  // Build email key → entries (secondary — email → inbox_contact_profiles → phone → sms_events)
  const emailKeyToEntries = new Map<string, CallEntry[]>();
  // Build contact name key → entries (last resort — name match, higher false-positive risk)
  const nameKeyToEntries = new Map<string, CallEntry[]>();

  for (const call of calls) {
    const bookingTs = new Date(call.eventTs).getTime();
    if (!Number.isFinite(bookingTs)) continue;

    const sourceKey = bookedCallSourceKey(call);
    const replyLink = replyLinks.get(sourceKey);
    const replyTs = replyLink?.latestReplyAt
      ? new Date(replyLink.latestReplyAt).getTime()
      : Number.NaN;
    const targetTs =
      replyLink?.hasPriorReply && Number.isFinite(replyTs)
        ? replyTs
        : bookingTs;

    const phoneKey = normalizePhoneKey(call.contactPhone);
    const emailKey = normalizeEmailKey(call.contactEmail);
    const nameKey = normalizeContactNameKey(call.contactName);
    const entry = {
      bookedCallId: call.bookedCallId,
      bookingTs: targetTs,
      phoneKey,
      emailKey,
      nameKey,
    };

    // Email is primary — always add to email map when available (email → profile → phone is most accurate).
    if (emailKey) {
      const list = emailKeyToEntries.get(emailKey) || [];
      list.push(entry);
      emailKeyToEntries.set(emailKey, list);
    }

    // Phone is always added as a fallback (used when email lookup yields no result).
    if (phoneKey) {
      const list = phoneKeyToEntries.get(phoneKey) || [];
      list.push(entry);
      phoneKeyToEntries.set(phoneKey, list);
    }

    // Name lookup is a useful fallback whenever phone is absent, even if email exists.
    // (email -> profile lookup is incomplete in production data)
    if (!phoneKey) {
      if (nameKey) {
        const list = nameKeyToEntries.get(nameKey) || [];
        list.push(entry);
        nameKeyToEntries.set(nameKey, list);
      }
    }
  }

  if (
    phoneKeyToEntries.size === 0 &&
    emailKeyToEntries.size === 0 &&
    nameKeyToEntries.size === 0
  )
    return results;

  // Compute overall time range across all entries
  const allEntries = [
    ...[...phoneKeyToEntries.values()].flat(),
    ...[...emailKeyToEntries.values()].flat(),
    ...[...nameKeyToEntries.values()].flat(),
  ];
  const allBookingTs = allEntries.map((e) => e.bookingTs);
  const minBookingTs = Math.min(...allBookingTs);
  const maxBookingTs = Math.max(...allBookingTs);
  const lookbackMs = SMS_SEQUENCE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const fromIso = new Date(minBookingTs - lookbackMs).toISOString();
  const toIso = new Date(maxBookingTs).toISOString();

  try {
    const sequenceCandidatesByBookedCallId = new Map<
      string,
      Map<string, SequenceLookupCandidate>
    >();
    const addCandidate = (
      bookedCallId: string,
      candidate: {
        sequenceLabel: string;
        latestOutboundTs: number;
        conversationId: string | null;
      },
      evidence: SequenceLookupEvidence,
    ) => {
      const map =
        sequenceCandidatesByBookedCallId.get(bookedCallId) ||
        new Map<string, SequenceLookupCandidate>();
      const resolved = getOrCreateSequenceCandidate(map, candidate);
      resolved.evidence.add(evidence);
      sequenceCandidatesByBookedCallId.set(bookedCallId, map);
    };

    const emailKeys = [...emailKeyToEntries.keys()];
    const phoneKeys = [...phoneKeyToEntries.keys()];
    const nameKeys = [...nameKeyToEntries.keys()];

    const profileRows =
      emailKeys.length === 0 && phoneKeys.length === 0 && nameKeys.length === 0
        ? []
        : await prisma.$queryRawUnsafe<
            {
              email_key: string | null;
              phone_key: string | null;
              name_key: string | null;
              conversation_id: string | null;
            }[]
          >(
            `
            SELECT
              LOWER(TRIM(COALESCE(email, ''))) AS email_key,
              RIGHT(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 10) AS phone_key,
              LOWER(regexp_replace(TRIM(COALESCE(name, '')), '\\s+', ' ', 'g')) AS name_key,
              conversation_id
            FROM inbox_contact_profiles
            WHERE
              (
                (array_length($1::text[], 1) IS NOT NULL AND LOWER(TRIM(COALESCE(email, ''))) = ANY($1::text[]))
                OR (array_length($2::text[], 1) IS NOT NULL AND RIGHT(regexp_replace(COALESCE(phone, ''), '\\D', '', 'g'), 10) = ANY($2::text[]))
                OR (array_length($3::text[], 1) IS NOT NULL AND LOWER(regexp_replace(TRIM(COALESCE(name, '')), '\\s+', ' ', 'g')) = ANY($3::text[]))
              )
            `,
            emailKeys,
            phoneKeys,
            nameKeys,
          );

    const emailToProfiles = new Map<
      string,
      Array<{ phoneKey: string | null; conversationId: string | null }>
    >();
    const phoneToProfiles = new Map<
      string,
      Array<{ conversationId: string | null }>
    >();
    const nameToProfiles = new Map<
      string,
      Array<{ conversationId: string | null; phoneKey: string | null }>
    >();

    for (const row of profileRows) {
      if (row.email_key) {
        const list = emailToProfiles.get(row.email_key) || [];
        list.push({
          phoneKey: row.phone_key || null,
          conversationId: row.conversation_id || null,
        });
        emailToProfiles.set(row.email_key, list);
      }
      if (row.phone_key) {
        const list = phoneToProfiles.get(row.phone_key) || [];
        list.push({ conversationId: row.conversation_id || null });
        phoneToProfiles.set(row.phone_key, list);
      }
      if (row.name_key) {
        const list = nameToProfiles.get(row.name_key) || [];
        list.push({
          conversationId: row.conversation_id || null,
          phoneKey: row.phone_key || null,
        });
        nameToProfiles.set(row.name_key, list);
      }
    }

    const conversationIds = [
      ...new Set(
        profileRows
          .map((row) => row.conversation_id)
          .filter((value): value is string => Boolean(value)),
      ),
    ];
    const outboundByConversationId = new Map<
      string,
      Array<{
        sequenceLabel: string;
        latestOutboundTs: number;
        conversationId: string | null;
      }>
    >();
    if (conversationIds.length > 0) {
      const rows = await prisma.$queryRawUnsafe<
        { conversation_id: string; sequence: string; event_ts: Date }[]
      >(
        `
        SELECT conversation_id, TRIM(sequence) AS sequence, event_ts
        FROM sms_events
        WHERE direction = 'outbound'
          AND conversation_id = ANY($1::uuid[])
          AND sequence IS NOT NULL AND TRIM(sequence) != ''
          AND event_ts >= $2::timestamptz
          AND event_ts <= $3::timestamptz
        ORDER BY event_ts ASC
        `,
        conversationIds,
        fromIso,
        toIso,
      );
      for (const row of rows) {
        const ts = new Date(row.event_ts).getTime();
        if (!row.conversation_id || !row.sequence || !Number.isFinite(ts))
          continue;
        const list = outboundByConversationId.get(row.conversation_id) || [];
        list.push({
          sequenceLabel: row.sequence,
          latestOutboundTs: ts,
          conversationId: row.conversation_id,
        });
        outboundByConversationId.set(row.conversation_id, list);
      }
    }

    const outboundByPhone = new Map<
      string,
      Array<{
        sequenceLabel: string;
        latestOutboundTs: number;
        conversationId: string | null;
      }>
    >();
    if (phoneKeys.length > 0) {
      const rows = await prisma.$queryRawUnsafe<
        {
          phone_key: string;
          sequence: string;
          event_ts: Date;
          conversation_id: string | null;
        }[]
      >(
        `
        SELECT
          RIGHT(regexp_replace(contact_phone, '\\D', '', 'g'), 10) AS phone_key,
          TRIM(sequence) AS sequence,
          event_ts,
          conversation_id
        FROM sms_events
        WHERE direction = 'outbound'
          AND contact_phone IS NOT NULL
          AND sequence IS NOT NULL AND TRIM(sequence) != ''
          AND RIGHT(regexp_replace(contact_phone, '\\D', '', 'g'), 10) = ANY($1::text[])
          AND event_ts >= $2::timestamptz
          AND event_ts <= $3::timestamptz
        ORDER BY event_ts ASC
        `,
        phoneKeys,
        fromIso,
        toIso,
      );
      for (const row of rows) {
        const ts = new Date(row.event_ts).getTime();
        if (!row.phone_key || !row.sequence || !Number.isFinite(ts)) continue;
        const list = outboundByPhone.get(row.phone_key) || [];
        list.push({
          sequenceLabel: row.sequence,
          latestOutboundTs: ts,
          conversationId: row.conversation_id,
        });
        outboundByPhone.set(row.phone_key, list);
      }
    }

    const outboundByName = new Map<
      string,
      Array<{
        sequenceLabel: string;
        latestOutboundTs: number;
        conversationId: string | null;
      }>
    >();
    if (nameKeys.length > 0) {
      const rows = await prisma.$queryRawUnsafe<
        {
          contact_name_key: string;
          sequence: string;
          event_ts: Date;
          conversation_id: string | null;
        }[]
      >(
        `
        SELECT
          LOWER(regexp_replace(TRIM(contact_name), '\\s+', ' ', 'g')) AS contact_name_key,
          TRIM(sequence) AS sequence,
          event_ts,
          conversation_id
        FROM sms_events
        WHERE direction = 'outbound'
          AND contact_name IS NOT NULL
          AND sequence IS NOT NULL AND TRIM(sequence) != ''
          AND LOWER(regexp_replace(TRIM(contact_name), '\\s+', ' ', 'g')) = ANY($1::text[])
          AND event_ts >= $2::timestamptz
          AND event_ts <= $3::timestamptz
        ORDER BY event_ts ASC
        `,
        nameKeys,
        fromIso,
        toIso,
      );
      for (const row of rows) {
        const ts = new Date(row.event_ts).getTime();
        if (!row.contact_name_key || !row.sequence || !Number.isFinite(ts))
          continue;
        const list = outboundByName.get(row.contact_name_key) || [];
        list.push({
          sequenceLabel: row.sequence,
          latestOutboundTs: ts,
          conversationId: row.conversation_id,
        });
        outboundByName.set(row.contact_name_key, list);
      }
    }

    for (const entry of allEntries) {
      if (entry.emailKey) {
        for (const profile of emailToProfiles.get(entry.emailKey) || []) {
          if (profile.conversationId) {
            for (const outbound of outboundByConversationId.get(
              profile.conversationId,
            ) || []) {
              addCandidate(entry.bookedCallId, outbound, "conversation_id");
            }
          }
          if (profile.phoneKey) {
            for (const outbound of outboundByPhone.get(profile.phoneKey) ||
              []) {
              addCandidate(entry.bookedCallId, outbound, "profile_email");
            }
          }
        }
      }

      if (entry.phoneKey) {
        for (const outbound of outboundByPhone.get(entry.phoneKey) || []) {
          addCandidate(entry.bookedCallId, outbound, "phone");
        }
        for (const profile of phoneToProfiles.get(entry.phoneKey) || []) {
          if (!profile.conversationId) continue;
          for (const outbound of outboundByConversationId.get(
            profile.conversationId,
          ) || []) {
            addCandidate(entry.bookedCallId, outbound, "conversation_id");
          }
        }
      }

      if (entry.nameKey) {
        for (const outbound of outboundByName.get(entry.nameKey) || []) {
          addCandidate(entry.bookedCallId, outbound, "profile_name");
        }
        for (const profile of nameToProfiles.get(entry.nameKey) || []) {
          if (profile.conversationId) {
            for (const outbound of outboundByConversationId.get(
              profile.conversationId,
            ) || []) {
              addCandidate(entry.bookedCallId, outbound, "conversation_id");
            }
          }
          if (profile.phoneKey) {
            for (const outbound of outboundByPhone.get(profile.phoneKey) ||
              []) {
              addCandidate(entry.bookedCallId, outbound, "profile_name");
            }
          }
        }
      }
    }

    for (const [bookedCallId, candidates] of sequenceCandidatesByBookedCallId) {
      const callEntry = allEntries.find(
        (entry) => entry.bookedCallId === bookedCallId,
      );
      if (!callEntry) continue;
      const best = resolveBestSequenceLookupCandidate(callEntry.bookingTs, [
        ...candidates.values(),
      ]);
      if (!best) continue;
      results.set(bookedCallId, {
        sequenceLabel: best.sequenceLabel,
        latestOutboundAt: new Date(best.latestOutboundTs).toISOString(),
        conversationId: best.conversationId,
      });
    }
  } catch (error) {
    logger?.error?.(
      "Failed to compute booked-call sequence from SMS events",
      error,
    );
    throw error;
  }

  return results;
};

export const getBookedCallSmsReplyLinks = async (
  calls: BookedCallAttributionSource[],
  logger?: Pick<Logger, "debug" | "info" | "warn" | "error">,
): Promise<Map<string, BookedCallSmsReplyLink>> => {
  const results = new Map<string, BookedCallSmsReplyLink>();
  if (calls.length === 0) return results;

  const prisma = getPrismaClient();

  const normalizedCalls = calls.map((call) => {
    const key = bookedCallSourceKey(call);
    const phoneKey = normalizePhoneKey(call.contactPhone);
    const contactNameKey = normalizeContactNameKey(call.contactName);
    const bookingTs = new Date(call.eventTs).getTime();
    return {
      key,
      phoneKey,
      contactNameKey,
      bookingTs,
    };
  });

  const validTimestamps = normalizedCalls
    .map((row) => row.bookingTs)
    .filter((value) => Number.isFinite(value));
  if (validTimestamps.length === 0) {
    for (const row of normalizedCalls) {
      results.set(row.key, {
        hasPriorReply: false,
        latestReplyAt: null,
        reason: "invalid_booking_timestamp",
      });
    }
    return results;
  }

  const minBookingTs = Math.min(...validTimestamps);
  const maxBookingTs = Math.max(...validTimestamps);
  const fromIso = new Date(minBookingTs - ATTRIBUTION_WINDOW_MS).toISOString();
  const toIso = new Date(maxBookingTs).toISOString();

  const phoneKeys = [
    ...new Set(
      normalizedCalls
        .map((row) => row.phoneKey)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const contactNameKeys = [
    ...new Set(
      normalizedCalls
        .map((row) => row.contactNameKey)
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const inboundByPhone = new Map<string, number[]>();
  const inboundByName = new Map<string, number[]>();

  try {
    if (phoneKeys.length > 0) {
      const rows = await prisma.$queryRawUnsafe<
        { phone_key: string; event_ts: Date }[]
      >(
        `
        SELECT
          RIGHT(regexp_replace(contact_phone, '\\D', '', 'g'), 10) AS phone_key,
          event_ts
        FROM sms_events
        WHERE direction = 'inbound'
          AND contact_phone IS NOT NULL
          AND RIGHT(regexp_replace(contact_phone, '\\D', '', 'g'), 10) = ANY($1::text[])
          AND event_ts >= $2::timestamptz
          AND event_ts <= $3::timestamptz
        ORDER BY event_ts ASC
        `,
        phoneKeys,
        fromIso,
        toIso,
      );

      for (const row of rows) {
        const key = row.phone_key;
        const ts = new Date(row.event_ts).getTime();
        if (!key || !Number.isFinite(ts)) continue;
        const list = inboundByPhone.get(key) || [];
        list.push(ts);
        inboundByPhone.set(key, list);
      }
    }

    if (contactNameKeys.length > 0) {
      const rows = await prisma.$queryRawUnsafe<
        { contact_name_key: string; event_ts: Date }[]
      >(
        `
        SELECT
          LOWER(regexp_replace(TRIM(contact_name), '\\s+', ' ', 'g')) AS contact_name_key,
          event_ts
        FROM sms_events
        WHERE direction = 'inbound'
          AND contact_name IS NOT NULL
          AND LOWER(regexp_replace(TRIM(contact_name), '\\s+', ' ', 'g')) = ANY($1::text[])
          AND event_ts >= $2::timestamptz
          AND event_ts <= $3::timestamptz
        ORDER BY event_ts ASC
        `,
        contactNameKeys,
        fromIso,
        toIso,
      );

      for (const row of rows) {
        const key = row.contact_name_key;
        const ts = new Date(row.event_ts).getTime();
        if (!key || !Number.isFinite(ts)) continue;
        const list = inboundByName.get(key) || [];
        list.push(ts);
        inboundByName.set(key, list);
      }
    }
  } catch (error) {
    logger?.error?.("Failed to compute booked-call SMS reply links", error);
    throw error;
  }

  for (const call of normalizedCalls) {
    results.set(
      call.key,
      resolveBookedCallSmsReplyLink(call, { inboundByPhone, inboundByName }),
    );
  }

  return results;
};
