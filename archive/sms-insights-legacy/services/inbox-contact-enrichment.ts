import type { Logger } from '@slack/bolt';
import { lookupAlowareContactByPhone, lookupAlowareNumberLrn } from './aloware-client.js';
import { type InboxContactProfileRow, upsertInboxContactProfile } from './inbox-contact-profiles.js';

type EnrichInput = {
  contactKey: string;
  conversationId?: string | null;
  phoneNumber: string;
  fallbackName?: string | null;
  contactId?: string | null;
};

const normalizePhone = (value: string): string => value.replace(/\D/g, '');
const isLrnLookupEnabled = (): boolean => {
  const value = (process.env.ALOWARE_LRN_LOOKUP_ENABLED || 'false').trim().toLowerCase();
  return value === 'true' || value === '1';
};

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
  const candidates = [lookup.dnc, lookup.is_dnc, lookup.do_not_contact, lookup.unsubscribed, lookup.opted_out];
  return candidates.some((value) => value === true || String(value).toLowerCase() === 'true');
};

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const asBoolean = (value: unknown): boolean | null => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : null;
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return null;
};

const asInteger = (value: unknown): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value !== 'string') return null;
  const parsed = Number.parseInt(value.trim(), 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const asIsoDateTime = (value: unknown): string | null => {
  const candidate = asString(value);
  if (!candidate) return null;
  const parsed = new Date(candidate);
  if (!Number.isFinite(parsed.getTime())) return null;
  return parsed.toISOString();
};

const asStringArray = (value: unknown): string[] | null => {
  if (!Array.isArray(value)) return null;
  const normalized = value
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      if (entry && typeof entry === 'object') {
        const row = entry as Record<string, unknown>;
        return asString(row.name) || asString(row.label) || asString(row.value) || '';
      }
      return '';
    })
    .filter((entry) => entry.length > 0);
  return normalized.length > 0 ? normalized : null;
};

export const enrichContactProfileFromAloware = async (
  input: EnrichInput,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<InboxContactProfileRow> => {
  const phone = normalizePhone(input.phoneNumber);
  const lookup = await lookupAlowareContactByPhone(phone, logger);
  let lrnLookup: Record<string, unknown> | null = null;

  if (isLrnLookupEnabled()) {
    try {
      const response = await lookupAlowareNumberLrn(phone, logger);
      if (response && typeof response === 'object') {
        lrnLookup = response as Record<string, unknown>;
      }
    } catch (error) {
      logger?.warn?.('Aloware LRN lookup failed; continuing with contact lookup only', error);
    }
  }

  const lrnData =
    lrnLookup?.data && typeof lrnLookup.data === 'object' ? (lrnLookup.data as Record<string, unknown>) : null;
  const lrnLineType = asString(lrnLookup?.line_type) || asString(lrnData?.line_type);
  const lrnCarrier = asString(lrnLookup?.carrier) || asString(lrnData?.spid_carrier_name) || asString(lrnData?.carrier);
  const lrnCity = asString(lrnLookup?.cnam_city) || asString(lrnData?.city);
  const lrnState = asString(lrnLookup?.cnam_state) || asString(lrnData?.state);
  const lrnCountry = asString(lrnLookup?.cnam_country) || asString(lrnData?.country);

  if (!lookup) {
    return upsertInboxContactProfile(
      {
        contactKey: input.contactKey,
        conversationId: input.conversationId,
        contactId: input.contactId || null,
        name: input.fallbackName || null,
        phone,
        lrnLineType,
        lrnCarrier,
        lrnCity,
        lrnState,
        lrnCountry,
        lrnLastCheckedAt: lrnLookup ? new Date().toISOString() : null,
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
      leadSource: asString(lookup.intake_source) || asString(lookup.lead_source_id),
      sequenceId: asString(lookup.sequence_id),
      dispositionStatusId: asString(lookup.disposition_status_id),
      tags: asStringArray(lookup.tags),
      textAuthorized: asBoolean(lookup.text_authorized),
      isBlocked: asBoolean(lookup.is_blocked),
      cnamCity: asString(lookup.cnam_city),
      cnamState: asString(lookup.cnam_state),
      cnamCountry: asString(lookup.cnam_country),
      lastEngagementAt: asIsoDateTime(lookup.last_engagement_at),
      inboundSmsCount: asInteger(lookup.inbound_sms_count),
      outboundSmsCount: asInteger(lookup.outbound_sms_count),
      inboundCallCount: asInteger(lookup.inbound_call_count),
      outboundCallCount: asInteger(lookup.outbound_call_count),
      unreadCount: asInteger(lookup.unread_count),
      lrnLineType,
      lrnCarrier,
      lrnCity,
      lrnState,
      lrnCountry,
      lrnLastCheckedAt: lrnLookup ? new Date().toISOString() : null,
      revenueMixCategory: parseRevenueMixCategory(csfCombined),
      employmentStatus: parseEmploymentStatus(csfCombined),
      coachingInterest: parseCoachingInterest(csfCombined),
      dnc: parseDnc(lookupRecord),
      raw: lookup,
    },
    logger,
  );
};
