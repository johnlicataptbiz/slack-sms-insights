import { createHash } from 'node:crypto';
import type { Logger } from '@slack/bolt';
import { generateAiResponse } from './ai-response.js';
import { getPool } from './db.js';
import type { InboxMessageRow } from './inbox-store.js';

const OPENAI_MISSING_KEY_MESSAGE = 'Set OPENAI_API_KEY in your environment to enable AI replies.';

// ─── Embedded CRM Notes Prompt ────────────────────────────────────────────────
// This prompt is embedded directly so it works in all environments (local + production).
// It instructs the AI to produce the exact PT Biz setter → advisor handoff format.
const EMBEDDED_CRM_NOTES_PROMPT = `You are a CRM notes writer for PT Biz, a physical therapy business coaching company. Your job is to write structured setter → advisor handoff notes based on an SMS conversation transcript and any available lead context.

REQUIRED OUTPUT FORMAT (copy this structure exactly, including the emoji headers):

📋 CRM Notes – Discovery Call (Setter → Advisor Handoff)

Lead Name: [Full name or "Not specified"]

Phone: [Digits only, e.g. 15162421520, or "Not specified"]

Email: [Email address or "Not specified"]

Source: [Lead magnet / opt-in source or "Not specified"]

Appt Time: [Appointment date and time or "Not specified"]

Assigned Advisor: [Advisor name or "Not specified"]

👤 Stage & Profile

Stage: [e.g. "Pre-launch", "Early stage", "Established", "Hybrid – full time + side practice", etc.]

Commitment: [Describe their current work situation, hours, and how serious they are about building a cash practice]

🎯 Motivation & Goals

Motivation (Why now?): [What triggered them to reach out or book? What is their immediate pain point or catalyst?]

Primary Goal: [What do they ultimately want to achieve with their practice?]

📉 Revenue & Bottlenecks

Current Revenue: [Current monthly or annual revenue from their practice, or "Not specified"]

Target Revenue: [Their revenue goal, or "Not specified"]

Main Bottleneck #1: [The single biggest obstacle they face right now]

Main Bottleneck #2: [The second biggest obstacle, or "Not specified"]

Pricing: [How they currently price their services, or "Not specified"]

🔍 Additional Notes from Conversation

• [Key detail or observation from the SMS thread]
• [Another key detail]
• [Continue with as many bullet points as needed — include positioning used, objections raised, scheduling preferences, geographic info, niche details, lead's response to the setter, etc.]

Setter Handoff Summary

[2–4 sentence paragraph summarizing who this lead is, where they are in their journey, what their biggest challenge is, why they are a good fit (or not), any objections or concerns raised, and what the advisor should focus on in the strategy call. Write this as if briefing the advisor verbally before the call.]

RULES:
- Use "Not specified" when information is genuinely missing — do not guess or fabricate.
- Extract as much detail as possible from the SMS transcript. Read between the lines.
- The Setter Handoff Summary must be a flowing paragraph, not bullet points.
- Do NOT include any preamble, explanation, or code fences — output ONLY the formatted notes.
- The first line of your response MUST be exactly: 📋 CRM Notes – Discovery Call (Setter → Advisor Handoff)
- Keep the section headers exactly as shown (with emoji).`;

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

type SlackBookedCallHint = {
  eventTs: string;
  text: string | null;
  fallback: string;
  slackChannelId: string;
  slackMessageTs: string;
  source: string | null;
  advisor: string | null;
  apptTime: string | null;
};

export type CrmNotesGenerationResult = {
  conversationId: string;
  text: string;
  generationMode: 'ai' | 'contextual_fallback';
  generationWarnings: string[];
  promptSnapshotHash: string;
  createdAt: string;
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

const normalizePhoneKey = (value: string | null | undefined): string | null => {
  const digits = (value || '').replace(/\D+/g, '');
  if (!digits) return null;
  if (digits.length < 10) return null;
  return digits.slice(-10);
};

const normalizeNameKey = (value: string | null | undefined): string | null => {
  const normalized = (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  return normalized.length > 0 ? normalized : null;
};

const parseField = (content: string, labels: string[]): string | null => {
  if (!content) return null;
  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`\\*?${escaped}\\*?\\s*:\\s*([^\\n]+)`, 'i');
    const match = content.match(pattern);
    if (match?.[1]) {
      const value = match[1]
        .trim()
        .replace(/<mailto:[^|>]+\|([^>]+)>/gi, '$1')
        .replace(/<[^|>]+\|([^>]+)>/g, '$1');
      if (value.length > 0) return value;
    }
  }
  return null;
};

