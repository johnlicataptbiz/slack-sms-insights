import type { Logger } from '@slack/bolt';
import type {
  CoachingInterest,
  DeliveryModel,
  EmploymentStatus,
  RevenueMixCategory,
} from './inbox-contact-profiles.js';
import type { ConversationStateRow, InboxMessageRow, UpdateConversationStateInput } from './inbox-store.js';

type QualificationSnapshot = {
  fullOrPartTime: EmploymentStatus;
  niche: string | null;
  revenueMix: RevenueMixCategory;
  coachingInterest: CoachingInterest;
  deliveryModel: DeliveryModel;
  progressStep: number;
  objectionTags: string[];
};

export type QualificationInferenceResult = {
  changed: boolean;
  updates: Pick<
    UpdateConversationStateInput,
    'fullOrPartTime' | 'niche' | 'revenueMix' | 'coachingInterest' | 'deliveryModel' | 'progressStep' | 'objectionTags'
  >;
  snapshot: QualificationSnapshot;
  inferred: {
    fullOrPartTime: EmploymentStatus | null;
    niche: string | null;
    revenueMix: RevenueMixCategory | null;
    coachingInterest: CoachingInterest | null;
    deliveryModel: DeliveryModel | null;
    objectionTags: string[];
  };
};

type InferenceOptions = {
  allowOverwriteKnown?: boolean;
};

const toEpochMs = (value: string | Date): number => {
  if (value instanceof Date) return value.getTime();
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
  /\bstill (?:work|working) (?:in|at|for)\b/i,
  /\boutside (?:my|the) (?:clinic|job|practice)\b/i,
  /\bnights?\s+and\s+weekends?\b/i,
  /\bstill (?:employed|at my job|at the hospital|at the clinic)\b/i,
  /\bwhile (?:i still|still) (?:work|working)\b/i,
  /\bbuilding (?:on the side|while)\b/i,
  /\bstill have my (?:job|position)\b/i,
  /\bmoonlight(?:ing)?\b/i,
  /\bafter hours\b/i,
  /\bon the side\b/i,
  /\bplanning to (?:leave|quit)\b/i,
  /\bthinking about leaving\b/i,
  /\bwant to (?:leave|quit) my job\b/i,
  /\bsupplementing\b/i,
];

const FULL_TIME_PATTERNS = [
  /\bfull[\s-]?time\b/i,
  /\bmy (?:clinic|practice) is my (?:full time|only|main)\b/i,
  /\bonly (?:income|job)\b/i,
  /\b(?:own|opened|running) my (?:own )?(?:clinic|practice)\b/i,
  /\bclinic owner\b/i,
  /\bpractice owner\b/i,
  /\bi own (?:a|my|the) (?:clinic|practice)\b/i,
  /\bwent out on my own\b/i,
  /\bsolo practice\b/i,
  /\bindependent practice\b/i,
  /\bprivate practice\b/i,
  /\bleft (?:my job|the hospital|the clinic|outpatient|employment)\b/i,
  /\bquit my job\b/i,
  /\bhigh[\s-]?volume\b/i,
  /\binsurance mill\b/i,
  /\bemployed (?:at|by|full)\b/i,
  /\bon (?:salary|payroll)\b/i,
];

const inferEmploymentStatus = (bodies: string[]): EmploymentStatus | null => {
  // Score both directions across all messages, pick winner
  let fullTimeScore = 0;
  let partTimeScore = 0;
  for (const body of bodies) {
    if (PART_TIME_PATTERNS.some((p) => p.test(body))) partTimeScore++;
    if (FULL_TIME_PATTERNS.some((p) => p.test(body)) && !/\bnot full[\s-]?time\b/i.test(body)) fullTimeScore++;
  }
  if (fullTimeScore === 0 && partTimeScore === 0) return null;
  return fullTimeScore >= partTimeScore ? 'full_time' : 'part_time';
};

