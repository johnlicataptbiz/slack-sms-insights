import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Logger } from '@slack/bolt';
import { generateAiResponse } from './ai-response.js';
import type {
  ConversationStateRow,
  ConversionExampleRow,
  InboxMessageRow,
  SetterVoiceExampleRow,
} from './inbox-store.js';
import { listConversionExamples, listSetterVoiceExamples } from './inbox-store.js';

const CANONICAL_DOC_PATHS = {
  escalationModel: '/Users/jl/Downloads/PT Biz Lead Messaging Escalation Model.docx',
  conversionMessages: '/Users/jl/Downloads/Booked Call Conversion Messages.docx',
  referenceDoc: '/Users/jl/Downloads/PT Biz Reference Doc for Lead Messaging Agents.docx',
  clinicOwnerLanguagePlaybook: '/Users/jl/Downloads/Clinic_Owner_Language_Playbook.docx',
  socialLinks: '/Users/jl/Downloads/PT Biz Social Media Links.txt',
} as const;

const OPENAI_MISSING_KEY_MESSAGE = 'Set OPENAI_API_KEY in your environment to enable AI replies.';
const MAX_EXAMPLES = 6;
const MAX_RETRIES = 3;
const MAX_STYLE_ANCHORS = 5;
const MIN_EXAMPLE_KEYWORD_HITS = 2;

export type EscalationLevel = 1 | 2 | 3 | 4;

type CanonicalSources = {
  escalationModel: string;
  conversionMessages: string;
  referenceDoc: string;
  clinicOwnerLanguagePlaybook: string;
  socialLinks: string;
};

let canonicalSourcesCache: CanonicalSources | null = null;

export type DraftLintIssue = {
  code:
    | 'forbidden_dash_character'
    | 'forbidden_bullet_list'
    | 'line_stacking_pattern'
    | 'missing_cta_question'
    | 'long_block_without_breaks';
  message: string;
  blocking: boolean;
};

export type DraftLintResult = {
  passed: boolean;
  score: number;
  structuralScore: number;
  issues: DraftLintIssue[];
};

export type DraftGenerationResult = {
  text: string;
  escalationLevel: EscalationLevel;
  escalationReason: string;
  qualificationStep: number;
  qualificationMissing: string[];
  retrievedExamples: Array<
    ConversionExampleRow & {
      outbound_body: string | null;
      outbound_user: string | null;
      source_inbound_body: string | null;
      source_conversation_id: string | null;
      source_outbound_ts: string | null;
      matchScore?: number;
      matchHits?: string[];
    }
  >;
  styleAnchors: SetterVoiceExampleRow[];
  promptSnapshotHash: string;
  lint: DraftLintResult;
  attempts: number;
  generationMode: 'ai' | 'contextual_fallback';
  generationWarnings: string[];
  genericToneDetected: boolean;
};

export type DraftContactContext = {
  name?: string | null;
  phone?: string | null;
  timezone?: string | null;
  ownerLabel?: string | null;
  profileNiche?: string | null;
};

const safeReadText = (path: string): string => {
  try {
    return execFileSync('cat', [path], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

const readDocx = (path: string): string => {
  try {
    return execFileSync('textutil', ['-convert', 'txt', '-stdout', path], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 4 * 1024 * 1024,
    }).trim();
  } catch {
    return '';
  }
};

const getCanonicalSources = (): CanonicalSources => {
  if (canonicalSourcesCache) return canonicalSourcesCache;
  canonicalSourcesCache = {
    escalationModel: readDocx(CANONICAL_DOC_PATHS.escalationModel),
    conversionMessages: readDocx(CANONICAL_DOC_PATHS.conversionMessages),
    referenceDoc: readDocx(CANONICAL_DOC_PATHS.referenceDoc),
    clinicOwnerLanguagePlaybook: readDocx(CANONICAL_DOC_PATHS.clinicOwnerLanguagePlaybook),
    socialLinks: safeReadText(CANONICAL_DOC_PATHS.socialLinks),
  };
  return canonicalSourcesCache;
};

const normalize = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase();
const toEpochMs = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};
const compareChronological = (a: InboxMessageRow, b: InboxMessageRow): number => {
  const byTime = toEpochMs(a.event_ts) - toEpochMs(b.event_ts);
  if (byTime !== 0) return byTime;
  return a.id.localeCompare(b.id);
};
const orderMessagesChronologically = (messages: InboxMessageRow[]): InboxMessageRow[] =>
  [...messages].sort(compareChronological);
const formatTimestamp = (value: string): string => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toISOString();
};
const sanitizeInline = (value: string): string =>
  value
    .replace(/[\u2012\u2013\u2014\u2015-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
type OwnerVoice = 'jack' | 'brandon' | null;
type ConversionExampleCandidate = ConversionExampleRow & {
  outbound_body: string | null;
  outbound_user: string | null;
  source_inbound_body: string | null;
  source_conversation_id: string | null;
  source_outbound_ts: string | null;
  matchScore?: number;
  matchHits?: string[];
};
const normalizeOwnerVoice = (ownerLabel: string | null | undefined): OwnerVoice => {
  const lower = (ownerLabel || '').trim().toLowerCase();
  if (!lower) return null;
  if (lower.includes('jack')) return 'jack';
  if (lower.includes('brandon')) return 'brandon';
  return null;
};
const findLatestMessageByDirection = (
  messages: InboxMessageRow[],
  direction: InboxMessageRow['direction'],
): InboxMessageRow | null => {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.direction === direction && (message.body || '').trim().length > 0) {
      return message;
    }
  }
  return null;
};
const timelineSpeakerLabel = (message: InboxMessageRow): string =>
  message.direction === 'inbound' ? 'Lead' : message.aloware_user || 'Setter';

