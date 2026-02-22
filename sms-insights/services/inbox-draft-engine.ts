import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Logger } from '@slack/bolt';
import { generateAiResponse } from './ai-response.js';
import type { ConversationStateRow, ConversionExampleRow, InboxMessageRow } from './inbox-store.js';
import { listConversionExamples } from './inbox-store.js';

const CANONICAL_DOC_PATHS = {
  escalationModel: '/Users/jl/Downloads/PT Biz Lead Messaging Escalation Model.docx',
  conversionMessages: '/Users/jl/Downloads/Booked Call Conversion Messages.docx',
  referenceDoc: '/Users/jl/Downloads/PT Biz Reference Doc for Lead Messaging Agents.docx',
  socialLinks: '/Users/jl/Downloads/PT Biz Social Media Links.txt',
} as const;

const OPENAI_MISSING_KEY_MESSAGE = 'Set OPENAI_API_KEY in your environment to enable AI replies.';
const MAX_EXAMPLES = 6;
const MAX_RETRIES = 3;

export type EscalationLevel = 1 | 2 | 3 | 4;

type CanonicalSources = {
  escalationModel: string;
  conversionMessages: string;
  referenceDoc: string;
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
  retrievedExamples: Array<ConversionExampleRow & { outbound_body: string | null }>;
  promptSnapshotHash: string;
  lint: DraftLintResult;
  attempts: number;
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
  message.direction === 'inbound' ? 'Lead' : (message.aloware_user || 'Setter');

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

const fallbackDraft = (missingFields: string[]): string => {
  const nextQuestion =
    missingFields[0] === 'full_or_part_time'
      ? 'Are you full time right now or still part time in clinic?'
      : missingFields[0] === 'niche'
        ? 'What patient niche are you mainly focused on right now?'
        : missingFields[0] === 'revenue_mix'
          ? 'Would you say your revenue is mostly cash, mostly insurance, or balanced right now?'
          : 'How open are you to business coaching if it looks like a fit for your goals?';

  return `Appreciate you sharing that. Quick one so we can map the next step properly. ${nextQuestion}`;
};

const buildPrompt = (params: {
  messages: InboxMessageRow[];
  state: ConversationStateRow | null;
  escalationLevel: EscalationLevel;
  escalationReason: string;
  missingFields: string[];
  examples: Array<ConversionExampleRow & { outbound_body: string | null }>;
  canonical: CanonicalSources;
  previousIssues?: DraftLintIssue[];
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

  const canonicalExamples = parseNumberedExamples(params.canonical.conversionMessages)
    .slice(0, 4)
    .map((example, index) => `Canonical example ${index + 1}:\n${truncate(example, 2400)}`)
    .join('\n\n');

  const retrievedExamples = params.examples
    .slice(0, MAX_EXAMPLES)
    .map((example, index) => {
      return `Retrieved example ${index + 1} (escalation=${example.escalation_level}, booked=${example.booked_call_label || 'unknown'}):\n${truncate(example.outbound_body || '', 900)}`;
    })
    .join('\n\n');

  const previousIssues =
    params.previousIssues && params.previousIssues.length > 0
      ? params.previousIssues.map((issue) => `Issue to fix: ${issue.message}`).join('\n')
      : 'No previous issues.';

  return [
    'You are PT Biz lead reply drafting assistant.',
    'Generate one SMS reply draft only.',
    'STRUCTURAL MIRRORING RULES:',
    '1) Mirror structure, pacing, paragraph spacing, question cadence, and CTA placement from examples.',
    '2) Never use em dash or hyphen characters in output.',
    '3) Never use bullet or numbered list formatting unless a mirrored example does so.',
    '4) Qualification first, coaching advice only if source structure includes it.',
    '5) Required qualification variables: full/part time, niche, cash vs insurance mix, coaching interest.',
    '6) Follow escalation model and cadence logic before drafting.',
    '',
    `Escalation level: ${params.escalationLevel}`,
    `Escalation reason: ${params.escalationReason}`,
    `Missing qualification fields: ${params.missingFields.join(', ') || 'none'}`,
    `Qualification progress step: ${qualificationStep(params.state)}`,
    previousIssues,
    '',
    'Escalation model reference:',
    truncate(params.canonical.escalationModel, 4000),
    '',
    'PT Biz resource reference:',
    truncate(params.canonical.referenceDoc, 2200),
    '',
    'Most recent inbound from lead:',
    latestInboundSummary,
    '',
    'Most recent outbound from setter:',
    latestOutboundSummary,
    `Most recent outbound line: ${latestOutboundLine}`,
    '',
    'Recent conversation window (oldest to newest):',
    truncate(recentThread, 4500),
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
  },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<DraftGenerationResult> => {
  const canonical = getCanonicalSources();
  const orderedMessages = orderMessagesChronologically(params.messages);
  const escalation = classifyEscalationLevel(orderedMessages, params.state);
  const missingFields = missingQualificationFields(params.state);

  const examples = await listConversionExamples(
    {
      escalationLevel: escalation.level,
      bookedCallLabel: params.bookedCallLabel,
      limit: MAX_EXAMPLES,
    },
    logger,
  );

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

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    attempts = attempt;
    const prompt = buildPrompt({
      messages: orderedMessages,
      state: params.state,
      escalationLevel: escalation.level,
      escalationReason: escalation.reason,
      missingFields,
      examples,
      canonical,
      previousIssues: lastIssues,
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
      output = fallbackDraft(missingFields);
      usedFallback = true;
    }

    if (!output || output === OPENAI_MISSING_KEY_MESSAGE) {
      output = fallbackDraft(missingFields);
      usedFallback = true;
    }

    const lint = lintDraft(output);
    if (bestText.length === 0 || lint.score > bestLint.score) {
      bestText = output;
      bestLint = lint;
    }

    if (lint.passed || usedFallback) {
      break;
    }

    lastIssues = lint.issues;
  }

  return {
    text: bestText,
    escalationLevel: escalation.level,
    escalationReason: escalation.reason,
    qualificationStep: qualificationStep(params.state),
    qualificationMissing: missingFields,
    retrievedExamples: examples,
    promptSnapshotHash: lastPromptHash,
    lint: bestLint,
    attempts,
  };
};
