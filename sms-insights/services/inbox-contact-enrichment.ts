import type { Logger } from '@slack/bolt';
import { lookupAlowareContactByPhone } from './aloware-client.js';
import { type InboxContactProfileRow, upsertInboxContactProfile } from './inbox-contact-profiles.js';

type EnrichInput = {
  contactKey: string;
  conversationId?: string | null;
  phoneNumber: string;
  fallbackName?: string | null;
  contactId?: string | null;
};

const normalizePhone = (value: string): string => value.replace(/\D/g, '');

const parseRevenueMixCategory = (raw: string): 'mostly_cash' | 'mostly_insurance' | 'balanced' | 'unknown' => {
  const normalized = raw.toLowerCase();
  if (normalized.includes('mostly cash') || normalized.includes('cash heavy')) return 'mostly_cash';
  if (normalized.includes('mostly insurance') || normalized.includes('insurance heavy')) return 'mostly_insurance';
  if (normalized.includes('balanced')) return 'balanced';
  return 'unknown';
};

const parseEmploymentStatus = (raw: string): 'full_time' | 'part_time' | 'unknown' => {
  const normalized = raw.toLowerCase();
  if (normalized.includes('full time') || normalized.includes('full-time')) return 'full_time';
  if (normalized.includes('part time') || normalized.includes('part-time')) return 'part_time';
  return 'unknown';
};

const parseCoachingInterest = (raw: string): 'high' | 'medium' | 'low' | 'unknown' => {
  const normalized = raw.toLowerCase();
  if (normalized.includes('very interested') || normalized.includes('high interest')) return 'high';
  if (normalized.includes('open') || normalized.includes('maybe')) return 'medium';
  if (normalized.includes('not interested') || normalized.includes('low interest')) return 'low';
  return 'unknown';
};

const parseDnc = (lookup: Record<string, unknown>): boolean => {
  const candidates = [lookup.dnc, lookup.do_not_contact, lookup.unsubscribed, lookup.opted_out];
  return candidates.some((value) => value === true || String(value).toLowerCase() === 'true');
};

export const enrichContactProfileFromAloware = async (
  input: EnrichInput,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<InboxContactProfileRow> => {
  const phone = normalizePhone(input.phoneNumber);
  const lookup = await lookupAlowareContactByPhone(phone, logger);

  if (!lookup) {
    return upsertInboxContactProfile(
      {
        contactKey: input.contactKey,
        conversationId: input.conversationId,
        contactId: input.contactId || null,
        name: input.fallbackName || null,
        phone,
      },
      logger,
    );
  }

  const lookupRecord = lookup as Record<string, unknown>;
  const combinedName =
    (typeof lookup.name === 'string' && lookup.name.trim()) ||
    [lookup.first_name, lookup.last_name]
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter(Boolean)
      .join(' ') ||
    input.fallbackName ||
    null;

  const csf1 = typeof lookup.csf1 === 'string' ? lookup.csf1 : '';
  const csf2 = typeof lookup.csf2 === 'string' ? lookup.csf2 : '';
  const csfCombined = `${csf1} ${csf2}`.trim();

  return upsertInboxContactProfile(
    {
      contactKey: input.contactKey,
      conversationId: input.conversationId,
      contactId: input.contactId || null,
      alowareContactId: typeof lookup.id === 'string' ? lookup.id : null,
      name: combinedName,
      phone,
      email: typeof lookup.email === 'string' ? lookup.email : null,
      timezone: typeof lookup.timezone === 'string' ? lookup.timezone : null,
      revenueMixCategory: parseRevenueMixCategory(csfCombined),
      employmentStatus: parseEmploymentStatus(csfCombined),
      coachingInterest: parseCoachingInterest(csfCombined),
      dnc: parseDnc(lookupRecord),
      raw: lookup,
    },
    logger,
  );
};
