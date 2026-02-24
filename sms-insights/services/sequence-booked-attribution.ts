import type {
  BookedCallAttributionBucket,
  BookedCallAttributionSource,
  BookedCallSmsReplyLink,
  BookedCallSmsSequenceLookup,
} from './booked-calls.js';
import { bookedCallSourceKey } from './booked-calls.js';
import type { TopSequenceRow } from './sales-metrics.js';

export const MANUAL_SEQUENCE_LABEL = 'No sequence (manual/direct)';

export type SequenceBookedAuditRow = {
  bookedCallId: string;
  eventTs: string;
  bucket: BookedCallAttributionBucket;
  firstConversion: string | null;
  rep: string | null;
  line: string | null;
  contactName: string | null;
  contactPhone: string | null;
  slackChannelId: string;
  slackMessageTs: string;
  text: string | null;
  strictSmsReplyLinked: boolean;
  latestReplyAt: string | null;
  strictSmsReplyReason: BookedCallSmsReplyLink['reason'];
  /** How the sequence label was resolved for this booking. */
  attributionSource: 'sms_phone_match' | 'fuzzy_text_match';
  /** Raw sequence label from sms_events (present when attributionSource = 'sms_phone_match'). */
  smsSequenceLabel: string | null;
  /** Timestamp of the most recent outbound SMS to this contact before the booking. */
  smsLatestOutboundAt: string | null;
  /**
   * When the booking is attributed to Sequence A via firstConversion (fuzzy match) but the
   * contact was actively enrolled in a different Sequence B at booking time (from sms_events),
   * this field holds Sequence B's label.
   *
   * Interpretation: "Lead magnet = A, but they were converted while in B."
   * Example: firstConversion = "Hiring Guide" → attributed to "Hiring Guide - 2026 v1.2",
   *          but sms_events shows they were in "Call Pitched NO Reply" when they booked.
   */
  convertedViaSequence: string | null;
};

export type SequenceBookedBreakdown = {
  booked: number;
  jack: number;
  brandon: number;
  selfBooked: number;
  bookedAfterSmsReply: number;
  auditRows: SequenceBookedAuditRow[];
};

export type SequenceBookedAttributionResult = {
  byLabel: Map<string, SequenceBookedBreakdown>;
  totals: {
    totalCalls: number;
    matchedCalls: number;
    unattributedCalls: number;
    manualCalls: number;
    booked: number;
    jack: number;
    brandon: number;
    selfBooked: number;
    bookedAfterSmsReply: number;
    /** Calls attributed via exact phone-number match from sms_events. */
    smsPhoneMatchedCalls: number;
    /** Calls attributed via fuzzy firstConversion text match (fallback). */
    fuzzyTextMatchedCalls: number;
  };
};

type CandidateSequence = {
  label: string;
  normalized: string;
  tokens: Set<string>;
  messagesSent: number;
};

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'at',
  'by',
  'download',
  'for',
  'free',
  'from',
  'in',
  'join',
  'of',
  'on',
  'or',
  'physical',
  'practice',
  'pt',
  'the',
  'therapy',
  'to',
  'tool',
  'with',
  'your',
]);

const MEETING_LINK_PATTERN = /\b(meetings?\s+link|discovery[-\s]?call|open[-\s]?schedule|\/discovery-call)\b/i;

const normalizeText = (value: string): string => {
  return value
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const tokenize = (value: string): Set<string> => {
  const tokens = normalizeText(value)
    .split(' ')
    .filter((token) => token.length >= 2)
    .filter((token) => !STOP_WORDS.has(token));
  return new Set(tokens);
};

const overlapScore = (a: Set<string>, b: Set<string>): number => {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const token of a) {
    if (b.has(token)) shared += 1;
  }
  return (2 * shared) / (a.size + b.size);
};

const normalizeFirstConversionCandidates = (firstConversion: string): string[] => {
  const value = firstConversion.trim();
  if (!value) return [];

  const variants = new Set<string>([value]);
  if (value.includes(':')) {
    const parts = value
      .split(':')
      .map((part) => part.trim())
      .filter(Boolean);
    if (parts.length > 1) variants.add(parts[parts.length - 1] || value);
  }
  if (value.includes('|')) {
    const parts = value
      .split('|')
      .map((part) => part.trim())
      .filter(Boolean);
    for (const part of parts) variants.add(part);
  }

  return [...variants].map((item) => item.trim()).filter(Boolean);
};

const bump = (
  target: { booked: number; jack: number; brandon: number; selfBooked: number },
  bucket: BookedCallAttributionBucket,
): void => {
  target.booked += 1;
  if (bucket === 'jack') target.jack += 1;
  else if (bucket === 'brandon') target.brandon += 1;
  else target.selfBooked += 1;
};

const emptyBreakdown = (): SequenceBookedBreakdown => ({
  booked: 0,
  jack: 0,
  brandon: 0,
  selfBooked: 0,
  bookedAfterSmsReply: 0,
  auditRows: [],
});