const readFallback = (raw: unknown): string => {
  if (!raw || typeof raw !== 'object') return '';
  const typed = raw as { attachments?: Array<{ fallback?: string }> };
  const first = Array.isArray(typed.attachments) ? typed.attachments[0] : null;
  return (first?.fallback || '').trim();
};

const listSlackBookedCallHints = async (
  context: CrmNotesContext,
  logger?: Pick<Logger, 'warn' | 'error'>,
): Promise<SlackBookedCallHint[]> => {
  const pool = getPool();
  if (!pool) return [];

  const phoneKey = normalizePhoneKey(context.contactPhone);
  const nameKey = normalizeNameKey(context.contactName);
  if (!phoneKey && !nameKey) return [];

  try {
    const { rows } = await pool.query<{
      event_ts: string;
      text: string | null;
      raw: unknown;
      slack_channel_id: string;
      slack_message_ts: string;
    }>(
      `
      SELECT
        bc.event_ts::text,
        bc.text,
        bc.raw,
        bc.slack_channel_id,
        bc.slack_message_ts
      FROM booked_calls bc
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(
            NULLIF((regexp_match(COALESCE(bc.raw #>> '{attachments,0,fallback}', ''), '\\*(?:Phone|Phone Number|Mobile Phone)\\*:\\s*([^\\n]+)'))[1], ''),
            NULLIF((regexp_match(COALESCE(bc.text, ''), '(\\+?\\d[\\d\\s().-]{8,}\\d)'))[1], '')
          ) AS phone_raw,
          COALESCE(
            NULLIF((regexp_match(COALESCE(bc.raw #>> '{attachments,0,fallback}', ''), '\\*(?:Name|Contact Name)\\*:\\s*([^\\n]+)'))[1], ''),
            NULLIF(trim(concat_ws(' ',
              (regexp_match(COALESCE(bc.raw #>> '{attachments,0,fallback}', ''), '\\*First Name\\*:\\s*([^\\n]+)'))[1],
              (regexp_match(COALESCE(bc.raw #>> '{attachments,0,fallback}', ''), '\\*Last Name\\*:\\s*([^\\n]+)'))[1]
            )), '')
          ) AS name_raw
      ) parsed ON TRUE
      WHERE (
        ($1::text IS NOT NULL AND right(regexp_replace(COALESCE(parsed.phone_raw, ''), '\\D', '', 'g'), 10) = $1::text)
        OR
        ($2::text IS NOT NULL AND lower(regexp_replace(COALESCE(parsed.name_raw, ''), '\\s+', ' ', 'g')) = $2::text)
      )
      ORDER BY bc.event_ts DESC
      LIMIT 5
      `,
      [phoneKey, nameKey],
    );

    return rows.map((row) => {
      const fallback = readFallback(row.raw);
      const merged = [fallback, row.text || ''].join('\n');
      return {
        eventTs: row.event_ts,
        text: row.text,
        fallback,
        slackChannelId: row.slack_channel_id,
        slackMessageTs: row.slack_message_ts,
        source: parseField(merged, ['Source', 'Lead Source', 'Opt-in', 'Funnel']),
        advisor: parseField(merged, ['Assigned Advisor', 'Advisor', 'Setter']),
        apptTime: parseField(merged, ['Appt Time', 'Appointment Time', 'Appointment', 'Call Time', 'Call Date']),
      };
    });
  } catch (error) {
    logger?.warn?.('Failed to load slack booked call hints for CRM notes', {
      conversationId: context.conversationId,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
};

const resolveApptLine = (context: CrmNotesContext, slackBookedCalls: SlackBookedCallHint[]): string => {
  const latestSlack = slackBookedCalls.find((row) => row.apptTime && row.apptTime.trim().length > 0);
  if (latestSlack?.apptTime) return latestSlack.apptTime.trim();
  const nextBooked = (context.mondayTrail || [])
    .filter((row) => row.callDate && row.callDate.trim().length > 0)
    .sort((a, b) => toEpochMs(a.callDate || '') - toEpochMs(b.callDate || ''))
    .find(Boolean);
  if (!nextBooked?.callDate) return 'Not specified';
  return nextBooked.callDate;
};

const extractAdvisor = (context: CrmNotesContext, slackBookedCalls: SlackBookedCallHint[]): string => {
  const latestSlack = slackBookedCalls.find((row) => row.advisor && row.advisor.trim().length > 0);
  if (latestSlack?.advisor) return latestSlack.advisor.trim();
  if (context.ownerLabel && context.ownerLabel.trim().length > 0) return context.ownerLabel.trim();
  const firstNamedItem = (context.mondayTrail || []).find((row) => row.itemName && row.itemName.trim().length > 0);
  if (firstNamedItem?.itemName) return firstNamedItem.itemName.trim();
  return 'Not specified';
};

const stripFences = (value: string): string =>
  value.replace(/^```(?:markdown|md|txt)?\s*/i, '').replace(/\s*```$/i, '');

const hasExpectedHeading = (value: string): boolean =>
  value.includes('📋 CRM Notes – Discovery Call (Setter → Advisor Handoff)');

const resolveSource = (context: CrmNotesContext, slackBookedCalls: SlackBookedCallHint[]): string => {
  const latestSlack = slackBookedCalls.find((row) => row.source && row.source.trim().length > 0);
  if (latestSlack?.source) return latestSlack.source.trim();
  return (context.leadSource || '').trim() || 'Not specified';
};

const buildFallbackNotes = (context: CrmNotesContext, slackBookedCalls: SlackBookedCallHint[]): string => {
  const sorted = sortMessagesChronologically(context.messages);
  const recentBullets = sorted
    .slice(-6)
    .filter((message) => (message.body || '').trim().length > 0)
    .map((message) => {
      const speaker = message.direction === 'inbound' ? 'Lead' : message.aloware_user || 'Setter';
      return `${speaker}: ${(message.body || '').trim()}`;
    })
    .slice(-6);

  const bulletLines = recentBullets.length > 0 ? recentBullets.map((row) => `- ${row}`).join('\n') : '- Not specified';

  const leadName = (context.contactName || '').trim() || 'Not specified';
  const email = (context.contactEmail || '').trim() || 'Not specified';
  const source = resolveSource(context, slackBookedCalls);
  const _timezone = (context.timezone || '').trim() || 'Not specified';

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
    `Appt Time: ${resolveApptLine(context, slackBookedCalls)}`,
    '',
    `Assigned Advisor: ${extractAdvisor(context, slackBookedCalls)}`,
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

const buildPrompt = (context: CrmNotesContext, slackBookedCallsSection: SlackBookedCallHint[]): string => {
  const templatePrompt = EMBEDDED_CRM_NOTES_PROMPT;
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

  const slackBookedCalls = slackBookedCallsSection
    .map((row) =>
      JSON.stringify({
        eventTs: row.eventTs,
        source: row.source,
        advisor: row.advisor,
        apptTime: row.apptTime,
        slackChannelId: row.slackChannelId,
        slackMessageTs: row.slackMessageTs,
        text: row.text,
        fallback: row.fallback,
      }),
    )
    .join('\n');

  return [
    templatePrompt || 'Generate CRM handoff notes in the required PT Biz format.',
    '',
    '=== LEAD CONTEXT ===',
    `Conversation ID: ${context.conversationId}`,
    `Lead Name: ${(context.contactName || '').trim() || 'Not specified'}`,
    `Phone: ${digitsOnlyPhone(context.contactPhone)}`,
    `Email: ${(context.contactEmail || '').trim() || 'Not specified'}`,
    `Source: ${resolveSource(context, slackBookedCallsSection)}`,
    `Timezone: ${(context.timezone || '').trim() || 'Not specified'}`,
    `Assigned advisor hint: ${extractAdvisor(context, slackBookedCallsSection)}`,
    `Appointment hint: ${resolveApptLine(context, slackBookedCallsSection)}`,
    '',
    '=== SLACK BOOKED CALL DETAILS (matched by phone/name) ===',
    slackBookedCalls || 'None',
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
  const slackBookedCalls = await listSlackBookedCallHints(context, logger);
  const prompt = buildPrompt(context, slackBookedCalls);
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
    output = buildFallbackNotes(context, slackBookedCalls);
  } else {
    output = stripFences(output).trim();
    if (!hasExpectedHeading(output)) {
      // AI produced content but without the exact heading — prepend it rather than
      // discarding the AI's work and falling back to "Not specified" for everything.
      generationWarnings.push('AI response was missing the expected heading; heading prepended.');
      output = `📋 CRM Notes – Discovery Call (Setter → Advisor Handoff)\n\n${output}`;
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
