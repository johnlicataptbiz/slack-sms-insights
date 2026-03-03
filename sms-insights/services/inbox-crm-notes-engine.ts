import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import type { Logger } from '@slack/bolt';
import { generateAiResponse } from './ai-response.js';
import type { InboxMessageRow } from './inbox-store.js';

const CRM_NOTES_PROMPT_DOC_PATH = '/Users/jl/Downloads/CRM NOTES PROMPT.docx';
const OPENAI_MISSING_KEY_MESSAGE = 'Set OPENAI_API_KEY in your environment to enable AI replies.';

export type CrmNotesContext = {
  conversationId: string;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  leadSource?: string | null;
  timezone?: string | null;
  ownerLabel?: string | null;
  mondayTrail?: Array<{
    itemName: string | null;
    stage: string | null;
    callDate: string | null;
    updatedAt: string;
  }>;
  messages: InboxMessageRow[];
};

export type CrmNotesGenerationResult = {
  conversationId: string;
  text: string;
  generationMode: 'ai' | 'contextual_fallback';
  generationWarnings: string[];
  promptSnapshotHash: string;
  createdAt: string;
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

const toEpochMs = (value: string): number => {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const sortMessagesChronologically = (messages: InboxMessageRow[]): InboxMessageRow[] => {
  return [...messages].sort((a, b) => {
    const byTime = toEpochMs(a.event_ts) - toEpochMs(b.event_ts);
    if (byTime !== 0) return byTime;
    return a.id.localeCompare(b.id);
  });
};

const formatThreadTranscript = (messages: InboxMessageRow[]): string => {
  const rows = sortMessagesChronologically(messages);
  if (rows.length === 0) return 'No messages available.';
  return rows
    .map((message) => {
      const speaker =
        message.direction === 'inbound'
          ? 'Lead'
          : message.aloware_user && message.aloware_user.trim().length > 0
            ? message.aloware_user.trim()
            : 'Setter';
      const text = (message.body || '').trim() || '(empty)';
      return `[${message.event_ts}] ${speaker}: ${text}`;
    })
    .join('\n');
};

const digitsOnlyPhone = (value: string | null | undefined): string => {
  const digits = (value || '').replace(/\D+/g, '');
  return digits.length > 0 ? digits : 'Not specified';
};

const resolveApptLine = (context: CrmNotesContext): string => {
  const nextBooked = (context.mondayTrail || [])
    .filter((row) => row.callDate && row.callDate.trim().length > 0)
    .sort((a, b) => toEpochMs(a.callDate || '') - toEpochMs(b.callDate || ''))
    .find(Boolean);
  if (!nextBooked?.callDate) return 'Not specified';
  return nextBooked.callDate;
};

const extractAdvisor = (context: CrmNotesContext): string => {
  if (context.ownerLabel && context.ownerLabel.trim().length > 0) return context.ownerLabel.trim();
  const firstNamedItem = (context.mondayTrail || []).find((row) => row.itemName && row.itemName.trim().length > 0);
  if (firstNamedItem?.itemName) return firstNamedItem.itemName.trim();
  return 'Not specified';
};

const stripFences = (value: string): string => value.replace(/^```(?:markdown|md|txt)?\s*/i, '').replace(/\s*```$/i, '');

const hasExpectedHeading = (value: string): boolean =>
  value.includes('📋 CRM Notes – Discovery Call (Setter → Advisor Handoff)');

const buildFallbackNotes = (context: CrmNotesContext): string => {
  const sorted = sortMessagesChronologically(context.messages);
  const recentBullets = sorted
    .slice(-6)
    .filter((message) => (message.body || '').trim().length > 0)
    .map((message) => {
      const speaker = message.direction === 'inbound' ? 'Lead' : message.aloware_user || 'Setter';
      return `${speaker}: ${(message.body || '').trim()}`;
    })
    .slice(-6);

  const bulletLines =
    recentBullets.length > 0 ? recentBullets.map((row) => `- ${row}`).join('\n') : '- Not specified';

  const leadName = (context.contactName || '').trim() || 'Not specified';
  const email = (context.contactEmail || '').trim() || 'Not specified';
  const source = (context.leadSource || '').trim() || 'Not specified';
  const timezone = (context.timezone || '').trim() || 'Not specified';

  return [
    '📋 CRM Notes – Discovery Call (Setter → Advisor Handoff)',
    '',
    `Lead Name: ${leadName}`,
    '',
    `Phone: ${digitsOnlyPhone(context.contactPhone)}`,
    '',
    `Email: ${email}`,
    '',
    `Source: ${source}`,
    '',
    `Appt Time: ${resolveApptLine(context)}`,
    '',
    `Assigned Advisor: ${extractAdvisor(context)}`,
    '',
    '👤 Stage & Profile',
    '',
    'Stage: Not specified',
    '',
    'Commitment: Not specified',
    '',
    '🎯 Motivation & Goals',
    '',
    'Motivation (Why now?): Not specified',
    '',
    'Primary Goal: Not specified',
    '',
    '📉 Revenue & Bottlenecks',
    '',
    'Current Revenue: Not specified',
    '',
    'Target Revenue: Not specified',
    '',
    'Main Bottleneck #1: Not specified',
    '',
    'Main Bottleneck #2: Not specified',
    '',
    'Pricing: Not specified',
    '',
    '🔍 Additional Notes from Conversation',
    '',
    bulletLines,
    '',
    'Setter Handoff Summary',
    '',
    'Lead details were partially available from SMS thread context only. Advisor should confirm stage, revenue baseline, decision-making structure, and urgency at the beginning of the call.',
  ].join('\n');
};

const buildPrompt = (context: CrmNotesContext): string => {
  const templatePrompt = readDocx(CRM_NOTES_PROMPT_DOC_PATH);
  const threadTranscript = formatThreadTranscript(context.messages);
  const mondayTrail = (context.mondayTrail || [])
    .map((row) => {
      return JSON.stringify({
        itemName: row.itemName,
        stage: row.stage,
        callDate: row.callDate,
        updatedAt: row.updatedAt,
      });
    })
    .join('\n');

  return [
    templatePrompt || 'Generate CRM handoff notes in the required PT Biz format.',
    '',
    '=== LEAD CONTEXT ===',
    `Conversation ID: ${context.conversationId}`,
    `Lead Name: ${(context.contactName || '').trim() || 'Not specified'}`,
    `Phone: ${digitsOnlyPhone(context.contactPhone)}`,
    `Email: ${(context.contactEmail || '').trim() || 'Not specified'}`,
    `Source: ${(context.leadSource || '').trim() || 'Not specified'}`,
    `Timezone: ${(context.timezone || '').trim() || 'Not specified'}`,
    `Assigned advisor hint: ${extractAdvisor(context)}`,
    `Appointment hint: ${resolveApptLine(context)}`,
    '',
    '=== MONDAY / BOOKING TRAIL (if any) ===',
    mondayTrail || 'None',
    '',
    '=== SMS THREAD TRANSCRIPT (chronological) ===',
    threadTranscript,
    '',
    'Return only the final CRM notes with no preamble and no code fences.',
  ].join('\n');
};

export const generateCrmNotesSuggestion = async (
  context: CrmNotesContext,
  logger?: Pick<Logger, 'warn' | 'error'>,
): Promise<CrmNotesGenerationResult> => {
  const prompt = buildPrompt(context);
  const promptSnapshotHash = createHash('sha256').update(prompt).digest('hex');
  const createdAt = new Date().toISOString();

  let output = '';
  let generationMode: CrmNotesGenerationResult['generationMode'] = 'ai';
  const generationWarnings: string[] = [];

  try {
    output = (await generateAiResponse(prompt)).trim();
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    logger?.warn?.('CRM notes generation failed; using fallback', {
      conversationId: context.conversationId,
      reason,
    });
    generationMode = 'contextual_fallback';
    generationWarnings.push(`AI unavailable: ${reason}`);
  }

  if (!output || output === OPENAI_MISSING_KEY_MESSAGE) {
    generationMode = 'contextual_fallback';
    if (output === OPENAI_MISSING_KEY_MESSAGE) {
      generationWarnings.push('AI unavailable: missing OpenAI API key.');
    } else {
      generationWarnings.push('AI unavailable: empty response.');
    }
    output = buildFallbackNotes(context);
  } else {
    output = stripFences(output).trim();
    if (!hasExpectedHeading(output)) {
      generationMode = 'contextual_fallback';
      generationWarnings.push('AI response did not match required CRM format.');
      output = buildFallbackNotes(context);
    }
  }

  return {
    conversationId: context.conversationId,
    text: output,
    generationMode,
    generationWarnings,
    promptSnapshotHash,
    createdAt,
  };
};
