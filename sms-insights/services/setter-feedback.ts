import type { Logger } from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import type { AlowareMessageFields } from "./aloware-parser.js";

const FEEDBACK_REQUEST_MARKER = "*Setter Coaching Feedback Request*";
const DEFAULT_FEEDBACK_ENABLED = true;

type AssistantTarget = {
  label: string;
  userId: string;
};

type PostingClient = {
  client: WebClient;
  source: "bot" | "user";
};

const parseBoolean = (
  value: string | undefined,
  fallback: boolean,
): boolean => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  return normalized === "true" || (normalized !== "false" && fallback);
};

const isFeedbackEnabled = (): boolean => {
  return parseBoolean(
    process.env.ALOWARE_SETTER_FEEDBACK_ENABLED,
    DEFAULT_FEEDBACK_ENABLED,
  );
};

const getAssistantTargets = (): AssistantTarget[] => {
  const claudeId = process.env.CLAUDE_ASSISTANT_USER_ID?.trim() || "";
  // For setter feedback, the user specifically mentioned Claude in the past,
  // but we can offer both if configured.
  const targets: AssistantTarget[] = [];
  if (claudeId) targets.push({ label: "Claude", userId: claudeId });

  const chatgptId = process.env.CHATGPT_ASSISTANT_USER_ID?.trim() || "";
  if (chatgptId) targets.push({ label: "ChatGPT", userId: chatgptId });

  return targets;
};

const getPostingClients = (botClient: WebClient): PostingClient[] => {
  const clients: PostingClient[] = [];
  const userToken = process.env.SLACK_USER_TOKEN?.trim() || "";
  if (userToken) {
    clients.push({ client: new WebClient(userToken), source: "user" });
  }
  clients.push({ client: botClient, source: "bot" });
  return clients;
};

const buildFeedbackPrompt = ({
  assistant,
  setterName,
  setterUserId,
  messageBody,
  contactName,
}: {
  assistant: AssistantTarget;
  setterName: string;
  setterUserId?: string;
  messageBody: string;
  contactName: string;
}): string => {
  const setterTag = setterUserId ? `<@${setterUserId}>` : setterName;
  return [
    FEEDBACK_REQUEST_MARKER,
    `Hey <@${assistant.userId}>, high-performance sales coach mode: Give ${setterTag} a quick 'Score' on this message to ${contactName}.`,
    "",
    "*Context:* This is a Physical Therapy business coaching lead. We want strategy call bookings.",
    "",
    "Rules:",
    "1. Supportive, punchy, and obsessed with conversational speed to booking.",
    "2. Be tactical—one specific pivot they can make next time.",
    "3. Maximum 3 bullet points.",
    "",
    "*Message Sent:*",
    `> "${messageBody}"`,
    "",
    "*Format:*",
    "*Win:* <tactical compliment>",
    "*Move:* <one specific pivot to drive a booking>",
    "*Energy:* 🔥 / ⚡️ / 💎",
  ].join("\n");
};

export const requestSetterFeedback = async ({
  client,
  fields,
  logger,
  ts,
  channelId,
}: {
  client: WebClient;
  fields: AlowareMessageFields;
  logger: Logger;
  ts: string;
  channelId: string;
}): Promise<void> => {
  if (!isFeedbackEnabled()) return;
  if (fields.direction !== "outbound") return;

  // Identify Jack or Brandon
  const userName = fields.user.toLowerCase();
  const isJack = userName.includes("jack");
  const isBrandon = userName.includes("brandon");

  if (!isJack && !isBrandon) return;

  const setterName = isJack ? "Jack" : "Brandon";
  const setterUserId = isJack
    ? process.env.ALOWARE_WATCHER_JACK_USER_ID
    : process.env.ALOWARE_WATCHER_BRANDON_USER_ID;

  const assistants = getAssistantTargets();
  if (assistants.length === 0) return;

  // We only tag ONE assistant for immediate feedback to avoid clutter
  // Prefer Claude if available
  const assistant =
    assistants.find((a) => a.label === "Claude") || assistants[0];
  const postingClients = getPostingClients(client);

  const text = buildFeedbackPrompt({
    assistant,
    setterName,
    setterUserId,
    messageBody: fields.body,
    contactName: fields.contactName,
  });

  for (const { client: pClient, source } of postingClients) {
    try {
      await pClient.chat.postMessage({
        channel: channelId,
        thread_ts: ts,
        text,
        link_names: true,
      });
      logger.info(
        `Setter Feedback requested for ${setterName} from ${assistant.label} via ${source}`,
      );
      return;
    } catch (error) {
      logger.error(
        `Failed to post setter feedback request via ${source}: ${error}`,
      );
    }
  }
};