const KEYWORD_STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'been',
  'but',
  'by',
  'can',
  'do',
  'for',
  'from',
  'got',
  'have',
  'hey',
  'how',
  'i',
  'if',
  'im',
  'in',
  'is',
  'it',
  'just',
  'keep',
  'like',
  'make',
  'my',
  'of',
  'on',
  'or',
  'our',
  'right',
  'so',
  'still',
  'that',
  'the',
  'their',
  'them',
  'there',
  'they',
  'this',
  'to',
  'up',
  'we',
  'what',
  'when',
  'with',
  'you',
  'your',
  'youre',
  'want',
  'now',
]);

const tokenizeKeywords = (text: string): string[] => {
  if (!text) return [];
  const words = normalize(text)
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3)
    .filter((token) => !KEYWORD_STOPWORDS.has(token))
    .slice(0, 500);
  return [...new Set(words)];
};

const extractPlaybookKeywords = (playbookText: string): string[] => {
  const lines = playbookText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const terms: string[] = [];
  for (const line of lines) {
    if (/playbook/i.test(line)) continue;
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      terms.push(line.slice(0, colonIndex).trim());
      continue;
    }
    if (/^[A-Za-z0-9\s/()-]{3,60}$/.test(line) && /^[A-Z0-9]/.test(line)) {
      terms.push(line);
    }
  }
  return tokenizeKeywords(terms.join(' ')).slice(0, 300);
};

const buildConversationKeywords = (params: {
  messages: InboxMessageRow[];
  state: ConversationStateRow | null;
  contact?: DraftContactContext;
}): string[] => {
  const ordered = orderMessagesChronologically(params.messages);
  const latestInbound = findLatestMessageByDirection(ordered, 'inbound');
  const inboundWindow = ordered
    .filter((message) => message.direction === 'inbound')
    .slice(-8)
    .map((message) => message.body || '')
    .join(' ');
  const contextText = [
    latestInbound?.body || '',
    inboundWindow,
    params.state?.qualification_niche || '',
    params.contact?.profileNiche || '',
  ].join(' ');
  return tokenizeKeywords(contextText).slice(0, 80);
};

const scoreConversionExample = (params: {
  example: ConversionExampleCandidate;
  conversationKeywords: string[];
  preferredOwnerVoice: OwnerVoice;
  playbookKeywordSet: Set<string>;
}): { score: number; hits: string[] } => {
  const corpus = `${params.example.source_inbound_body || ''} ${params.example.outbound_body || ''}`;
  const exampleKeywordSet = new Set(tokenizeKeywords(corpus));
  const hits = params.conversationKeywords.filter((keyword) => exampleKeywordSet.has(keyword));
  const closedLabel = normalize(params.example.closed_won_label || '');
  const closedWon = /\bwon\b/.test(closedLabel);
  const closedLost = /\blost\b/.test(closedLabel);
  const booked = /\bbook/.test(normalize(params.example.booked_call_label || ''));
  const ownerMatch =
    Boolean(params.preferredOwnerVoice) &&
    normalize(params.example.outbound_user || '').includes(params.preferredOwnerVoice || '');

  const playbookHitCount = hits.filter((keyword) => params.playbookKeywordSet.has(keyword)).length;
  const standardHitCount = Math.max(0, hits.length - playbookHitCount);
  // Playbook/domain terms carry much more signal than generic overlap.
  let score = standardHitCount * 2 + playbookHitCount * 9;
  if (booked) score += 5;
  if (closedWon) score += 8;
  if (closedLost) score += 2;
  if (ownerMatch) score += 3;

  return {
    score,
    hits: hits.slice(0, 10),
  };
};

