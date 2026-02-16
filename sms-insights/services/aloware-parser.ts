import type { LeadWatcherAttachment } from "./lead-watcher.js";

export type AlowareMessageFields = {
  body: string;
  contactName: string;
  contactPhone: string;
  contactId: string;
  line: string;
  sequence: string;
  user: string;
  direction: "inbound" | "outbound" | "unknown";
};

const sanitize = (value: string): string => {
  return value.replace(/\s+/g, " ").trim();
};

const stripSlackLinkMarkup = (value: string): string => {
  return value.replace(/<[^|>]+\|([^>]+)>/g, "$1");
};

export const extractAttachmentField = (
  attachments: LeadWatcherAttachment[] | undefined,
  fieldTitle: string,
): string => {
  if (!attachments) return "";
  const target = fieldTitle.trim().toLowerCase();
  for (const attachment of attachments) {
    for (const field of attachment.fields || []) {
      const title = sanitize(field.title || "").toLowerCase();
      if (title === target) {
        return sanitize(stripSlackLinkMarkup(field.value || ""));
      }
    }
  }
  return "";
};

export const extractContact = (
  text: string,
): { name: string; phone: string } => {
  const cleaned = sanitize(stripSlackLinkMarkup(text));

  // Pattern 1: Name (Phone)
  const contactWithLabel = cleaned.match(
    /contact[:\s-]*([^(\n]+?)\s*\(\s*(\+?[0-9][0-9()\-\s]{7,})\s*\)/i,
  );
  if (contactWithLabel) {
    return {
      name: sanitize(contactWithLabel[1] || "Unknown"),
      phone: sanitize(contactWithLabel[2] || "").replace(/\D/g, ""),
    };
  }

  // Pattern 2: Direct pair "Name (+1...)"
  const directPair = cleaned.match(
    /^([^(\n]+?)\s*\(\s*(\+?[0-9][0-9()\-\s]{7,})\s*\)$/,
  );
  if (directPair) {
    return {
      name: sanitize(directPair[1] || "Unknown"),
      phone: sanitize(directPair[2] || "").replace(/\D/g, ""),
    };
  }

  return {
    name: "Unknown",
    phone: "",
  };
};

export const parseAlowareMessage = (
  text: string,
  attachments?: LeadWatcherAttachment[],
): AlowareMessageFields => {
  const fields: AlowareMessageFields = {
    body: "",
    contactName: "Unknown",
    contactPhone: "",
    contactId: "",
    line: "",
    sequence: "",
    user: "",
    direction: "unknown",
  };

  // 1. Direction
  const attachmentRef = attachments?.[0];
  const combinedText =
    `${text} ${attachmentRef?.fallback || ""} ${attachmentRef?.title || ""}`.toLowerCase();

  if (/\b(received|inbound|incoming)\b/i.test(combinedText)) {
    fields.direction = "inbound";
  } else if (/\b(sent|outbound|outgoing)\b/i.test(combinedText)) {
    fields.direction = "outbound";
  }

  // 2. Body
  const attachmentBody = extractAttachmentField(attachments, "message");
  if (attachmentBody) {
    fields.body = attachmentBody;
  } else {
    const bodyMatch = text.match(/Message([\s\S]*)$/i);
    fields.body = bodyMatch?.[1]
      ? sanitize(bodyMatch[1]).replace(/^[:\-\s]+/, "")
      : sanitize(text);
  }

  // 3. Contact
  const contactField = extractAttachmentField(attachments, "contact");
  const { name, phone } = extractContact(contactField || text);
  fields.contactName = name;
  fields.contactPhone = phone;

  // 4. Other fields
  fields.line = extractAttachmentField(attachments, "line");
  fields.sequence = extractAttachmentField(attachments, "sequence");
  fields.user = extractAttachmentField(attachments, "user");

  // 5. Raw Contact Link (to get Aloware ID)
  const contactFieldValue =
    attachments?.[0]?.fields?.find((f) => f.title?.toLowerCase() === "contact")
      ?.value || "";
  const idMatch = contactFieldValue.match(/contacts\/(\d+)/);
  if (idMatch?.[1]) {
    fields.contactId = idMatch[1];
  }

  return fields;
};
