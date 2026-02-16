import { isAlowareChannel } from "./aloware-policy.js";
import {
  type AlowareMessageFields,
  parseAlowareMessage,
} from "./aloware-parser.js";

const DEFAULT_ALERT_PREFIX = "[Lead Watcher]";
const DEFAULT_ASSIGNEE = "balanced";

// 🧪 RIGOROUS INTENT PATTERNS
const BOOKING_INTENT_PATTERNS = [
  /\b(book|booking|schedule|scheduled|appointment|strategy call|consult|consultation|call|meeting|demo|chat)\b/i,
  /\b(let'?s (do it|talk|chat|hop on|get on|speak))\b/i,
  /\b(ready to (start|begin|book|move forward))\b/i,
  /\b(send (me )?(the )?(link|calendar|invite))\b/i,
  /\b(can (we |i )book)\b/i,
];

const AVAILABILITY_PATTERNS = [
  /\b(available|availability|free|open|works|can do|can meet|can talk|good for me|works for me|that works|anytime)\b/i,
  /\b(tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|tonight)\b/i,
  /\b(at\s*)?(?:[01]?\d|2[0-3])(?::[0-5]\d)?\s?(?:am|pm)?\b/i,
  /\b\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?\b/,
];

const INTEREST_SIGNAL_PATTERNS = [
  /\b(interested|curious|tell me more|how much|cost|price|info|information|details|what time|when can|where do we|how do we|worth it)\b/i,
  /\b(sounds (good|interesting|great)|maybe|possibility|worth a look)\b/i,
  /\b(follow up|get back to me|check back)\b/i,
];

const NEGATIVE_SIGNAL_PATTERN =
  /\b(not interested|unsubscribe|stop|wrong number|remove me|delete me|don'?t contact|no thanks|not now|leave me alone|fuck off)\b/i;

const LOW_SIGNAL_ONLY_PATTERN =
  /^(thanks!?|thank you!?|yes!?|yep!?|ok!?|okay!?|awesome!?|sounds good!?|great!?|perfect!?|got it!?)$/i;

export type LeadWatcherAssignee = "balanced" | "brandon" | "jack";
export type LeadSignalType = "booking" | "interest";

export type LeadSignalAssessment = {
  hasSpecificAvailability: boolean;
  nextStep: string;
  reason: string;
  signalType: LeadSignalType;
  tags: string[];
};

type LeadWatcherConfig = {
  brandonUserId: string;
  channelId: string;
  defaultAssignee: LeadWatcherAssignee;
  enabled: boolean;
  jackUserId: string;
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
  tags: string[];
};

let cachedConfig: LeadWatcherConfig | undefined;

const parseBoolean = (value: string, fallback: boolean): boolean => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return fallback;
  return normalized === "true"
    ? true
    : normalized === "false"
      ? false
      : fallback;
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

  if (
    cachedConfig &&
    cachedConfig.rawEnabled === rawEnabled &&
    cachedConfig.rawChannelId === rawChannelId &&
    cachedConfig.rawBrandonUserId === rawBrandonUserId &&
    cachedConfig.rawJackUserId === rawJackUserId &&
    cachedConfig.rawDefaultAssignee === rawDefaultAssignee &&
    cachedConfig.rawBroadcastAlerts === rawBroadcastAlerts
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
    enabled: parseBoolean(rawEnabled, true),
    channelId: rawChannelId,
    brandonUserId: rawBrandonUserId,
    jackUserId: rawJackUserId,
    defaultAssignee: parseAssignee(rawDefaultAssignee),
  };

  return cachedConfig;
};

const detectLeadSignalAssessment = (
  body: string,
): LeadSignalAssessment | undefined => {
  const normalizedBody = body.replace(/\s+/g, " ").trim();
  if (!normalizedBody || NEGATIVE_SIGNAL_PATTERN.test(normalizedBody)) {
    return undefined;
  }

  const hasBookingIntent = BOOKING_INTENT_PATTERNS.some((p) =>
    p.test(normalizedBody),
  );
  const availabilityMatches = AVAILABILITY_PATTERNS.filter((p) =>
    p.test(normalizedBody),
  ).length;
  const hasSpecificAvailability =
    availabilityMatches >= 2 || (hasBookingIntent && availabilityMatches >= 1);
  const isLowSignal = LOW_SIGNAL_ONLY_PATTERN.test(normalizedBody);

  if (isLowSignal && !hasSpecificAvailability && !hasBookingIntent) {
    return undefined;
  }

  if (hasBookingIntent || hasSpecificAvailability) {
    const tags = ["🔥 HOT_BOOKING"];
    if (hasSpecificAvailability) tags.push("📅 SCHEDULING");

    return {
      hasSpecificAvailability,
      nextStep: hasSpecificAvailability
        ? "Confirm the proposed time and lock it in HubSpot immediately."
        : "Send two concrete time options and your booking link.",
      reason: hasSpecificAvailability
        ? "shared specific availability"
        : "ready to book / schedule",
      signalType: "booking",
      tags,
    };
  }

  const hasInterest = INTEREST_SIGNAL_PATTERNS.some((p) =>
    p.test(normalizedBody),
  );
  if (hasInterest) {
    return {
      hasSpecificAvailability: false,
      nextStep:
        "Address the question/interest and push for a 15-min discovery call.",
      reason: "showed engagement or asked a pricing/detail question",
      signalType: "interest",
      tags: ["🤔 INTERESTED"],
    };
  }

  return undefined;
};

export const extractOwnerHint = (
  text: string,
): "brandon" | "jack" | undefined => {
  const normalized = text.toLowerCase();
  if (/\b(brandon\s+erwin|brandon)\b/i.test(normalized)) return "brandon";
  if (/\b(jack\s+licata|jack)\b/i.test(normalized)) return "jack";
  return undefined;
};

const chooseAssignee = (
  fields: AlowareMessageFields,
  config: LeadWatcherConfig,
): { userId: string | undefined; reason: string } => {
  const ownerHint = extractOwnerHint(fields.user + " " + fields.line);
  if (ownerHint === "brandon" && config.brandonUserId)
    return { userId: config.brandonUserId, reason: "Direct owner hint" };
  if (ownerHint === "jack" && config.jackUserId)
    return { userId: config.jackUserId, reason: "Direct owner hint" };

  if (config.defaultAssignee === "brandon" && config.brandonUserId)
    return { userId: config.brandonUserId, reason: "Default assignee" };
  if (config.defaultAssignee === "jack" && config.jackUserId)
    return { userId: config.jackUserId, reason: "Default assignee" };

  if (config.brandonUserId && config.jackUserId) {
    const key = fields.contactPhone || fields.contactName.toLowerCase();
    let hash = 0;
    for (const char of key) hash = (hash + char.charCodeAt(0)) % 2147483647;
    const selection = hash % 2 === 0 ? "brandon" : "jack";
    return {
      userId:
        selection === "brandon" ? config.brandonUserId : config.jackUserId,
      reason: "Balanced round-robin",
    };
  }

  const fallback = config.brandonUserId || config.jackUserId || undefined;
  return {
    userId: fallback,
    reason: fallback ? "Fallback" : "No users configured",
  };
};

const buildAlertBlocks = ({
  assigneeUserId,
  contactLabel,
  messageBody,
  signalAssessment,
  contactId,
  assigneeReason,
}: {
  assigneeUserId: string;
  contactLabel: string;
  messageBody: string;
  signalAssessment: LeadSignalAssessment;
  contactId?: string;
  assigneeReason?: string;
}): any[] => {
  const isBooking = signalAssessment.signalType === "booking";
  const headerText = isBooking
    ? "📅 Booking Opportunity Detected"
    : "👀 Engaged Lead Detected";
  const snippet =
    messageBody.length > 500 ? `${messageBody.slice(0, 497)}...` : messageBody;

  const blocks: any[] = [
    {
      type: "header",
      text: { type: "plain_text", text: headerText, emoji: true },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Lead Contact:* ${contactLabel}\n*Assigned To:* <@${assigneeUserId}> _(${assigneeReason})_\n*Tags:* ${signalAssessment.tags.map((t) => `\`${t}\``).join(" ")}`,
      },
    },
    { type: "divider" },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Reason:* ${signalAssessment.reason}\n*Next Step:* ${signalAssessment.nextStep}`,
      },
    },
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `> ${snippet.replace(/\n/g, "\n> ")}`,
      },
    },
  ];

  if (contactId) {
    blocks.push({
      type: "actions",
      elements: [
        {
          type: "button",
          text: { type: "plain_text", text: "View in Aloware ⚡️", emoji: true },
          url: `https://app.aloware.com/contacts/${contactId}`,
          action_id: "view_aloware_contact",
        },
      ],
    });
  }

  blocks.push({
    type: "context",
    elements: [{ type: "mrkdwn", text: "🤖 *Aloware SMS Insights Tagger*" }],
  });

  return blocks;
};