const rankConversionExamples = (params: {
  examples: ConversionExampleCandidate[];
  messages: InboxMessageRow[];
  state: ConversationStateRow | null;
  contact?: DraftContactContext;
  preferredOwnerVoice: OwnerVoice;
  playbookKeywords: string[];
}): ConversionExampleCandidate[] => {
  const conversationKeywords = buildConversationKeywords({
    messages: params.messages,
    state: params.state,
    contact: params.contact,
  });
  const playbookKeywordSet = new Set(params.playbookKeywords);

  const ranked = params.examples
    .map((example) => {
      const scored = scoreConversionExample({
        example,
        conversationKeywords,
        preferredOwnerVoice: params.preferredOwnerVoice,
        playbookKeywordSet,
      });
      return {
        ...example,
        matchScore: scored.score,
        matchHits: scored.hits,
      };
    })
    .sort((a, b) => {
      const byScore = (b.matchScore || 0) - (a.matchScore || 0);
      if (byScore !== 0) return byScore;
      return toEpochMs(b.created_at) - toEpochMs(a.created_at);
    });

  const strongMatches = ranked.filter((example) => (example.matchHits?.length || 0) >= MIN_EXAMPLE_KEYWORD_HITS);
  return (strongMatches.length > 0 ? strongMatches : ranked).slice(0, MAX_EXAMPLES);
};

const splitSentences = (text: string): string[] =>
  text
    .split(/(?<=[.!?])\s+/)
    .map((segment) => sanitizeInline(segment))
    .filter((segment) => segment.length > 0);

const selectQuestionFromExamples = (params: {
  examples: ConversionExampleCandidate[];
  missingFields: string[];
}): string | null => {
  const field = params.missingFields[0] || '';
  const fieldPatterns: Record<string, RegExp> = {
    full_or_part_time: /\b(full|part|employee|clinic)\b/i,
    niche: /\b(niche|serve|treat|population|specialty)\b/i,
    revenue_mix: /\b(cash|insurance|mix|hybrid)\b/i,
    coaching_interest: /\b(coach|coaching|support|help|mentor)\b/i,
  };

  for (const example of params.examples.slice(0, 4)) {
    const questions = splitSentences(example.outbound_body || '').filter((sentence) => sentence.includes('?'));
    if (questions.length === 0) continue;
    const pattern = fieldPatterns[field];
    const preferred = pattern ? questions.find((question) => pattern.test(question)) : questions[0];
    const selected = preferred || (field ? null : questions[0]);
    if (selected && selected.length >= 14 && selected.length <= 180) {
      return selected;
    }
  }
  return null;
};

const hasPattern = (text: string, patterns: RegExp[]): boolean => patterns.some((pattern) => pattern.test(text));

const LEVEL_1_PATTERNS = [
  /student/i,
  /maybe someday/i,
  /seems saturated/i,
  /i don't know yet/i,
  /just curious/i,
  /idea phase/i,
  /no timeline/i,
];

const LEVEL_2_PATTERNS = [
  /too expensive/i,
  /no time/i,
  /spouse/i,
  /market saturated/i,
  /patients won't pay cash/i,
  /hesitant/i,
  /objection/i,
];

const LEVEL_3_PATTERNS = [
  /part.?time/i,
  /full.?time/i,
  /cash/i,
  /timeline/i,
  /revenue goal/i,
  /book/i,
  /open to call/i,
];

const LEVEL_4_PATTERNS = [/stuck/i, /plateau/i, /hiring/i, /cash flow/i, /systems/i, /scale/i, /overwhelmed/i];

export const classifyEscalationLevel = (messages: InboxMessageRow[], state?: ConversationStateRow | null) => {
  if (state?.escalation_overridden) {
    return {
      level: state.escalation_level as EscalationLevel,
      reason: state.escalation_reason || 'manual escalation override',
    };
  }

  const orderedMessages = orderMessagesChronologically(messages);
  const inboundText = orderedMessages
    .filter((message) => message.direction === 'inbound' && Boolean(message.body))
    .slice(-6)
    .map((message) => message.body || '')
    .join(' ');

  const normalized = normalize(inboundText);

  if (hasPattern(normalized, LEVEL_4_PATTERNS)) {
    return { level: 4 as EscalationLevel, reason: 'scaling signal' };
  }
  if (hasPattern(normalized, LEVEL_2_PATTERNS)) {
    return { level: 2 as EscalationLevel, reason: 'objection signal' };
  }
  if (hasPattern(normalized, LEVEL_1_PATTERNS)) {
    return { level: 1 as EscalationLevel, reason: 'awareness signal' };
  }
  if (hasPattern(normalized, LEVEL_3_PATTERNS)) {
    return { level: 3 as EscalationLevel, reason: 'call readiness signal' };
  }

  return {
    level: (state?.escalation_level || 1) as EscalationLevel,
    reason: 'default state baseline',
  };
};