const resolveSequenceLabel = (
  firstConversion: string | null,
  candidates: CandidateSequence[],
): { label: string | null; manual: boolean } => {
  const raw = (firstConversion || '').trim();
  if (!raw) return { label: null, manual: false };

  if (MEETING_LINK_PATTERN.test(raw)) {
    return { label: MANUAL_SEQUENCE_LABEL, manual: true };
  }

  let bestLabel: string | null = null;
  let bestScore = 0;
  let bestMessagesSent = -1;

  for (const candidateSource of normalizeFirstConversionCandidates(raw)) {
    const normalizedSource = normalizeText(candidateSource);
    const sourceTokens = tokenize(candidateSource);
    if (!normalizedSource) continue;

    for (const candidate of candidates) {
      let score = overlapScore(sourceTokens, candidate.tokens);

      if (normalizedSource.includes(candidate.normalized) || candidate.normalized.includes(normalizedSource)) {
        score = Math.max(score, 0.9);
      }

      if (score > bestScore || (score === bestScore && candidate.messagesSent > bestMessagesSent)) {
        bestScore = score;
        bestLabel = candidate.label;
        bestMessagesSent = candidate.messagesSent;
      }
    }
  }

  if (bestLabel && bestScore >= 0.34) {
    return { label: bestLabel, manual: bestLabel === MANUAL_SEQUENCE_LABEL };
  }

  return { label: null, manual: false };
};

export const attributeSlackBookedCallsToSequences = (
  sequenceRows: TopSequenceRow[],
  calls: BookedCallAttributionSource[],
  smsReplyLinks: Map<string, BookedCallSmsReplyLink> = new Map(),
  smsSequenceLookup: Map<string, BookedCallSmsSequenceLookup> = new Map(),
): SequenceBookedAttributionResult => {
  const candidates: CandidateSequence[] = sequenceRows.map((row) => ({
    label: row.label,
    normalized: normalizeText(row.label),
    tokens: tokenize(row.label),
    messagesSent: row.messagesSent,
  }));

  if (!candidates.some((candidate) => candidate.label === MANUAL_SEQUENCE_LABEL)) {
    candidates.push({
      label: MANUAL_SEQUENCE_LABEL,
      normalized: normalizeText(MANUAL_SEQUENCE_LABEL),
      tokens: tokenize(MANUAL_SEQUENCE_LABEL),
      messagesSent: 0,
    });
  }

  const byLabel = new Map<string, SequenceBookedBreakdown>();
  const totals = {
    totalCalls: 0,
    matchedCalls: 0,
    unattributedCalls: 0,
    manualCalls: 0,
    booked: 0,
    jack: 0,
    brandon: 0,
    selfBooked: 0,
    bookedAfterSmsReply: 0,
    smsPhoneMatchedCalls: 0,
    fuzzyTextMatchedCalls: 0,
  };

  for (const call of calls) {
    totals.totalCalls += 1;
    bump(totals, call.bucket);

    const sourceKey = bookedCallSourceKey(call);
    const smsLink = smsReplyLinks.get(sourceKey);
    const strictLinked = smsLink?.hasPriorReply === true;

    // Primary: exact phone-number match from sms_events outbound events.
    // Fallback: fuzzy firstConversion text match against known sequence candidates.
    const smsLookup = smsSequenceLookup.get(call.bookedCallId);
    let resolvedLabel: string | null = null;
    let isManual = false;
    let attributionSource: 'sms_phone_match' | 'fuzzy_text_match' = 'fuzzy_text_match';

    if (smsLookup) {
      // The sequence label from sms_events is the ground truth — use it directly.
      resolvedLabel = smsLookup.sequenceLabel;
      isManual = resolvedLabel === MANUAL_SEQUENCE_LABEL;
      attributionSource = 'sms_phone_match';
    } else {
      // No phone match — fall back to fuzzy firstConversion text matching.
      const resolved = resolveSequenceLabel(call.firstConversion, candidates);
      resolvedLabel = resolved.label;
      isManual = resolved.manual;
      attributionSource = 'fuzzy_text_match';
    }

    if (!resolvedLabel) {
      totals.unattributedCalls += 1;
      continue;
    }

    const row = byLabel.get(resolvedLabel) || emptyBreakdown();
    bump(row, call.bucket);
    if (strictLinked) row.bookedAfterSmsReply += 1;
    row.auditRows.push({
      bookedCallId: call.bookedCallId,
      eventTs: call.eventTs,
      bucket: call.bucket,
      firstConversion: call.firstConversion,
      rep: call.rep,
      line: call.line,
      contactName: call.contactName,
      contactPhone: call.contactPhone,
      slackChannelId: call.slackChannelId,
      slackMessageTs: call.slackMessageTs,
      text: call.text,
      strictSmsReplyLinked: strictLinked,
      latestReplyAt: smsLink?.latestReplyAt || null,
      strictSmsReplyReason: smsLink?.reason || 'no_reply_before_booking',
      attributionSource,
      smsSequenceLabel: smsLookup?.sequenceLabel ?? null,
      smsLatestOutboundAt: smsLookup?.latestOutboundAt ?? null,
      // Set when firstConversion fuzzy-matched to Sequence A but SMS lookup shows the contact
      // was actively in a different Sequence B at booking time (e.g., a follow-up sequence).
      convertedViaSequence:
        attributionSource === 'fuzzy_text_match' &&
        smsLookup &&
        smsLookup.sequenceLabel !== resolvedLabel
          ? smsLookup.sequenceLabel
          : null,
    });
    byLabel.set(resolvedLabel, row);
    totals.matchedCalls += 1;
    if (isManual) totals.manualCalls += 1;
    if (strictLinked) totals.bookedAfterSmsReply += 1;
    if (attributionSource === 'sms_phone_match') totals.smsPhoneMatchedCalls += 1;
    else totals.fuzzyTextMatchedCalls += 1;
  }

  return { byLabel, totals };
};
