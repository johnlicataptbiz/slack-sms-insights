import type { LeadWatcherAttachment } from './lead-watcher.js';

export type AlowareMessageFields = {
  body: string;
  contactName: string;
  contactPhone: string;
  contactId: string;
  line: string;
  sequence: string;
  user: string;
  direction: 'inbound' | 'outbound' | 'unknown';
};

const sanitize = (value: string): string => {
  return value.replace(/\s+/g, ' ').trim();
};

const stripSlackLinkMarkup = (value: string): string => {
  return value.replace(/<[^|>]+\|([^>]+)>/g, '$1');
};

export const extractAttachmentField = (
  attachments: LeadWatcherAttachment[] | undefined,
  fieldTitle: string,
): string => {
  if (!attachments) return '';
  const target = fieldTitle.trim().toLowerCase();
  for (const attachment of attachments) {
    for (const field of attachment.fields || []) {
      const title = sanitize(field.title || '').toLowerCase();
      if (title.includes(target)) {
        return sanitize(stripSlackLinkMarkup(field.value || ''));
      }
    }
  }
  return '';
};

const extractAttachmentFieldByAliases = (
  attachments: LeadWatcherAttachment[] | undefined,
  aliases: string[],
): string => {
  if (!attachments) return '';
  const normalizedAliases = aliases.map((alias) => sanitize(alias).toLowerCase());
  for (const attachment of attachments) {
    for (const field of attachment.fields || []) {
      const title = sanitize(field.title || '').toLowerCase();
      if (!title) continue;
      if (normalizedAliases.some((alias) => title.includes(alias))) {
        const value = sanitize(stripSlackLinkMarkup(field.value || ''));
        if (value) return value;
      }
    }
  }
  return '';
};

const extractFromFallback = (attachments: LeadWatcherAttachment[] | undefined, labels: string[]): string => {
  const fallbackText = (attachments || []).map((attachment) => attachment.fallback || '').join('\n');
  if (!fallbackText) return '';

  for (const label of labels) {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = fallbackText.match(new RegExp(`\\*?${escaped}\\*?\\s*:\\s*([^\\n]+)`, 'i'));
    if (match?.[1]) {
      const value = sanitize(stripSlackLinkMarkup(match[1]));
      if (value) return value;
    }
  }
  return '';
};

export const extractContact = (text: string): { name: string; phone: string } => {
  const cleaned = sanitize(stripSlackLinkMarkup(text));

  // Pattern 1: Name (Phone)
  const contactWithLabel = cleaned.match(/contact[:\s-]*([^(\n]+?)\s*\(\s*(\+?[0-9][0-9()\-\s]{7,})\s*\)/i);
  if (contactWithLabel) {
    return {
      name: sanitize(contactWithLabel[1] || 'Unknown'),
      phone: sanitize(contactWithLabel[2] || '').replace(/\D/g, ''),
    };
  }

  // Pattern 2: Direct pair "Name (+1...)"
  const directPair = cleaned.match(/^([^(\n]+?)\s*\(\s*(\+?[0-9][0-9()\-\s]{7,})\s*\)$/);
  if (directPair) {
    return {
      name: sanitize(directPair[1] || 'Unknown'),
      phone: sanitize(directPair[2] || '').replace(/\D/g, ''),
    };
  }

  return {
    name: 'Unknown',
    phone: '',
  };
};

export const parseAlowareMessage = (text: string, attachments?: LeadWatcherAttachment[]): AlowareMessageFields => {
  const fields: AlowareMessageFields = {
    body: '',
    contactName: 'Unknown',
    contactPhone: '',
    contactId: '',
    line: '',
    sequence: '',
    user: '',
    direction: 'unknown',
  };

  // 1. Direction
  const attachmentRef = attachments?.[0];
  const attachmentTitles = (attachments || []).map((attachment) => attachment.title || '').join(' ');
  const attachmentTexts = (attachments || []).map((attachment) => attachment.text || '').join(' ');
  const combinedText =
    `${text} ${attachmentRef?.fallback || ''} ${attachmentRef?.title || ''} ${attachmentTitles} ${attachmentTexts}`.toLowerCase();

  if (/\b(received|inbound|incoming)\b/i.test(combinedText)) {
    fields.direction = 'inbound';
  } else if (/\b(sent|outbound|outgoing)\b/i.test(combinedText)) {
    fields.direction = 'outbound';
  } else if (/\b(sms from|message from)\b/i.test(combinedText)) {
    fields.direction = 'inbound';
  } else if (/\b(sms to|message to)\b/i.test(combinedText)) {
    fields.direction = 'outbound';
  }

  // 2. Body
  const attachmentBody =
    extractAttachmentFieldByAliases(attachments, ['message', 'body', 'content', 'sms message']) ||
    extractFromFallback(attachments, ['Message', 'Body', 'Text']);
  if (attachmentBody) {
    fields.body = attachmentBody;
  } else {
    const bodyMatch = text.match(/(?:Message|Body|Text)([\s\S]*)$/i);
    fields.body = bodyMatch?.[1] ? sanitize(bodyMatch[1]).replace(/^[:\-\s]+/, '') : sanitize(text);
  }

  // 3. Contact
  const contactField =
    extractAttachmentFieldByAliases(attachments, ['contact', 'lead']) ||
    extractFromFallback(attachments, ['Contact', 'Lead', 'Name']);
  const fallbackPhone = extractFromFallback(attachments, ['Phone', 'Phone Number', 'Mobile Phone']);
  const { name, phone } = extractContact(contactField || text);
  fields.contactName = name;
  fields.contactPhone = phone || sanitize(fallbackPhone).replace(/\D/g, '');

  // 4. Other fields
  fields.line =
    extractAttachmentFieldByAliases(attachments, ['line', 'from number', 'sending number']) ||
    extractFromFallback(attachments, ['Line']);
  fields.sequence =
    extractAttachmentFieldByAliases(attachments, ['sequence', 'campaign']) ||
    extractFromFallback(attachments, ['Sequence', 'Campaign']);
  fields.user =
    extractAttachmentFieldByAliases(attachments, ['user', 'rep', 'agent', 'owner', 'sender']) ||
    extractFromFallback(attachments, ['User', 'Rep', 'Agent', 'Owner']);

  if (fields.direction === 'unknown' && fields.user) {
    fields.direction = 'outbound';
  }

  // 5. Raw Contact Link (to get Aloware ID)
  const contactFieldValue =
    attachments
      ?.flatMap((attachment) => attachment.fields || [])
      .find((field) =>
        sanitize(field.title || '')
          .toLowerCase()
          .includes('contact'),
      )?.value || '';
  const idMatch = contactFieldValue.match(/contacts\/(\d+)/);
  if (idMatch?.[1]) {
    fields.contactId = idMatch[1];
  }

  return fields;
};
