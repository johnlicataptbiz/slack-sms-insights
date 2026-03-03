import type { Logger } from '@slack/bolt';
import type { Pool } from 'pg';
import { getPool } from './db.js';

export type RevenueMixCategory = 'mostly_cash' | 'mostly_insurance' | 'balanced' | 'unknown';
export type EmploymentStatus = 'full_time' | 'part_time' | 'unknown';
export type CoachingInterest = 'high' | 'medium' | 'low' | 'unknown';

export type InboxContactProfileRow = {
  contact_key: string;
  conversation_id: string | null;
  contact_id: string | null;
  aloware_contact_id: string | null;
  name: string | null;
  phone: string | null;
  email: string | null;
  timezone: string | null;
  niche: string | null;
  lead_source: string | null;
  sequence_id: string | null;
  disposition_status_id: string | null;
  tags: unknown | null;
  text_authorized: boolean | null;
  is_blocked: boolean | null;
  cnam_city: string | null;
  cnam_state: string | null;
  cnam_country: string | null;
  last_engagement_at: string | null;
  inbound_sms_count: number | null;
  outbound_sms_count: number | null;
  inbound_call_count: number | null;
  outbound_call_count: number | null;
  unread_count: number | null;
  lrn_line_type: string | null;
  lrn_carrier: string | null;
  lrn_city: string | null;
  lrn_state: string | null;
  lrn_country: string | null;
  lrn_last_checked_at: string | null;
  revenue_mix_category: RevenueMixCategory;
  employment_status: EmploymentStatus;
  coaching_interest: CoachingInterest;
  dnc: boolean;
  raw: unknown | null;
  created_at: string;
  updated_at: string;
};

export type UpsertInboxContactProfileInput = {
  contactKey: string;
  conversationId?: string | null;
  contactId?: string | null;
  alowareContactId?: string | null;
  name?: string | null;
  phone?: string | null;
  email?: string | null;
  timezone?: string | null;
  niche?: string | null;
  leadSource?: string | null;
  sequenceId?: string | null;
  dispositionStatusId?: string | null;
  tags?: unknown | null;
  textAuthorized?: boolean | null;
  isBlocked?: boolean | null;
  cnamCity?: string | null;
  cnamState?: string | null;
  cnamCountry?: string | null;
  lastEngagementAt?: string | null;
  inboundSmsCount?: number | null;
  outboundSmsCount?: number | null;
  inboundCallCount?: number | null;
  outboundCallCount?: number | null;
  unreadCount?: number | null;
  lrnLineType?: string | null;
  lrnCarrier?: string | null;
  lrnCity?: string | null;
  lrnState?: string | null;
  lrnCountry?: string | null;
  lrnLastCheckedAt?: string | null;
  revenueMixCategory?: RevenueMixCategory;
  employmentStatus?: EmploymentStatus;
  coachingInterest?: CoachingInterest;
  dnc?: boolean;
  raw?: unknown | null;
};

const getDbOrThrow = (): Pool => {
  const pool = getPool();
  if (!pool) {
    throw new Error('Database not initialized');
  }
  return pool;
};

