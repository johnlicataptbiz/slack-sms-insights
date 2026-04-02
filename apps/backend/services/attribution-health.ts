import { getPrismaClient } from './prisma.js';

const getPrisma = () => getPrismaClient();

export type AttributionLagStatus = {
  maxBookedCallsTs: string | null;
  maxAttributionTs: string | null;
  lagHours: number | null;
  isLagging: boolean;
  openReviewItems: number;
  unresolvedAttributions: number;
};

export const getAttributionLagStatus = async (thresholdHours = 24): Promise<AttributionLagStatus> => {
  const prisma = getPrisma();
  const rows = (await prisma.$queryRawUnsafe(
    `
    SELECT
      (SELECT MAX(event_ts) FROM booked_calls) AS max_booked_calls_ts,
      (SELECT MAX(booked_event_ts) FROM booked_call_attribution) AS max_attr_ts
    `,
  )) as Array<{
    max_booked_calls_ts: Date | null;
    max_attr_ts: Date | null;
  }>;
  const row = rows[0];
  const maxBooked = row?.max_booked_calls_ts ? new Date(row.max_booked_calls_ts) : null;
  const maxAttr = row?.max_attr_ts ? new Date(row.max_attr_ts) : null;
  const [openReviewItems, unresolvedAttrRows] = await Promise.all([
    prisma
      .$queryRawUnsafe(
        `SELECT COUNT(*)::bigint AS count
         FROM attribution_review_queue
         WHERE status IN ('open','pending','needs_review')`,
      )
      .then((value) => {
        const rows = value as Array<{ count: bigint | number | string }>;
        return Number(rows[0]?.count ?? 0);
      }),
    prisma.$queryRawUnsafe(
      `SELECT COUNT(*) as count FROM booked_call_attribution
       WHERE COALESCE(needs_review, false) = true OR attribution_status IS NULL`,
    ),
  ]);

  const unresolvedRows = unresolvedAttrRows as Array<{ count: bigint | number | string }>;
  const unresolvedAttributions = Number(unresolvedRows[0]?.count ?? 0);

  let lagHours: number | null = null;
  if (maxBooked && maxAttr) {
    lagHours = (maxBooked.getTime() - maxAttr.getTime()) / (1000 * 60 * 60);
  }

  return {
    maxBookedCallsTs: maxBooked ? maxBooked.toISOString() : null,
    maxAttributionTs: maxAttr ? maxAttr.toISOString() : null,
    lagHours: lagHours != null ? Number(lagHours.toFixed(2)) : null,
    isLagging: lagHours != null ? lagHours > thresholdHours : false,
    openReviewItems,
    unresolvedAttributions,
  };
};
