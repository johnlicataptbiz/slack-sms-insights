import type { Logger } from '@slack/bolt';
import type { CoachingInterest, EmploymentStatus, RevenueMixCategory } from './inbox-contact-profiles.js';
import type { ConversationStateRow, InboxMessageRow, UpdateConversationStateInput } from './inbox-store.js';

type QualificationSnapshot = {
  fullOrPartTime: EmploymentStatus;
  niche: string | null;
  revenueMix: RevenueMixCategory;
  coachingInterest: CoachingInterest;
  progressStep: number;
};

export type QualificationInferenceResult = {
  changed: boolean;
  updates: Pick<
    UpdateConversationStateInput,
    'fullOrPartTime' | 'niche' | 'revenueMix' | 'coachingInterest' | 'progressStep'
  >;
  snapshot: QualificationSnapshot;
  inferred: {
    fullOrPartTime: EmploymentStatus | null;
    niche: string | null;
    revenueMix: RevenueMixCategory | null;
    coachingInterest: CoachingInterest | null;
  };
};

const toEpochMs = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const normalizeWhitespace = (value: string): string => value.replace(/\s+/g, ' ').trim();

const normalizeLower = (value: string): string => normalizeWhitespace(value).toLowerCase();

const sortMessagesChronologically = (messages: InboxMessageRow[]): InboxMessageRow[] => {
  return [...messages].sort((a, b) => {
    const byTime = toEpochMs(a.event_ts) - toEpochMs(b.event_ts);
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });
};

const getInboundBodiesNewestFirst = (messages: InboxMessageRow[]): string[] => {
  const ordered = sortMessagesChronologically(messages);
  return ordered
    .filter((message) => message.direction === 'inbound')
    .map((message) => normalizeWhitespace(message.body || ''))
    .filter((body) => body.length > 0)
    .reverse();
};

const PART_TIME_PATTERNS = [
  /\bpart[\s-]?time\b/i,
  /\bside gig\b/i,
  /\bside hustle\b/i,
  /\bstill (?:work|working) (?:in|at)\b/i,
  /\boutside (?:my|the) (?:clinic|job)\b/i,
  /\bnights?\s+and\s+weekends?\b/i,
];

const FULL_TIME_PATTERNS = [
  /\bfull[\s-]?time\b/i,
  /\bmy (?:clinic|practice) is my full time\b/i,
  /\bonly (?:income|job)\b/i,
];

const inferEmploymentStatus = (bodies: string[]): EmploymentStatus | null => {
  for (const body of bodies) {
    if (PART_TIME_PATTERNS.some((pattern) => pattern.test(body))) return 'part_time';
    if (FULL_TIME_PATTERNS.some((pattern) => pattern.test(body)) && !/\bnot full[\s-]?time\b/i.test(body)) {
      return 'full_time';
    }
  }
  return null;
};

const MOSTLY_CASH_PATTERNS = [
  /\bmostly cash\b/i,
  /\ball cash\b/i,
  /\bcash only\b/i,
  /\bprivate pay\b/i,
  /\bself pay\b/i,
  /\bout of pocket\b/i,
  /\bno contracts\b/i,
  /\bdon'?t have (?:any )?contracts?\b/i,
  /\bdo not have (?:any )?contracts?\b/i,
  /\bhave no contracts?\b/i,
  /\bno insurance\b/i,
];

const MOSTLY_INSURANCE_PATTERNS = [
  /\bmostly insurance\b/i,
  /\ball insurance\b/i,
  /\binsurance heavy\b/i,
  /\bin network\b/i,
  /\baccept insurance\b/i,
  /\binsurance contracts?\b/i,
];

const BALANCED_MIX_PATTERNS = [/\bbalanced\b/i, /\bmix(?:ed)?\b/i, /\bboth cash and insurance\b/i, /\b50\s*\/\s*50\b/i];

const inferRevenueMix = (bodies: string[]): RevenueMixCategory | null => {
  for (const body of bodies) {
    const normalized = normalizeLower(body);
    if (BALANCED_MIX_PATTERNS.some((pattern) => pattern.test(normalized))) return 'balanced';
    if (MOSTLY_INSURANCE_PATTERNS.some((pattern) => pattern.test(normalized))) return 'mostly_insurance';
    if (MOSTLY_CASH_PATTERNS.some((pattern) => pattern.test(normalized))) return 'mostly_cash';
  }
  return null;
};

const HIGH_INTEREST_PATTERNS = [
  /\binterested in (?:business )?coaching\b/i,
  /\bopen to (?:business )?coaching\b/i,
  /\b(?:book|schedule)\s+(?:a\s+)?call\b/i,
  /\blet'?s (?:book|schedule)\b/i,
  /\byes\b.{0,24}\b(?:call|coaching|program)\b/i,
];

const MEDIUM_INTEREST_PATTERNS = [
  /\bmaybe\b/i,
  /\bnot sure\b/i,
  /\bcurious\b/i,
  /\bneed to think\b/i,
  /\bnot right now\b/i,
  /\blater\b/i,
];