const missingQualificationFields = (state: ConversationStateRow | null): string[] => {
  const missing: string[] = [];
  if (!state || state.qualification_full_or_part_time === 'unknown') missing.push('full_or_part_time');
  if (!state || !state.qualification_niche || state.qualification_niche.trim().length === 0) missing.push('niche');
  if (!state || state.qualification_revenue_mix === 'unknown') missing.push('revenue_mix');
  if (!state || state.qualification_coaching_interest === 'unknown') missing.push('coaching_interest');
  return missing;
};

const qualificationStep = (state: ConversationStateRow | null): number => {
  if (!state) return 0;
  return Math.max(0, Math.min(4, state.qualification_progress_step || 0));
};

const parseNumberedExamples = (text: string): string[] => {
  const lines = text.split(/\r?\n/);
  const examples: string[] = [];
  let block: string[] = [];

  for (const line of lines) {
    if (/^\d+\.\s+/.test(line.trim())) {
      if (block.length > 0) examples.push(block.join('\n').trim());
      block = [line.trim()];
      continue;
    }
    if (block.length > 0) block.push(line);
  }
  if (block.length > 0) examples.push(block.join('\n').trim());
  return examples.filter((item) => item.length > 0);
};

const truncate = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[TRUNCATED]`;
};

const hasForbiddenDash = (text: string): boolean => /[\u2012\u2013\u2014\u2015-]/.test(text);

const hasBulletLikeFormatting = (text: string): boolean => /^\s*(?:[-*•]|\d+\.)\s+/m.test(text);

const hasLineStackingPattern = (text: string): boolean => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 8) return false;
  const compactCount = lines.filter((line) => line.split(/\s+/).filter(Boolean).length <= 4).length;
  return compactCount / lines.length > 0.6;
};

const hasMissingCtaQuestion = (text: string): boolean => !/\?/.test(text);

const hasAiGenericPhrasing = (text: string): boolean => {
  const normalized = normalize(text);
  if (!normalized) return true;
  const genericPatterns = [
    /\bi hope you(?:'re| are)\s+(?:doing|having)\s+well\b/i,
    /\bjust wanted to follow up\b/i,
    /\bquick reminder\b/i,
    /\bi totally understand\b/i,
    /\bthat makes complete sense\b/i,
    /\bwould love to connect\b/i,
    /\bif you are interested\b/i,
    /\blet me know if this helps\b/i,
  ];
  return genericPatterns.some((pattern) => pattern.test(normalized));
};

const hasLongParagraph = (text: string): boolean => {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .some((paragraph) => paragraph.length > 1200);
};

export const lintDraft = (text: string): DraftLintResult => {
  const issues: DraftLintIssue[] = [];

  if (hasForbiddenDash(text)) {
    issues.push({
      code: 'forbidden_dash_character',
      message: 'Draft includes forbidden dash characters.',
      blocking: true,
    });
  }

  if (hasBulletLikeFormatting(text)) {
    issues.push({
      code: 'forbidden_bullet_list',
      message: 'Draft includes bullet or numbered formatting.',
      blocking: true,
    });
  }

  if (hasLineStackingPattern(text)) {
    issues.push({
      code: 'line_stacking_pattern',
      message: 'Draft appears line stacked and unnatural for SMS.',
      blocking: true,
    });
  }

  if (hasMissingCtaQuestion(text)) {
    issues.push({
      code: 'missing_cta_question',
      message: 'Draft is missing a CTA question.',
      blocking: false,
    });
  }

  if (hasLongParagraph(text)) {
    issues.push({
      code: 'long_block_without_breaks',
      message: 'Draft has a long block without natural spacing.',
      blocking: false,
    });
  }

  const blocking = issues.filter((issue) => issue.blocking).length;
  const warning = issues.length - blocking;

  return {
    passed: blocking === 0,
    score: Math.max(0, 100 - blocking * 35 - warning * 12),
    structuralScore: Math.max(0, 100 - blocking * 20 - warning * 15),
    issues,
  };
};

const renderRevenueMixLabel = (value: ConversationStateRow['qualification_revenue_mix']): string => {
  if (value === 'mostly_cash') return 'mostly cash';
  if (value === 'mostly_insurance') return 'mostly insurance';
  if (value === 'balanced') return 'balanced';
  return 'unknown';
};

const renderEmploymentLabel = (value: ConversationStateRow['qualification_full_or_part_time']): string => {
  if (value === 'full_time') return 'full time';
  if (value === 'part_time') return 'part time';
  return 'unknown';
};

const renderCoachingInterestLabel = (value: ConversationStateRow['qualification_coaching_interest']): string => {
  if (value === 'high') return 'high';
  if (value === 'medium') return 'medium';
  if (value === 'low') return 'low';
  return 'unknown';
};

const nextQualificationQuestion = (missingFields: string[], ownerVoice: OwnerVoice = null): string => {
  const jack = ownerVoice === 'jack';
  const brandon = ownerVoice === 'brandon';
  if (missingFields[0] === 'full_or_part_time') {
    if (jack) return 'Are you full time right now or still part time?';
    if (brandon) return 'Are you full time right now or still part time in clinic?';
    return 'Are you full time right now or still part time?';
  }
  if (missingFields[0] === 'niche') {
    if (jack) return 'Who do you mainly want to serve right now?';
    if (brandon) return 'Who are you mainly trying to treat right now?';
    return 'Who is your core niche right now?';
  }
  if (missingFields[0] === 'revenue_mix') {
    if (jack) return 'Are you mostly cash, mostly insurance, or a blend right now?';
    if (brandon) return 'Is your mix mostly cash, mostly insurance, or balanced right now?';
    return 'Would you say your revenue mix is mostly cash, mostly insurance, or balanced right now?';
  }
  if (missingFields[0] === 'coaching_interest') {
    if (jack) return 'If we mapped a clear plan, how open are you to coaching support right now?';
    if (brandon) return 'If we map this out together, how open are you to coaching support right now?';
    return 'If we map a clear plan, how open are you to business coaching right now?';
  }
  if (jack) return 'Open to a quick call this week to map next steps?';
  if (brandon) return 'Would you be open to a quick call this week to map next steps?';
  return 'Would you be open to a quick call this week so we can map the next step together?';
};

const chooseAcknowledgement = (latestInboundBody: string, ownerVoice: OwnerVoice = null): string => {
  const normalized = normalize(latestInboundBody);
  if (!normalized) return ownerVoice === 'jack' ? 'Got you.' : 'Appreciate the update.';
  if (/thank|thanks|appreciate|grateful/.test(normalized))
    return ownerVoice === 'jack' ? 'Love that, appreciate you sharing.' : 'Love that and thanks for sharing.';
  if (/not receive|did not receive|didnt receive|have not received|hasnt received/.test(normalized)) {
    return ownerVoice === 'jack' ? 'Good callout, thank you.' : 'Thanks for the heads up.';
  }
  if (/book|scheduled|schedule|availability|available|call/.test(normalized)) {
    return ownerVoice === 'jack' ? 'Perfect, timing sounds good.' : 'Perfect, timing sounds good.';
  }
  if (/\?/.test(latestInboundBody)) return ownerVoice === 'jack' ? 'Good question.' : 'Great question.';
  return ownerVoice === 'jack' ? 'Got it, appreciate the context.' : 'Appreciate the context.';
};

const cleanGeneratedVoice = (text: string, ownerVoice: OwnerVoice = null): string => {
  let next = text;
  const replacements: Array<[RegExp, string]> = [
    [/\bQuick check so I can keep qualification accurate\.?\s*/gi, 'Quick check. '],
    [/\bI have your status marked as\b/gi, ownerVoice === 'jack' ? "Got you as" : 'I have you marked as'],
    [/\bI have your revenue mix noted as\b/gi, ownerVoice === 'jack' ? "Got your mix as" : 'I have your mix as'],
    [/\bI have your niche noted as\b/gi, ownerVoice === 'jack' ? "Got your niche as" : 'I have your niche as'],
    [/\bWould you say your revenue mix is\b/gi, 'Are you'],
    [/\bWho is your core niche right now\?/gi, ownerVoice === 'jack' ? 'Who do you mainly want to serve right now?' : 'Who are you mainly trying to serve right now?'],
  ];
  for (const [pattern, replacement] of replacements) {
    next = next.replace(pattern, replacement);
  }
  return sanitizeInline(next);
};

const buildContextualFallbackDraft = (params: {
  messages: InboxMessageRow[];
  state: ConversationStateRow | null;
  escalationLevel: EscalationLevel;
  missingFields: string[];
  contact?: DraftContactContext;
  preferredOwnerVoice?: OwnerVoice;
  rankedExamples?: ConversionExampleCandidate[];
}): string => {
  const orderedMessages = orderMessagesChronologically(params.messages);
  const latestInbound = findLatestMessageByDirection(orderedMessages, 'inbound');
  const knownNiche = sanitizeInline(params.state?.qualification_niche || params.contact?.profileNiche || '');
  const knownName = sanitizeInline(params.contact?.name || '');
  const ownerVoice = params.preferredOwnerVoice || null;
  const acknowledgement = chooseAcknowledgement(sanitizeInline(latestInbound?.body || ''), ownerVoice);

  const lineOne = knownName ? `${knownName}, ${acknowledgement}` : acknowledgement;

  const contextBits: string[] = [];
  if (params.state && params.state.qualification_full_or_part_time !== 'unknown') {
    contextBits.push(`Got you as ${renderEmploymentLabel(params.state.qualification_full_or_part_time)}.`);
  } else if (knownNiche) {
    contextBits.push(`Got your niche as ${knownNiche}.`);
  } else if (params.state && params.state.qualification_revenue_mix !== 'unknown') {
    contextBits.push(`Got your mix as ${renderRevenueMixLabel(params.state.qualification_revenue_mix)}.`);
  } else if (params.state && params.state.qualification_coaching_interest !== 'unknown') {
    contextBits.push(`Got your coaching interest as ${renderCoachingInterestLabel(params.state.qualification_coaching_interest)}.`);
  }

  const matchedQuestion = selectQuestionFromExamples({
    examples: params.rankedExamples || [],
    missingFields: params.missingFields,
  });
  const nextQuestion = matchedQuestion || nextQualificationQuestion(params.missingFields, ownerVoice);
  const escalationBridge =
    params.missingFields.length === 0
      ? params.escalationLevel >= 3
        ? ownerVoice === 'jack'
          ? 'You look close to call ready.'
          : 'You seem close to call readiness.'
        : params.escalationLevel === 2
          ? ownerVoice === 'jack'
            ? 'I want to keep this practical and low pressure.'
            : 'I want to keep this practical and low pressure.'
          : ownerVoice === 'jack'
            ? 'Keeping this simple.'
            : 'I want to keep this simple and useful.'
      : ownerVoice === 'jack'
        ? 'Quick check.'
        : 'Quick check.';

  return cleanGeneratedVoice([lineOne, ...contextBits.slice(0, 1), escalationBridge, nextQuestion].join(' '), ownerVoice);
};

const buildPrompt = (params: {
  messages: InboxMessageRow[];
  state: ConversationStateRow | null;
  escalationLevel: EscalationLevel;
  escalationReason: string;
  missingFields: string[];
  examples: ConversionExampleCandidate[];
  styleAnchors: SetterVoiceExampleRow[];
  preferredOwnerVoice?: OwnerVoice;
  canonical: CanonicalSources;
  previousIssues?: DraftLintIssue[];
  contact?: DraftContactContext;
  conversationKeywords: string[];
}): string => {
  const orderedMessages = orderMessagesChronologically(params.messages);
  const latestInbound = findLatestMessageByDirection(orderedMessages, 'inbound');
  const latestOutbound = findLatestMessageByDirection(orderedMessages, 'outbound');
  const recentThread = orderedMessages
    .slice(-24)
    .map((message) => {
      const body = (message.body || '').trim();
      if (!body) return '';
      return `[${formatTimestamp(message.event_ts)}] ${timelineSpeakerLabel(message)}: ${body}`;
    })
    .filter((line) => line.length > 0)
    .join('\n');
  const latestInboundSummary = latestInbound
    ? `[${formatTimestamp(latestInbound.event_ts)}] ${truncate(latestInbound.body || '', 900)}`
    : 'none';
  const latestOutboundSummary = latestOutbound
    ? `[${formatTimestamp(latestOutbound.event_ts)}] ${timelineSpeakerLabel(latestOutbound)}: ${truncate(latestOutbound.body || '', 900)}`
    : 'none';
  const latestOutboundLine = (latestOutbound?.line || '').trim() || 'unknown';
  const qualificationSnapshot = params.state
    ? `full_or_part_time=${params.state.qualification_full_or_part_time}; niche=${params.state.qualification_niche || 'unknown'}; revenue_mix=${params.state.qualification_revenue_mix}; coaching_interest=${params.state.qualification_coaching_interest}`
    : 'unknown';
  const contactSnapshot = [
    `name=${params.contact?.name || 'unknown'}`,
    `phone=${params.contact?.phone || 'unknown'}`,
    `timezone=${params.contact?.timezone || 'unknown'}`,
    `owner=${params.contact?.ownerLabel || 'unknown'}`,
    `profile_niche=${params.contact?.profileNiche || 'unknown'}`,
  ].join('; ');

  const canonicalExamples = parseNumberedExamples(params.canonical.conversionMessages)
    .slice(0, 4)
    .map((example, index) => `Canonical example ${index + 1}:\n${truncate(example, 2400)}`)
    .join('\n\n');

  const retrievedExamples = params.examples
    .slice(0, MAX_EXAMPLES)
    .map((example, index) => {
      return [
        `Retrieved example ${index + 1} (score=${example.matchScore || 0}, keyword_hits=${(example.matchHits || []).join(', ') || 'none'}, escalation=${example.escalation_level}, booked=${example.booked_call_label || 'unknown'}, closed=${example.closed_won_label || 'unknown'}):`,
        `Matched lead context:\n${truncate(example.source_inbound_body || '', 500)}`,
        `Matched setter response:\n${truncate(example.outbound_body || '', 900)}`,
      ].join('\n');
    })
    .join('\n\n');

  const previousIssues =
    params.previousIssues && params.previousIssues.length > 0
      ? params.previousIssues.map((issue) => `Issue to fix: ${issue.message}`).join('\n')
      : 'No previous issues.';
  const styleAnchorsBlock =
    params.styleAnchors.length > 0
      ? params.styleAnchors
          .slice(0, MAX_STYLE_ANCHORS)
          .map((example, index) => {
            return `Setter anchor ${index + 1} (${example.aloware_user || 'unknown setter'}, line=${example.line || 'unknown'}):\n${truncate(
              example.body || '',
              700,
            )}`;
          })
          .join('\n\n')
      : 'none';

  return [
    'You are PT Biz lead reply drafting assistant.',
    'Generate one SMS reply draft only.',
    'Goal: sound exactly like the assigned setter when setter anchors are provided.',
    'STRUCTURAL MIRRORING RULES:',
    '1) Mirror structure, pacing, paragraph spacing, question cadence, and CTA placement from examples.',
    '2) Never use em dash or hyphen characters in output.',
    '3) Never use bullet or numbered list formatting unless a mirrored example does so.',
    '4) Qualification first, coaching advice only if source structure includes it.',
    '5) Required qualification variables: full/part time, niche, cash vs insurance mix, coaching interest.',
    '6) Follow escalation model and cadence logic before drafting.',
    '7) First sentence must directly acknowledge the lead most recent inbound context.',
    '8) Avoid generic AI phrases like "I hope you are doing well", "just wanted to follow up", or "quick reminder".',
    '9) Keep wording concrete and specific to this thread context.',
    '10) Avoid corporate phrasing like "qualification accurate", "core niche", and "revenue mix". Use natural setter language.',
    '11) Keep draft concise: 2 to 3 short sentences.',
    '',
    `Preferred setter voice: ${params.preferredOwnerVoice || 'unknown'}`,
    `Conversation keywords: ${params.conversationKeywords.join(', ') || 'none'}`,
    `Escalation level: ${params.escalationLevel}`,
    `Escalation reason: ${params.escalationReason}`,
    `Missing qualification fields: ${params.missingFields.join(', ') || 'none'}`,
    `Qualification progress step: ${qualificationStep(params.state)}`,
    `Qualification snapshot: ${qualificationSnapshot}`,
    `Contact snapshot: ${contactSnapshot}`,
    previousIssues,
    '',
    'Escalation model reference:',
    truncate(params.canonical.escalationModel, 2400),
    '',
    'PT Biz resource reference:',
    truncate(params.canonical.referenceDoc, 1400),
    '',
    'Most recent inbound from lead:',
    latestInboundSummary,
    '',
    'Most recent outbound from setter:',
    latestOutboundSummary,
    `Most recent outbound line: ${latestOutboundLine}`,
    '',
    'Recent conversation window (oldest to newest):',
    truncate(recentThread, 3200),
    '',
    `Setter voice anchors:\n${styleAnchorsBlock}`,
    '',
    retrievedExamples ? `Retrieved successful examples:\n${retrievedExamples}` : 'Retrieved successful examples: none',
    '',
    canonicalExamples,
    '',
    'Return only the final draft message body.',
  ].join('\n');
};

const promptHash = (prompt: string): string => createHash('sha256').update(prompt).digest('hex');

export const generateDraftSuggestion = async (
  params: {
    conversationId: string;
    messages: InboxMessageRow[];
    state: ConversationStateRow | null;
    bookedCallLabel?: string;
    contact?: DraftContactContext;
  },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<DraftGenerationResult> => {
  const canonical = getCanonicalSources();
  const orderedMessages = orderMessagesChronologically(params.messages);
  const escalation = classifyEscalationLevel(orderedMessages, params.state);
  const missingFields = missingQualificationFields(params.state);
  const preferredOwnerVoice = normalizeOwnerVoice(params.contact?.ownerLabel);
  const playbookKeywords = extractPlaybookKeywords(canonical.clinicOwnerLanguagePlaybook);

  const examples = await listConversionExamples(
    {
      escalationLevel: escalation.level,
      bookedCallLabel: params.bookedCallLabel,
      preferredOwnerLabel: preferredOwnerVoice,
      limit: MAX_EXAMPLES,
    },
    logger,
  );
  const styleAnchors = preferredOwnerVoice
    ? await listSetterVoiceExamples(
        {
          ownerLabel: preferredOwnerVoice,
          escalationLevel: escalation.level,
          limit: MAX_STYLE_ANCHORS,
        },
        logger,
      )
    : [];
  const rankedExamples = rankConversionExamples({
    examples,
    messages: orderedMessages,
    state: params.state,
    contact: params.contact,
    preferredOwnerVoice,
    playbookKeywords,
  });
  const conversationKeywords = buildConversationKeywords({
    messages: orderedMessages,
    state: params.state,
    contact: params.contact,
  });

  let bestText = '';
  let bestLint: DraftLintResult = {
    passed: false,
    score: 0,
    structuralScore: 0,
    issues: [],
  };
  let lastIssues: DraftLintIssue[] = [];
  let lastPromptHash = '';
  let attempts = 0;
  let generationMode: DraftGenerationResult['generationMode'] = 'ai';
  const generationWarnings: string[] = [];

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    attempts = attempt;
    const prompt = buildPrompt({
      messages: orderedMessages,
      state: params.state,
      escalationLevel: escalation.level,
      escalationReason: escalation.reason,
      missingFields,
      examples: rankedExamples,
      styleAnchors,
      preferredOwnerVoice,
      canonical,
      previousIssues: lastIssues,
      contact: params.contact,
      conversationKeywords,
    });
    lastPromptHash = promptHash(prompt);

    let output = '';
    let usedFallback = false;

    try {
      output = (await generateAiResponse(prompt)).trim();
    } catch (error) {
      logger?.warn?.('AI draft generation failed; using fallback draft', {
        conversationId: params.conversationId,
        attempt,
        error: error instanceof Error ? error.message : String(error),
      });
      const reason = sanitizeInline(error instanceof Error ? error.message : String(error));
      output = buildContextualFallbackDraft({
        messages: orderedMessages,
        state: params.state,
        escalationLevel: escalation.level,
        missingFields,
        contact: params.contact,
        preferredOwnerVoice,
        rankedExamples,
      });
      usedFallback = true;
      generationMode = 'contextual_fallback';
      if (reason) {
        generationWarnings.push(`AI unavailable: ${reason}`);
      }
    }

    const isMissingKey = output === OPENAI_MISSING_KEY_MESSAGE;
    if (!output || isMissingKey) {
      output = buildContextualFallbackDraft({
        messages: orderedMessages,
        state: params.state,
        escalationLevel: escalation.level,
        missingFields,
        contact: params.contact,
        preferredOwnerVoice,
        rankedExamples,
      });
      usedFallback = true;
      generationMode = 'contextual_fallback';
      generationWarnings.push(
        isMissingKey ? 'AI unavailable: missing OpenAI API key.' : 'AI unavailable: empty response.',
      );
    }

    const cleanedOutput = cleanGeneratedVoice(output, preferredOwnerVoice);
    const lint = lintDraft(cleanedOutput);
    const genericIssue: DraftLintIssue | null = hasAiGenericPhrasing(cleanedOutput)
      ? {
          code: 'missing_cta_question',
          message: 'Draft sounds generic and not setter specific.',
          blocking: false,
        }
      : null;
    const effectiveLint: DraftLintResult =
      genericIssue && attempt < MAX_RETRIES
        ? {
            ...lint,
            passed: false,
            score: Math.max(0, lint.score - 18),
            structuralScore: Math.max(0, lint.structuralScore - 10),
            issues: [...lint.issues, genericIssue],
          }
        : lint;

    if (bestText.length === 0 || effectiveLint.score > bestLint.score) {
      bestText = cleanedOutput;
      bestLint = effectiveLint;
    }

    if (effectiveLint.passed || usedFallback) {
      break;
    }

    lastIssues = effectiveLint.issues;
  }

  return {
    text: bestText,
    escalationLevel: escalation.level,
    escalationReason: escalation.reason,
    qualificationStep: qualificationStep(params.state),
    qualificationMissing: missingFields,
    retrievedExamples: rankedExamples,
    styleAnchors,
    promptSnapshotHash: lastPromptHash,
    lint: bestLint,
    attempts,
    generationMode,
    generationWarnings,
    genericToneDetected: hasAiGenericPhrasing(bestText),
  };
};