const MOSTLY_CASH_PATTERNS = [
  /\bmostly cash\b/i,
  /\ball cash\b/i,
  /\bcash only\b/i,
  /\bcash[\s-]?based\b/i,
  /\bcash[\s-]?pay\b/i,
  /\bcash practice\b/i,
  /\bcash model\b/i,
  /\bi['']?m cash\b/i,
  /\bprivate pay\b/i,
  /\bself[\s-]?pay\b/i,
  /\bout of pocket\b/i,
  /\bno contracts?\b/i,
  /\bdon'?t (?:have|take|accept|bill|do) (?:any )?(?:contracts?|insurance)\b/i,
  /\bdo not (?:have|take|accept|bill|do) (?:any )?(?:contracts?|insurance)\b/i,
  /\bhave no contracts?\b/i,
  /\bno insurance\b/i,
  /\bdropped (?:insurance|out of network|contracts?)\b/i,
  /\bout[\s-]?of[\s-]?network\b/i,
  /\bconcierge\b/i,
  /\bdirect (?:pay|access|care|primary care)\b/i,
  /\bdpc\b/i,
  /\bmembership (?:model|practice|based)\b/i,
  /\bfee[\s-]?for[\s-]?service\b/i,
  /\bretainer\b/i,
];

const MOSTLY_INSURANCE_PATTERNS = [
  /\bmostly insurance\b/i,
  /\ball insurance\b/i,
  /\binsurance[\s-]?heavy\b/i,
  /\binsurance[\s-]?based\b/i,
  /\binsurance[\s-]?dependent\b/i,
  /\binsurance[\s-]?reliant\b/i,
  /\bin[\s-]?network\b/i,
  /\baccept insurance\b/i,
  /\binsurance contracts?\b/i,
  /\binsurance billing\b/i,
  /\bsubmit(?:ting)? claims?\b/i,
  /\bcopay\b/i,
  /\bdeductible\b/i,
  /\b(?:blue cross|bcbs|aetna|cigna|humana|united health|medicare|medicaid|tricare)\b/i,
  /\bprior auth(?:orization)?\b/i,
  /\bprimarily insurance\b/i,
  /\bmainly insurance\b/i,
];

const BALANCED_MIX_PATTERNS = [
  /\bbalanced\b/i,
  /\bmix(?:ed)?\b/i,
  /\bboth cash and insurance\b/i,
  /\bcash and insurance\b/i,
  /\binsurance and cash\b/i,
  /\b50\s*\/\s*50\b/i,
  /\bblend(?:ed)?\b/i,
  /\bcombination of (?:cash|insurance)\b/i,
  /\bsome cash some insurance\b/i,
];

const inferRevenueMix = (bodies: string[]): RevenueMixCategory | null => {
  let cashScore = 0;
  let insuranceScore = 0;
  let balancedScore = 0;
  for (const body of bodies) {
    const normalized = normalizeLower(body);
    if (BALANCED_MIX_PATTERNS.some((p) => p.test(normalized))) balancedScore++;
    if (MOSTLY_INSURANCE_PATTERNS.some((p) => p.test(normalized))) insuranceScore++;
    if (MOSTLY_CASH_PATTERNS.some((p) => p.test(normalized))) cashScore++;
  }
  if (cashScore === 0 && insuranceScore === 0 && balancedScore === 0) return null;
  if (balancedScore > 0 && balancedScore >= cashScore && balancedScore >= insuranceScore) return 'balanced';
  return cashScore >= insuranceScore ? 'mostly_cash' : 'mostly_insurance';
};

const HIGH_INTEREST_PATTERNS = [
  /\binterested in (?:business )?coaching\b/i,
  /\bopen to (?:business )?coaching\b/i,
  /\b(?:book|schedule)\s+(?:a\s+)?call\b/i,
  /\blet'?s (?:book|schedule|talk|connect|chat)\b/i,
  /\byes\b.{0,24}\b(?:call|coaching|program)\b/i,
  /\bsign me up\b/i,
  /\bcount me in\b/i,
  /\bi'?m in\b/i,
  /\bready to (?:go|start|talk|connect)\b/i,
  /\bwhen can we\b/i,
  /\bhow do i (?:get started|sign up|join)\b/i,
  /\bthis is (?:exactly )?what i (?:need|want|was looking for)\b/i,
  /\bsounds (?:great|amazing|perfect|awesome)\b/i,
  /\byes please\b/i,
  /\babsolutely\b/i,
  /\bfor sure\b/i,
  /\bdefinitely\b/i,
  /\b100%\b/i,
  /\bexcited\b/i,
  /\bpumped\b/i,
  /\bset up (?:a )?call\b/i,
  /\bschedule (?:a )?call\b/i,
  /\bwhat'?s the next step\b/i,
  /\bhit me up\b/i,
  /\breach out\b/i,
];

