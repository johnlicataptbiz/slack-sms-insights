import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import type { Logger } from '@slack/bolt';
import { generateAiResponse } from './ai-response.js';
import {
  type ConversationStateRow,
  listConversionExamples,
  type InboxMessageRow,
  type ConversionExampleRow,
} from './inbox-store.js';

const CANONICAL_DOC_PATHS = {
  escalationModel: '/Users/jl/Downloads/PT Biz Lead Messaging Escalation Model.docx',
  conversionMessages: '/Users/jl/Downloads/Booked Call Conversion Messages.docx',
  referenceDoc: '/Users/jl/Downloads/PT Biz Reference Doc for Lead Messaging Agents.docx',
  socialLinks: '/Users/jl/Downloads/PT Biz Social Media Links.txt',
} as const;

const OPENAI_MISSING_KEY_MESSAGE = 'Set OPENAI_API_KEY in your environment to enable AI replies.';
const MAX_EXAMPLES = 6;
const MAX_RETRIES = 3;

type CanonicalSources = {
  escalationModel: string;
  conversionMessages: string;
  referenceDoc: string;
  socialLinks: string;
};

let canonicalSourcesCache: CanonicalSources | null = null;

type EscalationLevel = 1 | 2 | 3 | 4;

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

const safeReadTextFile = (path: string): string => {
  try {
    const content = execFileSync('cat', [path], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return content.trim();
  } catch {
    return '';
  }
};

const convertDocxToText = (path: string): string => {
  try {
    const output = execFileSync('textutil', ['-convert', 'txt', '-stdout', path], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 4 * 1024 * 1024,
    });
    return output.trim();
  } catch {
    return '';
  }
};

const getCanonicalSources = (): CanonicalSources => {
  if (canonicalSourcesCache) return canonicalSourcesCache;

  canonicalSourcesCache = {
    escalationModel: convertDocxToText(CANONICAL_DOC_PATHS.escalationModel),
    conversionMessages: convertDocxToText(CANONICAL_DOC_PATHS.conversionMessages),
    referenceDoc: convertDocxToText(CANONICAL_DOC_PATHS.referenceDoc),
    socialLinks: safeReadTextFile(CANONICAL_DOC_PATHS.socialLinks),
  };

  return canonicalSourcesCache;
};

const normalizeText = (value: string): string => value.replace(/\s+/g, ' ').trim().toLowerCase();

const hasAny = (text: string, patterns: RegExp[]): boolean => patterns.some((pattern) => pattern.test(text));

const LEVEL_1_PATTERNS = [
  /student/i,
  /maybe someday/i,
  /seems saturated/i,
  /i don't know yet/i,
  /no timeline/i,
  /just curious/i,
  /idea phase/i,
];
const LEVEL_2_PATTERNS = [
  /too expensive/i,
  /no time/i,
  /spouse/i,
  /market saturated/i,
  /patients won't pay cash/i,
  /not sure i can afford/i,
  /fear/i,
  /hesitant/i,
  /objection/i,
];
const LEVEL_3_PATTERNS = [
  /part.?time/i,
  /full.?time/i,
  /cash/i,
  /within\s+\d+\s*(months|month)/i,
  /revenue goal/i,
  /strategy call/i,
  /book/i,
  /open to call/i,
];
const LEVEL_4_PATTERNS = [
  /stuck/i,
  /plateau/i,
  /hiring/i,
  /cash flow/i,
  /overwhelmed/i,
  /systems/i,
  /scale/i,
  /300k/i,
  /400k/i,
  /150k/i,
];

const classifyEscalationLevel = (messages: InboxMessageRow[], state?: ConversationStateRow | null) => {
  if (state?.escalation_overridden && state?.escalation_level) {
    return {
      level: state.escalation_level,
      reason: 'manual escalation override',
    };
  }

  const recentInbound = messages
    .filter((msg) => msg.direction === 'inbound' && Boolean(msg.body))
    .slice(-6)
    .map((msg) => msg.body || '')
    .join(' \n ');

  const normalized = normalizeText(recentInbound);

  if (hasAny(normalized, LEVEL_4_PATTERNS)) {
    return { level: 4 as EscalationLevel, reason: 'scaling/plateau signal detected' };
  }
  if (hasAny(normalized, LEVEL_2_PATTERNS)) {
    return { level: 2 as EscalationLevel, reason: 'objection signal detected' };
  }
  if (hasAny(normalized, LEVEL_1_PATTERNS)) {
    return { level: 1 as EscalationLevel, reason: 'awareness stage signal detected' };
  }
  if (hasAny(normalized, LEVEL_3_PATTERNS)) {
    return { level: 3 as EscalationLevel, reason: 'transition/call readiness signal detected' };
  }

  return {
    level: (state?.escalation_level || 1) as EscalationLevel,
    reason: 'default escalation from state baseline',
  };
};

