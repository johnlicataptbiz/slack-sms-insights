const DEFAULT_ALOWARE_CHANNEL_ID = 'C09ULGH1BEC';

const EXPLICIT_REPLY_PATTERNS = [
  /\bwhat should i say\b/i,
  /\bhow should i respond\b/i,
  /\breply options?\b/i,
  /\btext (?:them|back)\b/i,
  /\bword this\b/i,
  /\bsend (?:a )?(?:text|sms|message)\b/i,
  /\b(draft|write|compose|craft)\s+(?:a\s+)?(?:reply|text|sms|message)\b/i,
  /\b(template|script)\s+(?:for\s+)?(?:a\s+)?(?:reply|text|sms|message)\b/i,
];

const ACTION_THEN_MESSAGE_PATTERN =
  /\b(draft|compose|write|craft|generate|create|suggest|send)\b[\s\S]{0,50}\b(reply|sms|text(?:\s+message)?|message)\b/i;
const MESSAGE_THEN_ACTION_PATTERN =
  /\b(reply|sms|text(?:\s+message)?|message)\b[\s\S]{0,30}\b(draft|compose|write|craft|generate|create|suggest)\b/i;
const RESPOND_INTENT_PATTERN = /\brespond to\b[\s\S]{0,25}\b(them|this|lead|prospect|customer|message)\b/i;

export const REPLY_BLOCKED_MESSAGE = 'Reply generation is disabled for this channel.';

export const isAlowareChannel = (channelId?: string): boolean => {
  if (!channelId) {
    return false;
  }

  const configured = process.env.ALOWARE_CHANNEL_ID?.trim() || DEFAULT_ALOWARE_CHANNEL_ID;
  return channelId === configured;
};

export const isReplyGenerationRequest = (prompt: string): boolean => {
  const normalized = prompt.replace(/\s+/g, ' ').trim();
  if (normalized.length === 0) {
    return false;
  }

  if (EXPLICIT_REPLY_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return true;
  }

  return (
    ACTION_THEN_MESSAGE_PATTERN.test(normalized) ||
    MESSAGE_THEN_ACTION_PATTERN.test(normalized) ||
    RESPOND_INTENT_PATTERN.test(normalized)
  );
};

export const buildAlowareAnalysisPrompt = (prompt: string): string => {
  return [
    'You are assisting in #alowaresmsupdates.',
    'Analysis only. Do not draft customer-facing replies, scripts, or SMS text.',
    'Return concise internal guidance in this structure:',
    'Intent: <Hot|Warm|Cold|Ignore>',
    'Risk flags: <comma-separated or none>',
    'Next internal action: <one action>',
    'Owner suggestion: <role>',
    '',
    `Input: ${prompt}`,
  ].join('\n');
};