const MEDIUM_INTEREST_PATTERNS = [
  /\bmaybe\b/i,
  /\bnot sure\b/i,
  /\bcurious\b/i,
  /\bneed to think\b/i,
  /\blater\b/i,
  /\btell me more\b/i,
  /\blearn more\b/i,
  /\bmore info(?:rmation)?\b/i,
  /\bsounds interesting\b/i,
  /\bconsidering\b/i,
  /\bthinking about\b/i,
  /\blooking into\b/i,
  /\bexploring\b/i,
  /\bopen to (?:it|learning|hearing)\b/i,
  /\bwhat (?:does|would|is)\b.{0,30}\b(?:cost|price|investment|program)\b/i,
  /\bhow much\b/i,
  /\bwhat are the details\b/i,
  /\bstill deciding\b/i,
  /\bon the fence\b/i,
];

const LOW_INTEREST_PATTERNS = [
  /\bnot interested\b/i,
  /\bno thanks\b/i,
  /\bnot (?:looking|ready) (?:to invest|for coaching)\b/i,
  /\bnot right now\b/i,
  /\bunsubscribe\b/i,
  /\bremove me\b/i,
  /\bstop (?:texting|messaging|contacting)\b/i,
  /\bwrong number\b/i,
  /\bnot for me\b/i,
  /\bdo not contact\b/i,
  /\bleave me alone\b/i,
  /\btake me off\b/i,
  /\bnot a (?:good )?fit\b/i,
  /\bdoesn'?t (?:fit|work|apply)\b/i,
  /\btoo busy\b/i,
  /\bno time for this\b/i,
];

const inferCoachingInterest = (bodies: string[]): CoachingInterest | null => {
  let highScore = 0;
  let mediumScore = 0;
  let lowScore = 0;
  for (const body of bodies) {
    if (LOW_INTEREST_PATTERNS.some((p) => p.test(body))) lowScore++;
    if (HIGH_INTEREST_PATTERNS.some((p) => p.test(body))) highScore++;
    if (MEDIUM_INTEREST_PATTERNS.some((p) => p.test(body))) mediumScore++;
  }
  if (highScore === 0 && mediumScore === 0 && lowScore === 0) return null;
  if (lowScore > highScore && lowScore > mediumScore) return 'low';
  if (highScore >= mediumScore) return 'high';
  return 'medium';
};

// ── Delivery model inference ──────────────────────────────────────────────────
const BRICK_AND_MORTAR_PATTERNS = [
  /\bmy (?:clinic|office|practice|space|studio|suite|facility|location)\b/i,
  /\bbrick[\s-]?and[\s-]?mortar\b/i,
  /\bphysical (?:location|clinic|office|space)\b/i,
  /\bin[\s-]?person\b/i,
  /\bface[\s-]?to[\s-]?face\b/i,
  /\bpatients come (?:to me|in|to my)\b/i,
  /\btreatment (?:room|space|table)\b/i,
  /\brent(?:ing)? (?:a |my )?(?:space|room|suite|office)\b/i,
  /\bstorefront\b/i,
];

