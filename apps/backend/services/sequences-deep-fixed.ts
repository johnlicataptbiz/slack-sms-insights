import type { Logger } from '@slack/bolt';
import { getPrismaClient } from './prisma.js';

const getPrisma = () => getPrismaClient();

const DEFAULT_SALES_TEAM_BOARD_ID = '5077164868';
const isMondayBackfillLabel = (label: string): boolean => label.toLowerCase().includes('monday backfill');
const HIGH_CONFIDENCE_BOOKING_PATTERN =
  /\b(call booked|booked call|booked for|appointment booked|appointment confirmed|scheduled (?:a )?call|strategy call booked)\b/i;
const BOOKED_CONFIRMATION_LINK_PATTERN = /(?:https?:\/\/)?vip\.physicaltherapybiz\.com\/call-booked(?:[/?#][^\s]*)?/i;
const CANCELLATION_PATTERN = /\b(cancel|cancellation|delete me off your list|remove me|unsubscribe|stop)\b/i;

const contactKeyFor = (event: { contact_id: string | null; contact_phone: string | null }): string | null => {
  if (event.contact_id) return `contact:${event.contact_id}`;
  if (event.contact_phone) return `phone:${event.contact_phone.replace(/\D/g, '')}`;
  return null;
};

const isBookingSignal = (direction: string, body: string): boolean => {
  if (!body) return false;
  if (BOOKED_CONFIRMATION_LINK_PATTERN.test(body)) return true;
  return direction === 'inbound' && HIGH_CONFIDENCE_BOOKING_PATTERN.test(body) && !CANCELLATION_PATTERN.test(body);
};

const isOptOutSignal = (direction: string, body: string): boolean =>
  direction === 'inbound' && CANCELLATION_PATTERN.test(body);

export type SequenceDeepParams = {
  from: Date;
  to: Date;
  timeZone: string;
  status?: 'active' | 'inactive' | null;
};

export type SequenceDeepPayload = {
  window: { from: string; to: string; timeZone: string };
  warnings?: string[];
  sequences: Array<{
    sequenceId: string;
    label: string;
    leadMagnet: string;
    versionTag: string;
    status: 'active' | 'inactive';
    ownerRep: string | null;
    isManualBucket: boolean;
    messagesSent: number;
    uniqueContacted: number;
    inboundTexts: number;
    repliesReceived: number;
    replyRatePct: number;
    bookedCalls: number;
    bookingRatePct: number;
    optOuts: number;
    optOutRatePct: number;
    bookedBreakdown: {
      jack: number;
      brandon: number;
      selfBooked: number;
      bookedAfterSmsReply: number;
      diagnosticSignals: number;
    };
    leadQuality: {
      leadsCount: number;
      highInterestPct: number;
      fullTimePct: number;
      mostlyCashPct: number;
      progressedToStep3Or4Pct: number;
    };
  }>;
  monday: {
    boards: number;
    staleBoards: number;
    erroredBoards: number;
    avgSourceCoveragePct: number;
    avgCampaignCoveragePct: number;
    avgSetByCoveragePct: number;
    avgTouchpointsCoveragePct: number;
  };
};

export const getSequencesDeep = async (
  params: SequenceDeepParams,
  logger?: Pick<Logger, 'warn'>,
): Promise<SequenceDeepPayload> => {
  const prisma = getPrisma();
  const salesTeamBoardId = (process.env.MONDAY_SALES_TEAM_BOARD_ID || DEFAULT_SALES_TEAM_BOARD_ID).trim();
  const fromDay = params.from.toISOString().slice(0, 10);
  const toDay = params.to.toISOString().slice(0, 10);
  const scanFrom = new Date(params.from.getTime() - 14 * 24 * 60 * 60 * 1000);

  const warnings: string[] = [];

  let bookingRows: any[] = [];
  try {
    bookingRows = await prisma.fact_booking_daily.findMany({
      where: {
        day: {
          gte: new Date(`${fromDay}T00:00:00.000Z`),
          lte: new Date(`${toDay}T00:00:00.000Z`),
        },
      },
      select: {
        sequence_id: true,
        booked_total: true,
        booked_jack: true,
        booked_brandon: true,
        booked_self: true,
        booked_after_sms_reply: true,
        diagnostic_booking_signals: true,
      },
    });
  } catch (e) {
    warnings.push('fact_booking_daily unavailable');
    logger?.warn?.('sequences-deep-fixed: fact_booking_daily unavailable', e);
  }

  let sequenceRows: any[] = [];
  try {
    sequenceRows = await prisma.sequence_registry.findMany({
      where: params.status ? { status: params.status } : undefined,
      select: {
        id: true,
        label: true,
        lead_magnet: true,
        version_tag: true,
        owner_rep: true,
        status: true,
        is_manual_bucket: true,
      },
      orderBy: { label: 'asc' },
    });
  } catch (e) {
    warnings.push('sequence_registry unavailable');
    logger?.warn?.('sequences-deep-fixed: sequence_registry unavailable', e);
  }

  let mondayRows: any[] = [];
  try {
    mondayRows = await prisma.fact_monday_health_daily.findMany({
      where: {
        day: {
          gte: new Date(`${fromDay}T00:00:00.000Z`),
          lte: new Date(`${toDay}T00:00:00.000Z`),
        },
      },
      select: {
        board_id: true,
        is_stale: true,
        sync_status: true,
        source_coverage_pct: true,
        campaign_coverage_pct: true,
        set_by_coverage_pct: true,
        touchpoints_coverage_pct: true,
      },
    });
  } catch (e) {
    warnings.push('fact_monday_health_daily unavailable');
    logger?.warn?.('sequences-deep-fixed: fact_monday_health_daily unavailable', e);
  }

  let rawEventRows: any[] = [];
  try {
    rawEventRows = await prisma.sms_events.findMany({
      where: {
        event_ts: { gte: scanFrom, lte: params.to },
        direction: { in: ['inbound', 'outbound'] },
      },
      orderBy: { event_ts: 'asc' },
      select: {
        event_ts: true,
        direction: true,
        sequence_id: true,
        body: true,
        contact_id: true,
        contact_phone: true,
      },
    });
  } catch (e) {
    warnings.push('sms_events unavailable');
    logger?.warn?.('sequences-deep-fixed: sms_events unavailable', e);
  }

  const manualSequenceId = sequenceRows?.find((row: any) => row.is_manual_bucket)?.id || null;
  const backfillSequenceIds = new Set(
    sequenceRows?.filter((row: any) => isMondayBackfillLabel(row.label)).map((row: any) => row.id) || [],
  );

  const resolveSequenceId = (sequenceId: string): string =>
    manualSequenceId && backfillSequenceIds.has(sequenceId) ? manualSequenceId : sequenceId;

  interface SmsEventExtended {
    event_ts: Date;
    direction: string;
    sequence_id: string | null;
    body: string | null;
    contact_id: string | null;
    contact_phone: string | null;
    _contactKey: string;
    _seqId: string;
  }

  const events: SmsEventExtended[] = [];
  for (const row of rawEventRows) {
    const contactKey = contactKeyFor(row);
    if (!contactKey) continue;
    const resolvedSequenceId = row.sequence_id || manualSequenceId;
    if (!resolvedSequenceId) continue;
    events.push({
      ...row,
      _contactKey: contactKey,
      _seqId: resolveSequenceId(resolvedSequenceId),
    } as SmsEventExtended);
  }

  interface SequenceSummary {
    messagesSent: number;
    inboundTexts: number;
    repliesReceived: number;
    optOuts: number;
    uniqueContacted: number;
  }

  const summary = new Map<string, SequenceSummary>();

  const ensure = (sequenceId: string) => {
    let row = summary.get(sequenceId);
    if (!row) {
      row = { messagesSent: 0, inboundTexts: 0, repliesReceived: 0, optOuts: 0, uniqueContacted: 0 };
      summary.set(sequenceId, row);
    }
    return row;
  };

  for (const event of events) {
    if (event.event_ts < params.from || event.direction !== 'outbound') continue;
    const stat = ensure(event._seqId);
    stat.messagesSent += 1;
    stat.uniqueContacted += 1;
  }

  for (const event of events) {
    if (event.event_ts < params.from || event.direction !== 'inbound') continue;
    const stat = ensure(event._seqId);
    stat.inboundTexts += 1;
    stat.repliesReceived += 1;
  }

  const sequences = sequenceRows
    ?.filter((row: any) => !backfillSequenceIds.has(row.id))
    .map((row: any) => {
      const stat = summary.get(row.id);
      return {
        sequenceId: row.id,
        label: row.label || 'Unknown',
        leadMagnet: row.lead_magnet || row.label || 'Unknown',
        versionTag: row.version_tag || '',
        status: row.status || 'unknown',
        ownerRep: row.owner_rep || null,
        isManualBucket: row.is_manual_bucket || false,
        messagesSent: stat?.messagesSent || 0,
        uniqueContacted: stat?.uniqueContacted || 0,
        inboundTexts: stat?.inboundTexts || 0,
        repliesReceived: stat?.repliesReceived || 0,
        replyRatePct: stat ? (stat.repliesReceived / stat.uniqueContacted) * 100 : 0,
        bookedCalls: 0,
        bookingRatePct: 0,
        optOuts: stat?.optOuts || 0,
        optOutRatePct: stat ? (stat.optOuts / stat.messagesSent) * 100 : 0,
        bookedBreakdown: { jack: 0, brandon: 0, selfBooked: 0, bookedAfterSmsReply: 0, diagnosticSignals: 0 },
        leadQuality: { leadsCount: 0, highInterestPct: 0, fullTimePct: 0, mostlyCashPct: 0, progressedToStep3Or4Pct: 0 },
      };
    }) || [];

  const boards = mondayRows ? new Set(mondayRows.map((row: any) => row.board_id)).size : 0;
  const staleBoards = mondayRows ? mondayRows.filter((row: any) => row.is_stale).length : 0;
  const erroredBoards = mondayRows ? mondayRows.filter((row: any) => row.sync_status === 'error').length : 0;

  return {
    window: {
      from: params.from.toISOString(),
      to: params.to.toISOString(),
      timeZone: params.timeZone,
    },
    ...(warnings.length > 0 && { warnings }),
    sequences,
    monday: {
      boards,
      staleBoards,
      erroredBoards,
      avgSourceCoveragePct: 0,
      avgCampaignCoveragePct: 0,
      avgSetByCoveragePct: 0,
      avgTouchpointsCoveragePct: 0,
    },
  };
};