export const upsertInboxContactProfile = async (
  input: UpsertInboxContactProfileInput,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<InboxContactProfileRow> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();

  const revenueMix = input.revenueMixCategory || 'unknown';
  const employmentStatus = input.employmentStatus || 'unknown';
  const coachingInterest = input.coachingInterest || 'unknown';

  try {
    const result = await client.query<InboxContactProfileRow>(
      `
      INSERT INTO inbox_contact_profiles (
        contact_key,
        conversation_id,
        contact_id,
        aloware_contact_id,
        name,
        phone,
        email,
        timezone,
        niche,
        lead_source,
        sequence_id,
        disposition_status_id,
        tags,
        text_authorized,
        is_blocked,
        cnam_city,
        cnam_state,
        cnam_country,
        last_engagement_at,
        inbound_sms_count,
        outbound_sms_count,
        inbound_call_count,
        outbound_call_count,
        unread_count,
        lrn_line_type,
        lrn_carrier,
        lrn_city,
        lrn_state,
        lrn_country,
        lrn_last_checked_at,
        revenue_mix_category,
        employment_status,
        coaching_interest,
        dnc,
        raw
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35)
      ON CONFLICT (contact_key)
      DO UPDATE SET
        conversation_id = COALESCE(EXCLUDED.conversation_id, inbox_contact_profiles.conversation_id),
        contact_id = COALESCE(EXCLUDED.contact_id, inbox_contact_profiles.contact_id),
        aloware_contact_id = COALESCE(EXCLUDED.aloware_contact_id, inbox_contact_profiles.aloware_contact_id),
        name = COALESCE(EXCLUDED.name, inbox_contact_profiles.name),
        phone = COALESCE(EXCLUDED.phone, inbox_contact_profiles.phone),
        email = COALESCE(EXCLUDED.email, inbox_contact_profiles.email),
        timezone = COALESCE(EXCLUDED.timezone, inbox_contact_profiles.timezone),
        niche = COALESCE(EXCLUDED.niche, inbox_contact_profiles.niche),
        lead_source = COALESCE(EXCLUDED.lead_source, inbox_contact_profiles.lead_source),
        sequence_id = COALESCE(EXCLUDED.sequence_id, inbox_contact_profiles.sequence_id),
        disposition_status_id = COALESCE(EXCLUDED.disposition_status_id, inbox_contact_profiles.disposition_status_id),
        tags = COALESCE(EXCLUDED.tags, inbox_contact_profiles.tags),
        text_authorized = COALESCE(EXCLUDED.text_authorized, inbox_contact_profiles.text_authorized),
        is_blocked = COALESCE(EXCLUDED.is_blocked, inbox_contact_profiles.is_blocked),
        cnam_city = COALESCE(EXCLUDED.cnam_city, inbox_contact_profiles.cnam_city),
        cnam_state = COALESCE(EXCLUDED.cnam_state, inbox_contact_profiles.cnam_state),
        cnam_country = COALESCE(EXCLUDED.cnam_country, inbox_contact_profiles.cnam_country),
        last_engagement_at = COALESCE(EXCLUDED.last_engagement_at, inbox_contact_profiles.last_engagement_at),
        inbound_sms_count = COALESCE(EXCLUDED.inbound_sms_count, inbox_contact_profiles.inbound_sms_count),
        outbound_sms_count = COALESCE(EXCLUDED.outbound_sms_count, inbox_contact_profiles.outbound_sms_count),
        inbound_call_count = COALESCE(EXCLUDED.inbound_call_count, inbox_contact_profiles.inbound_call_count),
        outbound_call_count = COALESCE(EXCLUDED.outbound_call_count, inbox_contact_profiles.outbound_call_count),
        unread_count = COALESCE(EXCLUDED.unread_count, inbox_contact_profiles.unread_count),
        lrn_line_type = COALESCE(EXCLUDED.lrn_line_type, inbox_contact_profiles.lrn_line_type),
        lrn_carrier = COALESCE(EXCLUDED.lrn_carrier, inbox_contact_profiles.lrn_carrier),
        lrn_city = COALESCE(EXCLUDED.lrn_city, inbox_contact_profiles.lrn_city),
        lrn_state = COALESCE(EXCLUDED.lrn_state, inbox_contact_profiles.lrn_state),
        lrn_country = COALESCE(EXCLUDED.lrn_country, inbox_contact_profiles.lrn_country),
        lrn_last_checked_at = COALESCE(EXCLUDED.lrn_last_checked_at, inbox_contact_profiles.lrn_last_checked_at),
        revenue_mix_category = CASE
          WHEN EXCLUDED.revenue_mix_category = 'unknown' THEN inbox_contact_profiles.revenue_mix_category
          ELSE EXCLUDED.revenue_mix_category
        END,
        employment_status = CASE
          WHEN EXCLUDED.employment_status = 'unknown' THEN inbox_contact_profiles.employment_status
          ELSE EXCLUDED.employment_status
        END,
        coaching_interest = CASE
          WHEN EXCLUDED.coaching_interest = 'unknown' THEN inbox_contact_profiles.coaching_interest
          ELSE EXCLUDED.coaching_interest
        END,
        dnc = inbox_contact_profiles.dnc OR EXCLUDED.dnc,
        raw = COALESCE(EXCLUDED.raw, inbox_contact_profiles.raw),
        updated_at = NOW()
      RETURNING *;
      `,
      [
        input.contactKey,
        input.conversationId ?? null,
        input.contactId ?? null,
        input.alowareContactId ?? null,
        input.name ?? null,
        input.phone ?? null,
        input.email ?? null,
        input.timezone ?? null,
        input.niche ?? null,
        input.leadSource ?? null,
        input.sequenceId ?? null,
        input.dispositionStatusId ?? null,
        input.tags ?? null,
        input.textAuthorized ?? null,
        input.isBlocked ?? null,
        input.cnamCity ?? null,
        input.cnamState ?? null,
        input.cnamCountry ?? null,
        input.lastEngagementAt ?? null,
        input.inboundSmsCount ?? null,
        input.outboundSmsCount ?? null,
        input.inboundCallCount ?? null,
        input.outboundCallCount ?? null,
        input.unreadCount ?? null,
        input.lrnLineType ?? null,
        input.lrnCarrier ?? null,
        input.lrnCity ?? null,
        input.lrnState ?? null,
        input.lrnCountry ?? null,
        input.lrnLastCheckedAt ?? null,
        revenueMix,
        employmentStatus,
        coachingInterest,
        input.dnc === true,
        input.raw ?? null,
      ],
    );

    const row = result.rows[0];
    if (!row) {
      throw new Error('Failed to upsert inbox contact profile');
    }
    return row;
  } catch (err) {
    logger?.error('upsertInboxContactProfile failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const getInboxContactProfileByKey = async (
  contactKey: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<InboxContactProfileRow | null> => {
  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query<InboxContactProfileRow>(
      `
      SELECT *
      FROM inbox_contact_profiles
      WHERE contact_key = $1
      LIMIT 1;
      `,
      [contactKey],
    );
    return result.rows[0] ?? null;
  } catch (err) {
    logger?.error('getInboxContactProfileByKey failed', err);
    throw err;
  } finally {
    client.release();
  }
};

export const listInboxContactProfilesByKeys = async (
  contactKeys: string[],
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<InboxContactProfileRow[]> => {
  if (contactKeys.length === 0) return [];

  const pool = getDbOrThrow();
  const client = await pool.connect();
  try {
    const result = await client.query<InboxContactProfileRow>(
      `
      SELECT *
      FROM inbox_contact_profiles
      WHERE contact_key = ANY($1::text[]);
      `,
      [contactKeys],
    );
    return result.rows;
  } catch (err) {
    logger?.error('listInboxContactProfilesByKeys failed', err);
    throw err;
  } finally {
    client.release();
  }
};