const MOBILE_PATTERNS = [
  /\bmobile (?:pt|physio|chiro|practice|clinic|service|therapist)\b/i,
  /\bi (?:drive|travel) to\b/i,
  /\bdriving to (?:patients|clients|homes)\b/i,
  /\btravel(?:ing)? to (?:patients|clients|homes|their)\b/i,
  /\bpatient(?:'s)? homes?\b/i,
  /\bhome[\s-]?(?:based|visits?|care)\b/i,
  /\bhouse calls?\b/i,
  /\bin[\s-]?home\b/i,
  /\bat[\s-]?home (?:pt|therapy|visits?)\b/i,
  /\bconcierge (?:mobile|pt|therapy)\b/i,
  /\bi go to (?:them|patients|clients)\b/i,
];

const ONLINE_PATTERNS = [
  /\btelehealth\b/i,
  /\bvirtual (?:pt|therapy|sessions?|visits?|practice|clinic)\b/i,
  /\bonline (?:pt|therapy|sessions?|practice|clinic|coaching)\b/i,
  /\bvideo (?:calls?|sessions?|visits?)\b/i,
  /\bzoom (?:sessions?|calls?|visits?)\b/i,
  /\bremote (?:pt|therapy|sessions?|practice)\b/i,
  /\btele[\s-]?pt\b/i,
  /\bno in[\s-]?person\b/i,
  /\bnever meet in person\b/i,
  /\bfully (?:online|virtual|remote)\b/i,
  /\bdigital (?:practice|clinic|platform)\b/i,
];

const HYBRID_PATTERNS = [
  /\bhybrid\b/i,
  /\bmix of (?:in[\s-]?person|online|virtual|telehealth)\b/i,
  /\bcombination of (?:in[\s-]?person|online|virtual)\b/i,
  /\bboth in[\s-]?person and (?:online|virtual|telehealth)\b/i,
  /\bsome (?:virtual|online|telehealth) and some in[\s-]?person\b/i,
  /\bin[\s-]?person and (?:online|virtual|telehealth)\b/i,
  /\bonline and in[\s-]?person\b/i,
  /\bsometimes virtual\b/i,
];

const inferDeliveryModel = (bodies: string[]): DeliveryModel | null => {
  let brickScore = 0;
  let mobileScore = 0;
  let onlineScore = 0;
  let hybridScore = 0;
  for (const body of bodies) {
    if (HYBRID_PATTERNS.some((p) => p.test(body))) hybridScore++;
    if (ONLINE_PATTERNS.some((p) => p.test(body))) onlineScore++;
    if (MOBILE_PATTERNS.some((p) => p.test(body))) mobileScore++;
    if (BRICK_AND_MORTAR_PATTERNS.some((p) => p.test(body))) brickScore++;
  }
  if (brickScore === 0 && mobileScore === 0 && onlineScore === 0 && hybridScore === 0) return null;
  const max = Math.max(brickScore, mobileScore, onlineScore, hybridScore);
  if (hybridScore === max) return 'hybrid';
  if (onlineScore === max) return 'online';
  if (mobileScore === max) return 'mobile';
  return 'brick_and_mortar';
};

const NICHE_PATTERNS = [
  /\b(?:speciali(?:s|z)e(?:d|s|ing)?\s+in|my niche is|niche is|focus(?:ed)?\s+on|work(?:ing)?\s+with|treat(?:ing)?\s+mostly)\s+([^.!?\n]{3,90})/i,
  /\b(?:i(?:\s*am|'m)\s+in)\s+([^.!?\n]{3,90})/i,
  /\b(?:serve|serving|help(?:ing)?)\s+(?:mostly\s+)?([^.!?\n]{3,60})\s+(?:patients?|clients?|people)\b/i,
  /\b(?:my\s+)?(?:patients?|clients?)\s+are\s+(?:mostly\s+)?([^.!?\n]{3,60})\b/i,
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

// ── Objection inference ───────────────────────────────────────────────────────
const OBJECTION_MAP: Record<string, RegExp[]> = {
  'price_cost': [/\btoo expensive\b/i, /\bprice is high\b/i, /\bcant afford\b/i, /\bcost\b.{0,20}\bmuch\b/i, /\binvestment\b.{0,20}\bhigh\b/i],
  'time_capacity': [/\bno time\b/i, /\btoo busy\b/i, /\boverwhelmed\b/i, /\bnot right now\b/i, /\bwaiting\b/i],
  'spouse_partner': [/\btalk to (?:my )?(?:spouse|wife|husband|partner)\b/i, /\brun it by (?:my )?(?:spouse|wife|husband|partner)\b/i],
  'market_saturation': [/\bsaturated\b/i, /\btoo many pt\b/i, /\bcompetition\b/i],
  'insurance_reliance': [/\bpatients won'?t pay cash\b/i, /\bneed insurance\b/i, /\bonly take insurance\b/i],
};

const inferObjectionTags = (bodies: string[]): string[] => {
  const found = new Set<string>();
  for (const body of bodies) {
    const normalized = normalizeLower(body);
    for (const [tag, patterns] of Object.entries(OBJECTION_MAP)) {
      if (patterns.some(p => p.test(normalized))) {
        found.add(tag);
      }
    }
  }
  return [...found];
};

const resolveQualificationProgressStep = (snapshot: {
  fullOrPartTime: EmploymentStatus;
  niche: string | null;
  revenueMix: RevenueMixCategory;
  coachingInterest: CoachingInterest;
  deliveryModel: DeliveryModel;
}): number => {
  let score = 0;
  if (snapshot.fullOrPartTime !== 'unknown') score += 1;
  if (snapshot.niche && snapshot.niche.trim().length > 0) score += 1;
  if (snapshot.revenueMix !== 'unknown') score += 1;
  if (snapshot.coachingInterest !== 'unknown') score += 1;
  if (snapshot.deliveryModel !== 'unknown') score += 1;
  return score;
};

const isNicheMissing = (value: string | null): boolean => !value || value.trim().length === 0;

export const inferQualificationStateFromMessages = (
  state: ConversationStateRow,
  messages: InboxMessageRow[],
  options?: InferenceOptions,
  logger?: Pick<Logger, 'debug'>,
): QualificationInferenceResult => {
  const inboundBodies = getInboundBodiesNewestFirst(messages);
  const allowOverwriteKnown = options?.allowOverwriteKnown === true;
  const inferred = {
    fullOrPartTime: inferEmploymentStatus(inboundBodies),
    niche: inferNiche(inboundBodies),
    revenueMix: inferRevenueMix(inboundBodies),
    coachingInterest: inferCoachingInterest(inboundBodies),
    deliveryModel: inferDeliveryModel(inboundBodies),
    objectionTags: inferObjectionTags(inboundBodies),
  };

  const snapshot: QualificationSnapshot = {
    fullOrPartTime: (inferred.fullOrPartTime && (allowOverwriteKnown || state.qualification_full_or_part_time === 'unknown'))
      ? inferred.fullOrPartTime
      : (state.qualification_full_or_part_time as EmploymentStatus),
    niche: (inferred.niche && (allowOverwriteKnown || isNicheMissing(state.qualification_niche)))
      ? inferred.niche
      : state.qualification_niche,
    revenueMix: (inferred.revenueMix && (allowOverwriteKnown || state.qualification_revenue_mix === 'unknown'))
      ? inferred.revenueMix
      : (state.qualification_revenue_mix as RevenueMixCategory),
    coachingInterest: (inferred.coachingInterest && (allowOverwriteKnown || state.qualification_coaching_interest === 'unknown'))
      ? inferred.coachingInterest
      : (state.qualification_coaching_interest as CoachingInterest),
    deliveryModel: (inferred.deliveryModel && (allowOverwriteKnown || state.qualification_delivery_model === 'unknown'))
      ? inferred.deliveryModel
      : ((state.qualification_delivery_model || 'unknown') as DeliveryModel),
    progressStep: 0,
    objectionTags: (state.objection_tags || []) as string[],
  };

  // Merge objection tags (don't overwrite, just append new ones)
  if (inferred.objectionTags.length > 0) {
    const nextTags = [...new Set([...snapshot.objectionTags, ...inferred.objectionTags])];
    if (nextTags.length !== snapshot.objectionTags.length) {
      snapshot.objectionTags = nextTags;
    }
  }

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
  if (snapshot.deliveryModel !== (state.qualification_delivery_model || 'unknown')) {
    updates.deliveryModel = snapshot.deliveryModel;
  }
  if (snapshot.progressStep !== (state.qualification_progress_step || 0)) {
    updates.progressStep = snapshot.progressStep;
  }
  if (JSON.stringify(snapshot.objectionTags) !== JSON.stringify(state.objection_tags || [])) {
    updates.objectionTags = snapshot.objectionTags;
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
