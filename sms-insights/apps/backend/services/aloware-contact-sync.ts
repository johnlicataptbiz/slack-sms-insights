import type { Logger } from '@slack/bolt';
import {
  type AlowareSequenceSource,
  disenrollAlowareContactFromSequence,
  enrollAlowareContactToSequence,
  upsertAlowareContact,
} from './aloware-client.js';
import type {
  CoachingInterest,
  EmploymentStatus,
  InboxContactProfileRow,
  RevenueMixCategory,
} from './inbox-contact-profiles.js';

const parseFlag = (value: string | undefined, fallback: boolean): boolean => {
  if (!value) return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return fallback;
};

const normalizePhone = (value: string | null | undefined): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 ? digits : null;
};

const nowIso = (): string => new Date().toISOString();

const asHumanLabel = (value: EmploymentStatus | RevenueMixCategory | CoachingInterest): string => {
  return value.replace(/_/g, ' ');
};

const buildQualificationNotes = (input: {
  fullOrPartTime: EmploymentStatus;
  niche: string | null;
  revenueMix: RevenueMixCategory;
  coachingInterest: CoachingInterest;
}): string => {
  return [
    `PTBiz qualification sync (${nowIso()})`,
    `employment_status=${asHumanLabel(input.fullOrPartTime)}`,
    `niche=${input.niche || 'unknown'}`,
    `revenue_mix=${asHumanLabel(input.revenueMix)}`,
    `coaching_interest=${asHumanLabel(input.coachingInterest)}`,
  ].join('\n');
};

const resolveSequenceIdentity = (params: {
  contactPhone?: string | null;
  contactId?: string | null;
  alowareContactId?: string | null;
}): { source: AlowareSequenceSource; id?: string; phoneNumber?: string } | null => {
  if (params.alowareContactId?.trim()) {
    return {
      source: 'aloware',
      id: params.alowareContactId.trim(),
    };
  }
  if (params.contactId?.trim()) {
    return {
      source: 'aloware',
      id: params.contactId.trim(),
    };
  }
  const phone = normalizePhone(params.contactPhone);
  if (phone) {
    return {
      source: 'phone_number',
      phoneNumber: phone,
    };
  }
  return null;
};

export const isAlowareContactWriteEnabled = (): boolean => parseFlag(process.env.ALOWARE_CONTACT_WRITE_ENABLED, false);

export const isAlowareSequenceSyncEnabled = (): boolean => parseFlag(process.env.ALOWARE_SEQUENCE_SYNC_ENABLED, false);

export const syncQualificationToAloware = async (
  input: {
    contactPhone?: string | null;
    profile?: InboxContactProfileRow | null;
    fullOrPartTime: EmploymentStatus;
    niche: string | null;
    revenueMix: RevenueMixCategory;
    coachingInterest: CoachingInterest;
  },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<{ status: 'synced' | 'skipped'; reason: string }> => {
  if (!isAlowareContactWriteEnabled()) {
    return { status: 'skipped', reason: 'ALOWARE_CONTACT_WRITE_ENABLED=false' };
  }

  const phone = normalizePhone(input.contactPhone || input.profile?.phone);
  if (!phone) {
    return { status: 'skipped', reason: 'missing_phone' };
  }

  await upsertAlowareContact(
    {
      phoneNumber: phone,
      name: input.profile?.name || undefined,
      email: input.profile?.email || undefined,
      timezone: input.profile?.timezone || undefined,
      leadSource: input.profile?.lead_source || undefined,
      sequenceId: input.profile?.sequence_id || undefined,
      dispositionStatusId: input.profile?.disposition_status_id || undefined,
      notes: buildQualificationNotes({
        fullOrPartTime: input.fullOrPartTime,
        niche: input.niche,
        revenueMix: input.revenueMix,
        coachingInterest: input.coachingInterest,
      }),
      csf1: `employment_status=${input.fullOrPartTime};revenue_mix=${input.revenueMix};coaching_interest=${input.coachingInterest}`,
      csf2: `niche=${input.niche || 'unknown'}`,
      forceUpdate: true,
    },
    logger,
  );

  return { status: 'synced', reason: 'ok' };
};

export const enrollConversationContactToSequence = async (
  input: {
    sequenceId: string | number;
    contactPhone?: string | null;
    contactId?: string | null;
    alowareContactId?: string | null;
    forceEnroll?: boolean;
  },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<{ status: 'synced' | 'skipped'; reason: string }> => {
  if (!isAlowareSequenceSyncEnabled()) {
    return { status: 'skipped', reason: 'ALOWARE_SEQUENCE_SYNC_ENABLED=false' };
  }
  const identity = resolveSequenceIdentity(input);
  if (!identity) {
    return { status: 'skipped', reason: 'missing_contact_identifier' };
  }

  await enrollAlowareContactToSequence(
    {
      sequenceId: input.sequenceId,
      source: identity.source,
      id: identity.id,
      phoneNumber: identity.phoneNumber,
      forceEnroll: input.forceEnroll === true,
    },
    logger,
  );
  return { status: 'synced', reason: 'ok' };
};

export const disenrollConversationContactFromSequence = async (
  input: {
    contactPhone?: string | null;
    contactId?: string | null;
    alowareContactId?: string | null;
  },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<{ status: 'synced' | 'skipped'; reason: string }> => {
  if (!isAlowareSequenceSyncEnabled()) {
    return { status: 'skipped', reason: 'ALOWARE_SEQUENCE_SYNC_ENABLED=false' };
  }
  const identity = resolveSequenceIdentity(input);
  if (!identity) {
    return { status: 'skipped', reason: 'missing_contact_identifier' };
  }

  await disenrollAlowareContactFromSequence(
    {
      source: identity.source,
      id: identity.id,
      phoneNumber: identity.phoneNumber,
    },
    logger,
  );
  return { status: 'synced', reason: 'ok' };
};
