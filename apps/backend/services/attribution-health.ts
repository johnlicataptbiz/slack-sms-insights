import { getPrismaClient } from './prisma.js';
import { isMissingSchemaError } from './schema-compat.js';

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
  let rows: Array<{
    max_booked_calls_ts: Date | null;
    max_attr_ts: Date | null;
  }> = [];
  try {
    rows = await prisma.$queryRawUnsafe<
      Array<{
        max_booked_calls_ts: Date | null;
        max_attr_ts: Date | null;
      }>
    >(
      `
      SELECT
        (SELECT MAX(event_ts) FROM booked_calls) AS max_booked_calls_ts,
        (SELECT MAX(booked_event_ts) FROM booked_call_attribution) AS max_attr_ts
      `,
    );
  } catch (error) {
    if (!isMissingSchemaError(error)) {
      throw error;
    }
  }
  const row = rows[0];
  const maxBooked = row?.max_booked_calls_ts ? new Date(row.max_booked_calls_ts) : null;
  const maxAttr = row?.max_attr_ts ? new Date(row.max_attr_ts) : null;
  const [openReviewItems, unresolvedAttrRows] = await Promise.all([
    prisma.attribution_review_queue
      .count({
        where: { status: { in: ['open', 'pending', 'needs_review'] } },
      })
      .catch((error) => {
        if (!isMissingSchemaError(error)) {
          throw error;
        }
        return 0;
      }),
    prisma
      .$queryRawUnsafe<Array<{ count: bigint }>>(
        `SELECT COUNT(*) as count FROM booked_call_attribution
         WHERE COALESCE(needs_review, false) = true OR attribution_status IS NULL`,
      )
      .catch((error) => {
        if (!isMissingSchemaError(error)) {
          throw error;
        }
        return [{ count: 0n }];
      }),
  ]);

  const unresolvedAttributions = Number(unresolvedAttrRows[0]?.count ?? 0);

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