export const isLeadWatcherEnabledForChannel = (channelId?: string): boolean => {
  const config = getConfig();
  if (!config.enabled || !channelId) return false;
  if (config.channelId) return channelId === config.channelId;
  return isAlowareChannel(channelId);
};

export const buildLeadWatcherAlert = (
  message: LeadWatcherMessageInput,
): LeadWatcherAlert | undefined => {
  if (!message.channelId || !isAlowareChannel(message.channelId))
    return undefined;

  const config = getConfig();
  if (!config.enabled) return undefined;

  const parsed = parseAlowareMessage(message.text || "", message.attachments);

  // 1. Must be inbound
  if (parsed.direction !== "inbound") return undefined;

  // 2. Must have a promising signal
  const signalAssessment = detectLeadSignalAssessment(parsed.body);
  if (!signalAssessment) return undefined;

  // 3. Must have an assignee
  const { userId: assigneeUserId, reason: assigneeReason } = chooseAssignee(
    parsed,
    config,
  );
  if (!assigneeUserId) return undefined;

  const contactLabel = parsed.contactPhone
    ? `${parsed.contactName} (${parsed.contactPhone})`
    : parsed.contactName;

  return {
    assigneeUserId,
    channelId: message.channelId,
    threadTs: message.threadTs || message.ts || "",
    signalType: signalAssessment.signalType,
    tags: signalAssessment.tags,
    text: `${DEFAULT_ALERT_PREFIX} <@${assigneeUserId}> ${signalAssessment.signalType === "booking" ? "booking-ready" : "engaged"} lead from *${contactLabel}*!`,
    blocks: buildAlertBlocks({
      assigneeUserId,
      contactLabel,
      messageBody: parsed.body,
      signalAssessment,
      contactId: parsed.contactId,
      assigneeReason,
    }),
  };
};

export const shouldBroadcastLeadWatcherAlerts = (): boolean => {
  const config = getConfig();
  return parseBoolean(config.rawBroadcastAlerts || "", false);
};

export const getHubSpotSyncData = (message: LeadWatcherMessageInput) => {
  const parsed = parseAlowareMessage(message.text || "", message.attachments);
  if (parsed.direction !== "inbound") return undefined;

  const signal = detectLeadSignalAssessment(parsed.body);
  return {
    phoneNumber: parsed.contactPhone,
    contactLabel: parsed.contactName,
    messageBody: parsed.body,
    signalType: signal?.signalType,
    tags: signal?.tags || [],
  };
};

export const __resetLeadWatcherConfigCacheForTests = (): void => {
  cachedConfig = undefined;
};