const LOW_INTEREST_PATTERNS = [
  /\bnot interested\b/i,
  /\bno thanks\b/i,
  /\bunsubscribe\b/i,
  /\bremove me\b/i,
  /\bstop texting\b/i,
  /\bwrong number\b/i,
];

const inferCoachingInterest = (bodies: string[]): CoachingInterest | null => {
  for (const body of bodies) {
    if (LOW_INTEREST_PATTERNS.some((pattern) => pattern.test(body))) return 'low';
    if (HIGH_INTEREST_PATTERNS.some((pattern) => pattern.test(body))) return 'high';
    if (MEDIUM_INTEREST_PATTERNS.some((pattern) => pattern.test(body))) return 'medium';
  }
  return null;
};

const NICHE_PATTERNS = [
  /\b(?:speciali(?:s|z)e(?:d|s|ing)?\s+in|my niche is|niche is|focus(?:ed)?\s+on|work(?:ing)?\s+with|treat(?:ing)?\s+mostly)\s+([^.!?\n]{3,90})/i,
  /\b(?:i(?:\s*am|'m)\s+in)\s+([^.!?\n]{3,90})/i,
];

const cleanNiche = (candidate: string): string | null => {
  const trimmedAtClause = candidate.split(/\b(?:and\s+i\s+(?:am|are|have|do)|but|while|because)\b/i)[0] || candidate;
  const normalized = normalizeWhitespace(trimmedAtClause)
    .replace(/^[,:;\-\s]+/, '')
    .replace(/[,:;\-\s]+$/, '')
    .replace(/^(the|a|an|mostly|primarily)\s+/i, '');

  if (normalized.length < 3) return null;
  if (/^(yes|no|maybe|not sure)$/i.test(normalized)) return null;
  return normalized.slice(0, 90).trim();
};

const inferNiche = (bodies: string[]): string | null => {
  for (const body of bodies) {
    for (const pattern of NICHE_PATTERNS) {
      const match = body.match(pattern);
      const raw = match?.[1];
      if (!raw) continue;
      const cleaned = cleanNiche(raw);
      if (cleaned) return cleaned;
    }
  }
  return null;
};

const resolveQualificationProgressStep = (snapshot: {
  fullOrPartTime: EmploymentStatus;
  niche: string | null;
  revenueMix: RevenueMixCategory;
  coachingInterest: CoachingInterest;
}): number => {
  let score = 0;
  if (snapshot.fullOrPartTime !== 'unknown') score += 1;
  if (snapshot.niche && snapshot.niche.trim().length > 0) score += 1;
  if (snapshot.revenueMix !== 'unknown') score += 1;
  if (snapshot.coachingInterest !== 'unknown') score += 1;
  return score;
};

const isNicheMissing = (value: string | null): boolean => !value || value.trim().length === 0;

export const inferQualificationStateFromMessages = (
  state: ConversationStateRow,
  messages: InboxMessageRow[],
  logger?: Pick<Logger, 'debug'>,
): QualificationInferenceResult => {
  const inboundBodies = getInboundBodiesNewestFirst(messages);
  const inferred = {
    fullOrPartTime: inferEmploymentStatus(inboundBodies),
    niche: inferNiche(inboundBodies),
    revenueMix: inferRevenueMix(inboundBodies),
    coachingInterest: inferCoachingInterest(inboundBodies),
  };

  const snapshot: QualificationSnapshot = {
    fullOrPartTime:
      state.qualification_full_or_part_time === 'unknown' && inferred.fullOrPartTime
        ? inferred.fullOrPartTime
        : state.qualification_full_or_part_time,
    niche: isNicheMissing(state.qualification_niche) && inferred.niche ? inferred.niche : state.qualification_niche,
    revenueMix:
      state.qualification_revenue_mix === 'unknown' && inferred.revenueMix
        ? inferred.revenueMix
        : state.qualification_revenue_mix,
    coachingInterest:
      state.qualification_coaching_interest === 'unknown' && inferred.coachingInterest
        ? inferred.coachingInterest
        : state.qualification_coaching_interest,
    progressStep: 0,
  };
  snapshot.progressStep = resolveQualificationProgressStep(snapshot);

  const updates: QualificationInferenceResult['updates'] = {};
  if (snapshot.fullOrPartTime !== state.qualification_full_or_part_time) {
    updates.fullOrPartTime = snapshot.fullOrPartTime;
  }
  if ((snapshot.niche || null) !== (state.qualification_niche || null)) {
    updates.niche = snapshot.niche;
  }
  if (snapshot.revenueMix !== state.qualification_revenue_mix) {
    updates.revenueMix = snapshot.revenueMix;
  }
  if (snapshot.coachingInterest !== state.qualification_coaching_interest) {
    updates.coachingInterest = snapshot.coachingInterest;
  }
  if (snapshot.progressStep !== state.qualification_progress_step) {
    updates.progressStep = snapshot.progressStep;
  }

  const changed = Object.keys(updates).length > 0;
  if (changed) {
    logger?.debug?.('Qualification inference produced updates', {
      inferred,
      updates,
    });
  }

  return {
    changed,
    updates,
    snapshot,
    inferred,
  };
};
