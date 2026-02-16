import type { Logger } from "@slack/bolt";
import { WebClient } from "@slack/web-api";
import type { AlowareMessageFields } from "./aloware-parser.js";

const INBOUND_COACHING_MARKER = "*Inbound Lead Response Suggestion*";

type AssistantTarget = {
  label: string;
  userId: string;
};

type PostingClient = {
  client: WebClient;
  source: "bot" | "user";
};

const getAssistantTargets = (): AssistantTarget[] => {
  const claudeId = process.env.CLAUDE_ASSISTANT_USER_ID?.trim() || "";
  const chatgptId = process.env.CHATGPT_ASSISTANT_USER_ID?.trim() || "";
  const targets: AssistantTarget[] = [];
  if (claudeId) targets.push({ label: "Claude", userId: claudeId });
  if (chatgptId) targets.push({ label: "ChatGPT", userId: chatgptId });
  return targets;
};

const buildCoachingPrompt = ({
  assistant,
  messageBody,
  contactName,
  assigneeUserId,
}: {
  assistant: AssistantTarget;
  messageBody: string;
  contactName: string;
  assigneeUserId?: string;
}): string => {
  const assigneeTag = assigneeUserId ? `<@${assigneeUserId}>` : "the team";
  return [
    INBOUND_COACHING_MARKER,
    `Hey <@${assistant.userId}>, acts as a high-performance sales coach for ${assigneeTag}.`,
    `A "Hot Lead" (${contactName}) just messaged us. Give us the best direct-response script to secure a strategy call booking.`,
    "",
    "*Lead's Message:*",
    `> "${messageBody}"`,
    "",
    "*Format:*",
    "*Recommended Script:* <exact text for the setter to copy/paste>",
    "*Psychological Trigger:* <why this conversational pivot converts>",
  ].join("\n");
};

export const requestInboundCoaching = async ({
  client,
  fields,
  logger,
  ts,
  channelId,
  assigneeUserId,
}: {
  client: WebClient;
  fields: AlowareMessageFields;
  logger: Logger;
  ts: string;
  channelId: string;
  assigneeUserId?: string;
}): Promise<void> => {
  const assistants = getAssistantTargets();
  if (assistants.length === 0) return;

  const assistant =
    assistants.find((a) => a.label === "Claude") || assistants[0];
  const userToken = process.env.SLACK_USER_TOKEN?.trim() || "";
  const pClient = userToken ? new WebClient(userToken) : client;

  const text = buildCoachingPrompt({
    assistant,
    messageBody: fields.body,
    contactName: fields.contactName,
    assigneeUserId,
  });

  try {
    await pClient.chat.postMessage({
      channel: channelId,
      thread_ts: ts,
      text,
      link_names: true,
    });
    logger.info(
      `Inbound coaching requested for ${fields.contactName} from ${assistant.label}`,
    );
  } catch (error) {
    logger.error(`Failed to post inbound coaching: ${error}`);
  }
};