const getQualificationMissingFields = (state: ConversationStateRow | null): string[] => {
  const missing: string[] = [];
  if (!state || state.qualification_full_or_part_time === 'unknown') missing.push('full_or_part_time');
  if (!state || !state.qualification_niche || state.qualification_niche.trim().length === 0) missing.push('niche');
  if (!state || state.qualification_revenue_mix === 'unknown') missing.push('revenue_mix');
  if (!state || state.qualification_coaching_interest === 'unknown') missing.push('coaching_interest');
  return missing;
};

const getQualificationStep = (state: ConversationStateRow | null): number => {
  if (!state) return 0;
  return Math.max(0, Math.min(4, Number.isFinite(state.qualification_progress_step) ? state.qualification_progress_step : 0));
};

const parseNumberedExamples = (text: string): string[] => {
  const lines = text.split(/\r?\n/);
  const examples: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^\d+\.\s+/.test(line.trim())) {
      if (current.length > 0) {
        examples.push(current.join('\n').trim());
      }
      current = [line.trim()];
      continue;
    }

    if (current.length > 0) {
      current.push(line);
    }
  }

  if (current.length > 0) examples.push(current.join('\n').trim());

  return examples.filter((entry) => entry.length > 0);
};

const truncate = (value: string, maxChars: number): string => {
  if (value.length <= maxChars) return value;
  return `${value.slice(0, maxChars)}\n\n[TRUNCATED]`;
};

const hasForbiddenDash = (text: string): boolean => {
  // Locked rule: absolute block for em dash and hyphen.
  return /[\u2012\u2013\u2014\u2015\-]/.test(text);
};

const detectLineStacking = (text: string): boolean => {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 8) return false;

  let singleClauseLines = 0;
  for (const line of lines) {
    const words = line.split(/\s+/).filter(Boolean).length;
    if (words <= 4) singleClauseLines += 1;
  }

  return singleClauseLines / lines.length > 0.6;
};

const detectBulletList = (text: string): boolean => {
  return /^\s*(?:[-*•]|\d+\.)\s+/m.test(text);
};

const detectMissingCtaQuestion = (text: string): boolean => {
  return !/\?/.test(text);
};

const detectLongBlockWithoutBreaks = (text: string): boolean => {
  const paragraphs = text.split(/\n\s*\n/).map((value) => value.trim());
  return paragraphs.some((paragraph) => paragraph.length > 1200);
};

export const lintDraft = (text: string): DraftLintResult => {
  const issues: DraftLintIssue[] = [];

  if (hasForbiddenDash(text)) {
    issues.push({
      code: 'forbidden_dash_character',
      message: 'Draft contains forbidden dash characters (hyphen or em dash family).',
      blocking: true,
    });
  }

  if (detectBulletList(text)) {
    issues.push({
      code: 'forbidden_bullet_list',
      message: 'Draft contains bullet or numbered list formatting that was not requested.',
      blocking: true,
    });
  }

  if (detectLineStacking(text)) {
    issues.push({
      code: 'line_stacking_pattern',
      message: 'Draft appears line stacked and may violate natural conversational spacing.',
      blocking: true,
    });
  }

  if (detectMissingCtaQuestion(text)) {
    issues.push({
      code: 'missing_cta_question',
      message: 'Draft does not include a question based CTA.',
      blocking: false,
    });
  }

  if (detectLongBlockWithoutBreaks(text)) {
    issues.push({
      code: 'long_block_without_breaks',
      message: 'Draft includes a long block without paragraph breaks.',
      blocking: false,
    });
  }

  const blockingCount = issues.filter((item) => item.blocking).length;
  const warningCount = issues.length - blockingCount;

  const score = Math.max(0, 100 - blockingCount * 35 - warningCount * 12);
  const structuralScore = Math.max(0, 100 - blockingCount * 20 - warningCount * 15);

  return {
    passed: blockingCount === 0,
    score,
    structuralScore,
    issues,
  };
};

const fallbackDraft = (missingFields: string[]): string => {
  const question =
    missingFields[0] === 'full_or_part_time'
      ? 'Are you currently full time in clinic or still part time right now?'
      : missingFields[0] === 'niche'
        ? 'What type of patients are you mostly trying to serve right now?'
        : missingFields[0] === 'revenue_mix'
          ? 'Would you say your revenue is mostly cash, mostly insurance, or pretty balanced right now?'
          : 'How open are you to business coaching if the fit is right?';

  return `Totally hear you and appreciate you sharing that. Quick question so we can point you in the right direction. ${question}`;
};

