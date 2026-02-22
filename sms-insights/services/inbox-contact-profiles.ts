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
        revenue_mix_category,
        employment_status,
        coaching_interest,
        dnc,
        raw
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
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
