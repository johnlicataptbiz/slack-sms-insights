import type { Logger } from '@slack/bolt';
import { lookupAlowareNumberLrn } from './aloware-client.js';
import { getPool } from './db.js';
import { upsertInboxContactProfile } from './inbox-contact-profiles.js';

export type LrnBackfillOptions = {
  dryRun: boolean;
  limit: number;
  offset: number;
  delayMs: number;
  forceAll: boolean;
  staleDays: number;
};

export type LrnBackfillSummary = {
  mode: 'dry-run' | 'write';
  limit: number;
  offset: number;
  delayMs: number;
  staleDays: number;
  forceAll: boolean;
  candidateRows: number;
  uniquePhones: number;
  lookedUp: number;
  updated: number;
  withResult: number;
  errors: number;
};

type LrnBackfillHooks = {
  onProgress?: (summary: LrnBackfillSummary, current: number, total: number) => void;
};

type CandidateRow = {
  contact_key: string;
  phone: string | null;
  lrn_last_checked_at: string | null;
};

type LrnLogger = Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>;

const parseIntFlag = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePhone = (value: string | null): string | null => {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  if (digits.length >= 10) return digits.slice(-10);
  return null;
};

const asString = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const sleep = async (ms: number): Promise<void> => {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
};

const fetchCandidates = async (options: LrnBackfillOptions): Promise<CandidateRow[]> => {
  const pool = getPool();
  if (!pool) throw new Error('Database not initialized');

  const result = await pool.query<CandidateRow>(
    `
    SELECT
      contact_key,
      phone,
      lrn_last_checked_at::text
    FROM inbox_contact_profiles
    WHERE phone IS NOT NULL
      AND BTRIM(phone) <> ''
      AND (
        $3::boolean = true
        OR lrn_last_checked_at IS NULL
        OR lrn_last_checked_at < NOW() - make_interval(days => $4::int)
      )
    ORDER BY COALESCE(lrn_last_checked_at, to_timestamp(0)) ASC, updated_at DESC
    LIMIT $1
    OFFSET $2
    `,
    [options.limit, options.offset, options.forceAll, options.staleDays],
  );
  return result.rows;
};

export const getDefaultLrnBackfillOptions = (): LrnBackfillOptions => ({
  dryRun: true,
  limit: Math.max(1, parseIntFlag(process.env.LRN_BACKFILL_LIMIT, 400)),
  offset: Math.max(0, parseIntFlag(process.env.LRN_BACKFILL_OFFSET, 0)),
  delayMs: Math.max(0, parseIntFlag(process.env.LRN_BACKFILL_DELAY_MS, 350)),
  forceAll: false,
  staleDays: Math.max(0, parseIntFlag(process.env.LRN_BACKFILL_STALE_DAYS, 30)),
});

export const runLrnBackfill = async (
  options: LrnBackfillOptions,
  logger?: LrnLogger,
  hooks?: LrnBackfillHooks,
): Promise<LrnBackfillSummary> => {
  const candidates = await fetchCandidates(options);
  const uniquePhones = new Set(
    candidates.map((row) => normalizePhone(row.phone)).filter((phone): phone is string => !!phone),
  );

  const summary: LrnBackfillSummary = {
    mode: options.dryRun ? 'dry-run' : 'write',
    limit: options.limit,
    offset: options.offset,
    delayMs: options.delayMs,
    staleDays: options.staleDays,
    forceAll: options.forceAll,
    candidateRows: candidates.length,
    uniquePhones: uniquePhones.size,
    lookedUp: 0,
    updated: 0,
    withResult: 0,
    errors: 0,
  };

  if (options.dryRun || candidates.length === 0) {
    return summary;
  }

  const cache = new Map<string, Record<string, unknown> | null>();

  for (const [index, row] of candidates.entries()) {
    const normalizedPhone = normalizePhone(row.phone);
    if (!normalizedPhone) continue;

    try {
      let lookupPayload = cache.get(normalizedPhone) ?? null;
      if (!cache.has(normalizedPhone)) {
        const response = await lookupAlowareNumberLrn(normalizedPhone, logger);
        lookupPayload = response && typeof response === 'object' ? (response as Record<string, unknown>) : null;
        cache.set(normalizedPhone, lookupPayload);
        summary.lookedUp += 1;
      }

      const data =
        lookupPayload?.data && typeof lookupPayload.data === 'object'
          ? (lookupPayload.data as Record<string, unknown>)
          : null;

      const lrnLineType = asString(lookupPayload?.line_type) || asString(data?.line_type);
      const lrnCarrier =
        asString(lookupPayload?.carrier) || asString(data?.spid_carrier_name) || asString(data?.carrier);
      const lrnCity = asString(lookupPayload?.cnam_city) || asString(data?.city);
      const lrnState = asString(lookupPayload?.cnam_state) || asString(data?.state);
      const lrnCountry = asString(lookupPayload?.cnam_country) || asString(data?.country);
      if (lookupPayload) summary.withResult += 1;

      await upsertInboxContactProfile(
        {
          contactKey: row.contact_key,
          phone: normalizedPhone,
          lrnLineType,
          lrnCarrier,
          lrnCity,
          lrnState,
          lrnCountry,
          lrnLastCheckedAt: new Date().toISOString(),
        },
        logger,
      );

      summary.updated += 1;
    } catch (error) {
      summary.errors += 1;
      logger?.warn?.(`LRN backfill failed for contact_key=${row.contact_key}`, error);
    }

    hooks?.onProgress?.(summary, index + 1, candidates.length);

    await sleep(options.delayMs);
  }

  return summary;
};