const buildPrompt = (params: {
  messages: InboxMessageRow[];
  state: ConversationStateRow | null;
  escalationLevel: EscalationLevel;
  escalationReason: string;
  missingFields: string[];
  examples: Array<ConversionExampleRow & { outbound_body: string | null }>;
  canonicalSources: CanonicalSources;
  previousIssues?: DraftLintIssue[];
}): string => {
  const recentMessages = params.messages
    .slice(-12)
    .map((msg) => `${msg.direction.toUpperCase()}: ${msg.body || ''}`)
    .join('\n');

  const canonicalExamples = parseNumberedExamples(params.canonicalSources.conversionMessages)
    .slice(0, 4)
    .map((example, index) => `Canonical Example ${index + 1}:\n${truncate(example, 2400)}`)
    .join('\n\n');

  const retrieved = params.examples
    .slice(0, MAX_EXAMPLES)
    .map((item, index) => {
      const body = item.outbound_body || '';
      return `Retrieved Example ${index + 1} (escalation=${item.escalation_level}, booked=${item.booked_call_label || 'unknown'}):\n${truncate(body, 900)}`;
    })
    .join('\n\n');

  const previousIssuesText =
    params.previousIssues && params.previousIssues.length > 0
      ? `Previous draft issues to fix:\n${params.previousIssues.map((issue) => `- ${issue.message}`).join('\n')}`
      : 'No previous issues.';

  const prompt = [
    'You are PT Biz SMS drafting assistant for lead replies.',
    'Primary objective is qualification and fit decision, not coaching.',
    'STRICT RULES:',
    '1) Structural mirroring overrides stylistic preference.',
    '2) Never use em dash and never use hyphen in any generated text.',
    '3) No bullet list formatting unless source close uses it.',
    '4) Keep pacing, CTA placement, sentence rhythm, and spacing faithful to examples.',
    '5) Use conversational sales tone and stay commercially grounded.',
    '6) Ask qualification progressively unless mirrored structure stacks questions.',
    '7) Required variables: full/part time, niche, cash vs insurance mix, coaching interest.',
    '8) Follow escalation logic before drafting.',
    '',
    `Detected escalation level: ${params.escalationLevel}`,
    `Escalation reason: ${params.escalationReason}`,
    `Missing qualification fields: ${params.missingFields.join(', ') || 'none'}`,
    `Qualification progress step: ${getQualificationStep(params.state)}`,
    previousIssuesText,
    '',
    'Reference escalation model excerpt:',
    truncate(params.canonicalSources.escalationModel, 4000),
    '',
    'Reference PT Biz messaging assets excerpt:',
    truncate(params.canonicalSources.referenceDoc, 2000),
    '',
    'Recent conversation history:',
    truncate(recentMessages, 2500),
    '',
    retrieved ? `Retrieved successful examples:\n${retrieved}` : 'Retrieved successful examples: none',
    '',
    canonicalExamples,
    '',
    'Return only one send-ready SMS reply draft with natural paragraph spacing and a CTA question.',
  ].join('\n');

  return prompt;
};

const getPromptHash = (value: string): string => {
  return createHash('sha256').update(value).digest('hex');
};

export const generateDraftSuggestion = async (
  params: {
    conversationId: string;
    messages: InboxMessageRow[];
    state: ConversationStateRow | null;
    bookedCallLabel?: string;
  },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<DraftGenerationResult> => {
  const canonicalSources = getCanonicalSources();
  const { level: escalationLevel, reason: escalationReason } = classifyEscalationLevel(params.messages, params.state);
  const missingFields = getQualificationMissingFields(params.state);

  const examples = await listConversionExamples(
    {
      escalationLevel,
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
  let promptHash = '';
  let lastIssues: DraftLintIssue[] = [];
  let attempts = 0;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    attempts = attempt;

    const prompt = buildPrompt({
      messages: params.messages,
      state: params.state,
      escalationLevel,
      escalationReason,
      missingFields,
      examples,
      canonicalSources,
      previousIssues: lastIssues,
    });
    promptHash = getPromptHash(prompt);

    let response = (await generateAiResponse(prompt)).trim();

    if (response === OPENAI_MISSING_KEY_MESSAGE || response.length === 0) {
      response = fallbackDraft(missingFields);
    }

    const lint = lintDraft(response);

    if (lint.score > bestLint.score || bestText.length === 0) {
      bestText = response;
      bestLint = lint;
    }

    if (lint.passed) {
      break;
    }

    lastIssues = lint.issues;
  }

  return {
    text: bestText,
    escalationLevel,
    escalationReason,
    qualificationStep: getQualificationStep(params.state),
    qualificationMissing: missingFields,
    retrievedExamples: examples,
    promptSnapshotHash: promptHash,
    lint: bestLint,
    attempts,
  };
};
