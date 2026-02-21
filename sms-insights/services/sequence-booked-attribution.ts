import type { BookedCallAttributionBucket, BookedCallAttributionSource } from './booked-calls.js';
import type { TopSequenceRow } from './sales-metrics.js';

export const MANUAL_SEQUENCE_LABEL = 'No sequence (manual/direct)';

export type SequenceBookedBreakdown = {
  booked: number;
  jack: number;
  brandon: number;
  selfBooked: number;
};

export type SequenceBookedAttributionResult = {
  byLabel: Map<string, SequenceBookedBreakdown>;
  totals: {
    totalCalls: number;
    matchedCalls: number;
    unattributedCalls: number;
    manualCalls: number;
  } & SequenceBookedBreakdown;
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

const bump = (target: SequenceBookedBreakdown, bucket: BookedCallAttributionBucket): void => {
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
    ...emptyBreakdown(),
  };

  for (const call of calls) {
    totals.totalCalls += 1;
    bump(totals, call.bucket);

    const resolved = resolveSequenceLabel(call.firstConversion, candidates);
    if (!resolved.label) {
      totals.unattributedCalls += 1;
      continue;
    }

    const row = byLabel.get(resolved.label) || emptyBreakdown();
    bump(row, call.bucket);
    byLabel.set(resolved.label, row);
    totals.matchedCalls += 1;
    if (resolved.manual) totals.manualCalls += 1;
  }

  return { byLabel, totals };
};
