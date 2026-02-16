import { isAlowareChannel } from "./aloware-policy.js";

const DEFAULT_INBOUND_PATTERN =
  "\\b(has\\s+received\\s+an\\s+sms|received\\s+an\\s+sms|inbound|incoming)\\b";
const DEFAULT_OUTBOUND_PATTERN =
  "\\b(has\\s+sent\\s+an\\s+sms|sent\\s+an\\s+sms|outbound|outgoing)\\b";
const DEFAULT_PROMISING_PATTERN =
  /\b(book|booking|schedule|scheduled|availability|available|strategy call|appointment|call|meeting|zoom|works best|today|tomorrow|this week|next week|interested|let'?s do it|sounds good|yes|yep|yeah|sure|can do|works for me|that works|good for me|open to|follow up|question|curious)\b/i;
const NEGATIVE_SIGNAL_PATTERN =
  /\b(not interested|unsubscribe|stop|wrong number|remove me|delete me|don'?t contact|no thanks|not now|leave me alone)\b/i;
const LOW_SIGNAL_ONLY_PATTERN =
  /^(thanks!?|thank you!?|yes!?|yep!?|ok!?|okay!?|awesome!?|sounds good!?|great!?|perfect!?|got it!?)$/i;
const BOOKING_KEYWORD_PATTERN =
  /\b(book|booking|schedule|scheduled|appointment|strategy call|consult|consultation|call|meeting|demo|chat)\b/i;
const AVAILABILITY_PATTERN =
  /\b(available|availability|free|open|works|can do|can meet|can talk|good for me|works for me|that works|anytime)\b/i;
const DATE_OR_DAY_PATTERN =
  /\b(today|tomorrow|tonight|this week|next week|monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|thur|fri|sat|sun|jan|january|feb|february|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/i;
const CLOCK_TIME_PATTERN =
  /\b(?:at\s*)?(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s?(?:am|pm)?\b/i;
const RANGE_TIME_PATTERN =
  /\b(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s?(?:am|pm)?\s?(?:-|to)\s?(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s?(?:am|pm)?\b/i;
const DATE_NUMERIC_PATTERN = /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/;
const HIGH_INTENT_PHRASE_PATTERN =
  /\b(let'?s do it|ready to book|want to book|i can do|works for me|good for me|send (?:me )?(?:the )?link|book me|set it up)\b/i;
const QUESTION_OR_ENGAGEMENT_PATTERN =
  /(?:\?|how much|cost|price|details|info|information|what time|when can|where do we|how do we)/i;

const DEFAULT_ALERT_PREFIX = "[Lead Watcher]";
const DEFAULT_ASSIGNEE = "balanced";

type LeadWatcherAssignee = "balanced" | "brandon" | "jack";
type LeadSignalType = "booking" | "interest";
type LeadSignalAssessment = {
  hasSpecificAvailability: boolean;
  nextStep: string;
  reason: string;
  signalType: LeadSignalType;
};

type LeadWatcherConfig = {
  brandonUserId: string;
  channelId: string;
  defaultAssignee: LeadWatcherAssignee;
  enabled: boolean;
  inboundPattern: RegExp;
  inboundRaw: string;
  jackUserId: string;
  outboundPattern: RegExp;
  outboundRaw: string;
  rawBroadcastAlerts: string;
  rawBrandonUserId: string;
  rawChannelId: string;
  rawDefaultAssignee: string;
  rawEnabled: string;
  rawJackUserId: string;
};

export type LeadWatcherAttachment = {
  fallback?: string;
  fields?: Array<{
    title?: string;
    value?: string;
  }>;
  text?: string;
  title?: string;
};

export type LeadWatcherMessageInput = {
  attachments?: LeadWatcherAttachment[];
  channelId?: string;
  text?: string;
  threadTs?: string;
  ts?: string;
};

export type LeadWatcherAlert = {
  assigneeUserId: string;
  channelId: string;
  signalType: LeadSignalType;
  text: string;
  blocks?: any[];
  threadTs: string;
};

let cachedConfig: LeadWatcherConfig | undefined;

const sanitize = (value: string): string => {
  return value.replace(/\s+/g, " ").trim();
};

const stripSlackLinkMarkup = (value: string): string => {
  return value.replace(/<[^|>]+\|([^>]+)>/g, "$1");
};

const compilePattern = (patternText: string, fallback: string): RegExp => {
  try {
    return new RegExp(patternText, "i");
  } catch {
    return new RegExp(fallback, "i");
  }
};

const parseBoolean = (value: string, fallback: boolean): boolean => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return fallback;
  }
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return fallback;
};

const parseAssignee = (value: string): LeadWatcherAssignee => {
  const normalized = value.trim().toLowerCase();
  if (
    normalized === "brandon" ||
    normalized === "jack" ||
    normalized === "balanced"
  ) {
    return normalized;
  }
  return DEFAULT_ASSIGNEE;
};

const getConfig = (): LeadWatcherConfig => {
  const rawEnabled = process.env.ALOWARE_WATCHER_ENABLED?.trim() || "";
  const rawChannelId = process.env.ALOWARE_WATCHER_CHANNEL_ID?.trim() || "";
  const rawBrandonUserId =
    process.env.ALOWARE_WATCHER_BRANDON_USER_ID?.trim() || "";
  const rawJackUserId = process.env.ALOWARE_WATCHER_JACK_USER_ID?.trim() || "";
  const rawDefaultAssignee =
    process.env.ALOWARE_WATCHER_DEFAULT_ASSIGNEE?.trim() || "";
  const rawBroadcastAlerts =
    process.env.ALOWARE_WATCHER_BROADCAST_ALERTS?.trim() || "";
  const inboundRaw =
    process.env.ALOWARE_INBOUND_PATTERN?.trim() || DEFAULT_INBOUND_PATTERN;
  const outboundRaw =
    process.env.ALOWARE_OUTBOUND_PATTERN?.trim() || DEFAULT_OUTBOUND_PATTERN;

  if (
    cachedConfig &&
    cachedConfig.rawEnabled === rawEnabled &&
    cachedConfig.rawChannelId === rawChannelId &&
    cachedConfig.rawBrandonUserId === rawBrandonUserId &&
    cachedConfig.rawJackUserId === rawJackUserId &&
    cachedConfig.rawDefaultAssignee === rawDefaultAssignee &&
    cachedConfig.rawBroadcastAlerts === rawBroadcastAlerts &&
    cachedConfig.inboundRaw === inboundRaw &&
    cachedConfig.outboundRaw === outboundRaw
  ) {
    return cachedConfig;
  }

  cachedConfig = {
    rawEnabled,
    rawChannelId,
    rawBrandonUserId,
    rawJackUserId,
    rawDefaultAssignee,
    rawBroadcastAlerts,
    inboundRaw,
    outboundRaw,
    enabled: parseBoolean(rawEnabled, true),
    channelId: rawChannelId,
    brandonUserId: rawBrandonUserId,
    jackUserId: rawJackUserId,
    defaultAssignee: parseAssignee(rawDefaultAssignee),
    inboundPattern: compilePattern(inboundRaw, DEFAULT_INBOUND_PATTERN),
    outboundPattern: compilePattern(outboundRaw, DEFAULT_OUTBOUND_PATTERN),
  };

  return cachedConfig;
};

const extractTextFromAttachments = (
  attachments: LeadWatcherAttachment[] | undefined,
): string => {
  if (!attachments || attachments.length === 0) {
    return "";
  }

  const parts: string[] = [];
  for (const attachment of attachments) {
    if (attachment.title) {
      parts.push(sanitize(stripSlackLinkMarkup(attachment.title)));
    }
    if (attachment.text) {
      parts.push(sanitize(stripSlackLinkMarkup(attachment.text)));
    }
    for (const field of attachment.fields || []) {
      const title = sanitize(field.title || "");
      const value = sanitize(stripSlackLinkMarkup(field.value || ""));
      if (title && value) {
        parts.push(`${title}: ${value}`);
      } else if (value) {
        parts.push(value);
      }
    }
    if (attachment.fallback) {
      parts.push(sanitize(stripSlackLinkMarkup(attachment.fallback)));
    }
  }
  return sanitize(parts.join(" "));
};

const extractMessageText = (message: LeadWatcherMessageInput): string => {
  const text = sanitize(stripSlackLinkMarkup(message.text || ""));
  if (text.length > 0) {
    return text;
  }
  return extractTextFromAttachments(message.attachments);
};

const extractBody = (text: string): string => {
  const match = text.match(/Message([\s\S]*)$/i);
  if (!match?.[1]) {
    return sanitize(text);
  }
  return sanitize(match[1])
    .replace(/^[:\-\s]+/, "")
    .trim();
};

const extractContactLabel = (text: string): string => {
  const withPhone = text.match(
    /contact[:\s-]*([^(\n]+?)\s*\(\s*(\+?[0-9][0-9()\-\s]{7,})\s*\)/i,
  );
  if (withPhone) {
    const name = sanitize(withPhone[1] || "Unknown");
    const phone = sanitize(withPhone[2] || "");
    return phone.length > 0 ? `${name} (${phone})` : name;
  }

  const nameOnly = text.match(/contact[:\s-]*([^\n]+)$/i);
  if (nameOnly?.[1]) {
    return sanitize(nameOnly[1]);
  }
  return "Unknown lead";
};

const detectInboundEvent = (
  text: string,
  config: LeadWatcherConfig,
): boolean => {
  const normalized = text.toLowerCase();
  const inbound = config.inboundPattern.test(normalized);
  const outbound = config.outboundPattern.test(normalized);
  if (inbound && !outbound) {
    return true;
  }
  if (outbound && !inbound) {
    return false;
  }
  if (!inbound && !outbound) {
    return false;
  }

  const inboundIndex = normalized.search(/\b(received|inbound|incoming)\b/i);
  const outboundIndex = normalized.search(/\b(sent|outbound|outgoing)\b/i);
  if (inboundIndex < 0) {
    return false;
  }
  if (outboundIndex < 0) {
    return true;
  }
  return inboundIndex > outboundIndex;
};

const detectLeadSignal = (body: string): LeadSignalType | undefined => {
  const assessment = detectLeadSignalAssessment(body);
  return assessment?.signalType;
};

const detectLeadSignalAssessment = (
  body: string,
): LeadSignalAssessment | undefined => {
  const normalizedBody = sanitize(body);
  if (!normalizedBody) {
    return undefined;
  }
  if (NEGATIVE_SIGNAL_PATTERN.test(normalizedBody)) {
    return undefined;
  }

  const hasBookingKeyword = BOOKING_KEYWORD_PATTERN.test(normalizedBody);
  const hasAvailabilityLanguage = AVAILABILITY_PATTERN.test(normalizedBody);
  const hasDateOrDay = DATE_OR_DAY_PATTERN.test(normalizedBody);
  const hasClockTime =
    CLOCK_TIME_PATTERN.test(normalizedBody) ||
    RANGE_TIME_PATTERN.test(normalizedBody) ||
    DATE_NUMERIC_PATTERN.test(normalizedBody);
  const hasSpecificAvailability =
    (hasDateOrDay && hasClockTime) ||
    (hasClockTime && hasAvailabilityLanguage) ||
    (hasDateOrDay && hasAvailabilityLanguage);
  const hasHighIntentPhrase = HIGH_INTENT_PHRASE_PATTERN.test(normalizedBody);
  const hasPromisingKeyword = DEFAULT_PROMISING_PATTERN.test(normalizedBody);
  const hasEngagementSignal =
    QUESTION_OR_ENGAGEMENT_PATTERN.test(normalizedBody);

  if (
    LOW_SIGNAL_ONLY_PATTERN.test(normalizedBody) &&
    !hasSpecificAvailability &&
    !hasBookingKeyword &&
    !hasHighIntentPhrase
  ) {
    return undefined;
  }

  if (hasBookingKeyword || hasSpecificAvailability || hasHighIntentPhrase) {
    const reason = hasSpecificAvailability
      ? "shared specific availability"
      : hasBookingKeyword
        ? "used explicit booking language"
        : "showed clear readiness to schedule";
    const nextStep = hasSpecificAvailability
      ? "Confirm timezone and lock one of the proposed times."
      : "Offer two concrete time options and send a booking link.";
    return {
      hasSpecificAvailability,
      nextStep,
      reason,
      signalType: "booking",
    };
  }

  if (hasPromisingKeyword || hasEngagementSignal) {
    return {
      hasSpecificAvailability: false,
      nextStep: "Reply with a clear CTA and propose a specific time to chat.",
      reason: hasEngagementSignal
        ? "asked an engaged follow-up question"
        : "showed positive engagement",
      signalType: "interest",
    };
  }

  return undefined;
};

export const extractOwnerHint = (
  text: string,
): "brandon" | "jack" | undefined => {
  const normalized = text.toLowerCase();
  if (/\b(brandon\s+erwin|brandon)\b/i.test(normalized)) {
    return "brandon";
  }
  if (/\b(jack\s+licata|jack)\b/i.test(normalized)) {
    return "jack";
  }
  return undefined;
};

export const extractPhoneNumber = (messageText: string): string | undefined => {
  const phoneMatch = messageText.match(/(\+?[0-9][0-9()\-\s]{7,})/);
  if (phoneMatch?.[1]) {
    return phoneMatch[1].replace(/\D/g, "");
  }
  return undefined;
};

export { extractMessageText, extractBody, extractContactLabel };

const extractConversationKey = (
  messageText: string,
  message: LeadWatcherMessageInput,
): string => {
  const phoneMatch = messageText.match(/(\+?[0-9][0-9()\-\s]{7,})/);
  if (phoneMatch?.[1]) {
    return phoneMatch[1].replace(/\D/g, "");
  }
  const contactMatch = messageText.match(/contact[:\s-]*([^\n(]+)/i);
  if (contactMatch?.[1]) {
    return sanitize(contactMatch[1]).toLowerCase();
  }
  return `${message.threadTs || ""}:${message.ts || ""}`;
};

const hashConversationKey = (value: string): number => {
  let hash = 0;
  for (const char of value) {
    hash = (hash + char.charCodeAt(0)) % 2147483647;
  }
  return hash;
};

const chooseAssignee = (
  messageText: string,
  message: LeadWatcherMessageInput,
  config: LeadWatcherConfig,
): string | undefined => {
  const ownerHint = extractOwnerHint(messageText);
  if (ownerHint === "brandon" && config.brandonUserId) {
    return config.brandonUserId;
  }
  if (ownerHint === "jack" && config.jackUserId) {
    return config.jackUserId;
  }

  if (config.defaultAssignee === "brandon" && config.brandonUserId) {
    return config.brandonUserId;
  }
  if (config.defaultAssignee === "jack" && config.jackUserId) {
    return config.jackUserId;
  }

  if (config.brandonUserId && config.jackUserId) {
    const key = extractConversationKey(messageText, message);
    return hashConversationKey(key) % 2 === 0
      ? config.brandonUserId
      : config.jackUserId;
  }

  if (config.brandonUserId) {
    return config.brandonUserId;
  }
  if (config.jackUserId) {
    return config.jackUserId;
  }

  return undefined;
};

const buildAlertText = ({
  assigneeUserId,
  contactLabel,
  messageBody,
  signalAssessment,
}: {
  assigneeUserId: string;
  contactLabel: string;
  messageBody: string;
  signalAssessment: LeadSignalAssessment;
}): string => {
  const signalLabel =
    signalAssessment.signalType === "booking"
      ? "booking-ready lead"
      : "engaged lead";
  const snippet =
    messageBody.length > 220 ? `${messageBody.slice(0, 217)}...` : messageBody;
  const availabilityHint = signalAssessment.hasSpecificAvailability
    ? "\n• Scheduling detail detected in message."
    : "";
  return [
    `${DEFAULT_ALERT_PREFIX} <@${assigneeUserId}> ${signalLabel} from *${contactLabel}*.`,
    `• Why flagged: ${signalAssessment.reason}.${availabilityHint}`.replace(
      /\.\n•/g,
      "\n•",
    ),
    `• Suggested next step: ${signalAssessment.nextStep}`,
    `> ${snippet}`,
  ].join("\n");
};

const buildAlertBlocks = ({
  assigneeUserId,
  contactLabel,
  messageBody,
  signalAssessment,
}: {
  assigneeUserId: string;
  contactLabel: string;
  messageBody: string;
  signalAssessment: LeadSignalAssessment;
}): any[] => {
  const isBooking = signalAssessment.signalType === "booking";
  const headerText = isBooking
    ? "📅 Booking Opportunity Detected"
    : "👀 Engaged Lead Detected";
  const snippet =
    messageBody.length > 300 ? `${messageBody.slice(0, 297)}...` : messageBody;

  return [
    {
      type: "header",
      text: {
        type: "plain_text",
        text: headerText,
        emoji: true,
      },
    },
    {
      type: "section",
      fields: [
        {
          type: "mrkdwn",
          text: `*Lead Contact:*\n${contactLabel}`,
        },
        {
          type: "mrkdwn",
          text: `*Assigned To:*\n<@${assigneeUserId}>`,
        },
      ],
    },
    {
      type: "divider",
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Why flagged:*\n${signalAssessment.reason}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Suggested Next Step:*\n${signalAssessment.nextStep}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `> ${snippet.replace(/\n/g, "\n> ")}`,
        },
      ],
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "🤖 *SMS Insights AI*",
        },
      ],
    },
  ];
};

export const isLeadWatcherEnabledForChannel = (channelId?: string): boolean => {
  const config = getConfig();
  if (!config.enabled || !channelId) {
    return false;
  }

  if (config.channelId) {
    return channelId === config.channelId;
  }

  return isAlowareChannel(channelId);
};

export const shouldBroadcastLeadWatcherAlerts = (): boolean => {
  const config = getConfig();
  return parseBoolean(config.rawBroadcastAlerts, false);
};

export const buildLeadWatcherAlert = (
  message: LeadWatcherMessageInput,
): LeadWatcherAlert | undefined => {
  if (!isLeadWatcherEnabledForChannel(message.channelId)) {
    return undefined;
  }

  const config = getConfig();
  const threadTs = message.threadTs || message.ts;
  if (!threadTs || !message.channelId) {
    return undefined;
  }

  const messageText = extractMessageText(message);
  if (messageText.length === 0 || messageText.includes(DEFAULT_ALERT_PREFIX)) {
    return undefined;
  }

  // Check if it's an inbound message for HubSpot sync
  const isInbound = detectInboundEvent(messageText, config);

  // If not inbound AND not a specific lead signal, we skip
  if (!isInbound) {
    return undefined;
  }

  const messageBody = extractBody(messageText);
  const signalAssessment = detectLeadSignalAssessment(messageBody);

  // Build the alert only if it's a "promising" signal
  if (!signalAssessment) {
    return undefined;
  }

  const assigneeUserId = chooseAssignee(messageText, message, config);
  if (!assigneeUserId) {
    return undefined;
  }

  const contactLabel = extractContactLabel(messageText);
  return {
    assigneeUserId,
    channelId: message.channelId,
    threadTs,
    signalType: signalAssessment.signalType,
    text: buildAlertText({
      assigneeUserId,
      contactLabel,
      messageBody,
      signalAssessment,
    }),
    blocks: buildAlertBlocks({
      assigneeUserId,
      contactLabel,
      messageBody,
      signalAssessment,
    }),
  };
};

export const getHubSpotSyncData = (message: LeadWatcherMessageInput) => {
  const config = getConfig();
  const messageText = extractMessageText(message);
  if (!messageText || !detectInboundEvent(messageText, config)) {
    return undefined;
  }

  const messageBody = extractBody(messageText);
  return {
    phoneNumber: extractPhoneNumber(messageText),
    contactLabel: extractContactLabel(messageText),
    messageBody,
    signalType: detectLeadSignalAssessment(messageBody)?.signalType,
  };
};

export const __resetLeadWatcherConfigCacheForTests = (): void => {
  cachedConfig = undefined;
};
