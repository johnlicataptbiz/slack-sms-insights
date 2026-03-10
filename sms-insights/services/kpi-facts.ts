import type { Logger } from '@slack/bolt';
import { getBookedCallAttributionSources, getBookedCallSmsReplyLinks, getBookedCallSequenceFromSmsEvents } from './booked-calls.js';
import { getPrismaClient } from './prisma.js';
import { attributeSlackBookedCallsToSequences } from './sequence-booked-attribution.js';

const getPrisma = () => getPrismaClient();

const MANUAL_LABEL = 'No sequence (manual/direct)';
const HIGH_CONFIDENCE_BOOKING_PATTERN =
  /\b(call booked|booked call|booked for|appointment booked|appointment confirmed|scheduled (?:a )?call|strategy call booked)\b/i;
const BOOKED_CONFIRMATION_LINK_PATTERN = /(?:https?:\/\/)?vip\.physicaltherapybiz\.com\/call-booked(?:[/?#][^\s]*)?/i;
const CANCELLATION_PATTERN = /\b(cancel|cancellation|delete me off your list|remove me|unsubscribe|stop)\b/i;

const normalizeRep = (value: string | null | undefined): string => {
  const normalized = (value || '').trim().toLowerCase();
  if (!normalized) return 'unknown';
  if (normalized.includes('jack')) return 'jack';
  if (normalized.includes('brandon')) return 'brandon';
  if (normalized.includes('john')) return 'john';
  if (normalized.includes('toni') || normalized.includes('tony')) return 'toni';
  return normalized;
};

const contactKeyFor = (event: { contact_id: string | null; contact_phone: string | null }): string | null => {
  if (event.contact_id) return `contact:${event.contact_id}`;
  if (event.contact_phone) return `phone:${event.contact_phone.replace(/\D/g, '')}`;
  return null;
};

const dayKey = (value: Date, timeZone: string): string => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const year = parts.find((part) => part.type === 'year')?.value || '1970';
  const month = parts.find((part) => part.type === 'month')?.value || '01';
  const day = parts.find((part) => part.type === 'day')?.value || '01';
  return `${year}-${month}-${day}`;
};

const toDayDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);

const isBookingSignal = (direction: string, body: string): boolean => {
  if (!body) return false;
  if (BOOKED_CONFIRMATION_LINK_PATTERN.test(body)) return true;
  return direction === 'inbound' && HIGH_CONFIDENCE_BOOKING_PATTERN.test(body) && !CANCELLATION_PATTERN.test(body);
};

const isOptOutSignal = (direction: string, body: string): boolean => direction === 'inbound' && CANCELLATION_PATTERN.test(body);

type FactRefreshParams = {
  from: Date;
  to: Date;
  timeZone: string;
};

export type KpiFactRefreshResult = {
  fromDay: string;
  toDay: string;
  smsRows: number;
  bookingRows: number;
  fallbackBookingRows: number;
  fallbackBookedTotal: number;
};

export const refreshKpiFacts = async (
  params: FactRefreshParams,
  logger?: Pick<Logger, 'info' | 'warn' | 'error'>,
): Promise<KpiFactRefreshResult> => {
  const prisma = getPrisma();

  const manual = await prisma.sequence_registry.upsert({
    where: { normalized_label: 'no sequence manual direct' },
    update: { is_manual_bucket: true },
    create: {
      label: MANUAL_LABEL,
      normalized_label: 'no sequence manual direct',
      is_manual_bucket: true,
    },
    select: { id: true },
  });

  const rangeFrom = new Date(params.from);
  const rangeTo = new Date(params.to);
  const scanFrom = new Date(rangeFrom.getTime() - 14 * 24 * 60 * 60 * 1000);

  const rows = await prisma.sms_events.findMany({
    where: {
      event_ts: { gte: scanFrom, lte: rangeTo },
      direction: { in: ['inbound', 'outbound'] },
    },
    orderBy: { event_ts: 'asc' },
    select: {
      event_ts: true,
      direction: true,
      sequence_id: true,
      sequence: true,
      aloware_user: true,
      body: true,
      contact_id: true,
      contact_phone: true,
    },
  });

  type Event = (typeof rows)[number] & { _contactKey: string; _rep: string; _seqId: string; _day: string };
  const events: Event[] = [];
  for (const row of rows) {
    const key = contactKeyFor(row);
    if (!key) continue;
    events.push({
      ...row,
      _contactKey: key,
      _rep: normalizeRep(row.aloware_user),
      _seqId: row.sequence_id || manual.id,
      _day: dayKey(row.event_ts, params.timeZone),
    });
  }

  const eventsByContact = new Map<string, Event[]>();
  for (const event of events) {
    const list = eventsByContact.get(event._contactKey) || [];
    list.push(event);
    eventsByContact.set(event._contactKey, list);
  }

  const smsMap = new Map<string, {
    day: string;
    sequenceId: string;
    repId: string;
    messagesSent: number;
    repliesReceived: number;
    optOuts: number;
    bookingSignalsSms: number;
    uniqueContactedSet: Set<string>;
    repliedSet: Set<string>;
    optOutSet: Set<string>;
  }>();

  const ensure = (day: string, sequenceId: string, repId: string) => {
    const key = `${day}|${sequenceId}|${repId}`;
    let row = smsMap.get(key);
    if (!row) {
      row = {
        day,
        sequenceId,
        repId,
        messagesSent: 0,
        repliesReceived: 0,
        optOuts: 0,
        bookingSignalsSms: 0,
        uniqueContactedSet: new Set<string>(),
        repliedSet: new Set<string>(),
        optOutSet: new Set<string>(),
      };
      smsMap.set(key, row);
    }
    return row;
  };

  const inRangeDay = (day: string): boolean => day >= dayKey(rangeFrom, params.timeZone) && day <= dayKey(rangeTo, params.timeZone);

  for (const event of events) {
    if (!inRangeDay(event._day)) continue;
    if (event.direction !== 'outbound') continue;
    const stat = ensure(event._day, event._seqId, event._rep);
    stat.messagesSent += 1;
    stat.uniqueContactedSet.add(event._contactKey);
  }

  for (const contactEvents of eventsByContact.values()) {
    for (const inbound of contactEvents) {
      if (!inRangeDay(inbound._day) || inbound.direction !== 'inbound') continue;

      const inboundTs = inbound.event_ts.getTime();
      let attributed: Event | null = null;
      let latestAny: Event | null = null;
      let latestSequenced: Event | null = null;

      for (const candidate of contactEvents) {
        if (candidate.direction !== 'outbound') continue;
        const ts = candidate.event_ts.getTime();
        if (ts > inboundTs) break;
        if (inboundTs - ts > 14 * 24 * 60 * 60 * 1000) continue;
        latestAny = candidate;
        if ((candidate.sequence || '').trim()) latestSequenced = candidate;
      }

      attributed = latestSequenced || latestAny;
      if (!attributed) continue;

      const stat = ensure(inbound._day, attributed._seqId, attributed._rep);
      if (!stat.repliedSet.has(inbound._contactKey)) {
        stat.repliedSet.add(inbound._contactKey);
        stat.repliesReceived += 1;
      }

      const body = (inbound.body || '').trim();
      if (isOptOutSignal(inbound.direction, body) && !stat.optOutSet.has(inbound._contactKey)) {
        stat.optOutSet.add(inbound._contactKey);
        stat.optOuts += 1;
      }

      if (isBookingSignal(inbound.direction, body)) {
        stat.bookingSignalsSms += 1;
      }
    }
  }

  const smsRows = Array.from(smsMap.values()).map((row) => ({
    day: row.day,
    sequenceId: row.sequenceId,
    repId: row.repId,
    messagesSent: row.messagesSent,
    uniqueContacted: row.uniqueContactedSet.size,
    repliesReceived: row.repliesReceived,
    optOuts: row.optOuts,
    bookingSignalsSms: row.bookingSignalsSms,
    replyRatePct: row.uniqueContactedSet.size > 0 ? (row.repliesReceived / row.uniqueContactedSet.size) * 100 : 0,
    optOutRatePct: row.messagesSent > 0 ? (row.optOuts / row.messagesSent) * 100 : 0,
  }));

  const fromDay = dayKey(rangeFrom, params.timeZone);
  const toDay = dayKey(rangeTo, params.timeZone);

  const sequenceRows = await prisma.sequence_registry.findMany({
    select: { id: true, label: true },
  });
  const messagesSentBySequenceId = new Map<string, number>();
  for (const row of smsRows) {
    messagesSentBySequenceId.set(row.sequenceId, (messagesSentBySequenceId.get(row.sequenceId) || 0) + row.messagesSent);
  }

  const sequenceRowsForAttribution = sequenceRows.map((row) => ({
    label: row.label,
    messagesSent: messagesSentBySequenceId.get(row.id) || 0,
    repliesReceived: 0,
    replyRatePct: 0,
    bookingSignalsSms: 0,
    booked: 0,
    optOuts: 0,
  }));

  const bookedCallSources = await getBookedCallAttributionSources({
    from: rangeFrom,
    to: rangeTo,
  });
  const attributionLogger = logger ? { ...logger, debug: logger.info } : undefined;
  const [smsReplyLinks, smsSequenceLookup] = await Promise.all([
    getBookedCallSmsReplyLinks(bookedCallSources, attributionLogger),
    getBookedCallSequenceFromSmsEvents(bookedCallSources, attributionLogger),
  ]);
  const sequenceAttribution = attributeSlackBookedCallsToSequences(
    sequenceRowsForAttribution,
    bookedCallSources,
    smsReplyLinks,
    smsSequenceLookup,
  );

  const bookingRowsMap = new Map<string, {
    day_key: string;
    sequence_key: string;
    setter: string;
    booked_total: number;
    booked_jack: number;
    booked_brandon: number;
    booked_self: number;
    booked_after_sms_reply: number;
  }>();

  const bumpBookingRow = (input: {
    eventTs: string;
    sequenceLabel: string;
    bucket: 'jack' | 'brandon' | 'selfBooked';
    strictSmsReplyLinked: boolean;
  }) => {
    const dayKeyValue = dayKey(new Date(input.eventTs), params.timeZone);
    const setter = input.bucket === 'jack' ? 'jack' : input.bucket === 'brandon' ? 'brandon' : 'unknown';
    const key = `${dayKeyValue}|${input.sequenceLabel}|${setter}`;
    const row = bookingRowsMap.get(key) || {
      day_key: dayKeyValue,
      sequence_key: input.sequenceLabel,
      setter,
      booked_total: 0,
      booked_jack: 0,
      booked_brandon: 0,
      booked_self: 0,
      booked_after_sms_reply: 0,
    };
    row.booked_total += 1;
    if (input.bucket === 'jack') row.booked_jack += 1;
    else if (input.bucket === 'brandon') row.booked_brandon += 1;
    else row.booked_self += 1;
    if (input.strictSmsReplyLinked) row.booked_after_sms_reply += 1;
    bookingRowsMap.set(key, row);
  };

  for (const [sequenceLabel, breakdown] of sequenceAttribution.byLabel.entries()) {
    for (const auditRow of breakdown.auditRows) {
      bumpBookingRow({
        eventTs: auditRow.eventTs,
        sequenceLabel,
        bucket: auditRow.bucket,
        strictSmsReplyLinked: auditRow.strictSmsReplyLinked,
      });
    }
  }
  for (const missing of sequenceAttribution.unattributedAuditRows) {
    bumpBookingRow({
      eventTs: missing.eventTs,
      sequenceLabel: MANUAL_LABEL,
      bucket: missing.bucket,
      strictSmsReplyLinked: false,
    });
  }

  const bookingRows = Array.from(bookingRowsMap.values());

  const rawBookedFallbackRows = await prisma.$queryRawUnsafe<Array<{
    day_key: string;
    booked_total: number;
  }>>(
    `SELECT
       to_char(date_trunc('day', event_ts AT TIME ZONE $3), 'YYYY-MM-DD') AS day_key,
       COUNT(*)::int AS booked_total
     FROM booked_calls
     WHERE event_ts >= $1::timestamptz
       AND event_ts <= $2::timestamptz
     GROUP BY 1`,
    rangeFrom.toISOString(),
    rangeTo.toISOString(),
    params.timeZone,
  );

  // If attribution view is stale/incomplete, preserve booking continuity using raw booked_calls.
  const fallbackDayTotals = new Map(rawBookedFallbackRows.map((row) => [row.day_key, row.booked_total]));
  for (const row of bookingRows) {
    fallbackDayTotals.set(row.day_key, Math.max(0, (fallbackDayTotals.get(row.day_key) || 0) - row.booked_total));
  }

  let fallbackBookingRows = 0;
  let fallbackBookedTotal = 0;
  for (const [, residualBooked] of fallbackDayTotals.entries()) {
    if (residualBooked <= 0) continue;
    fallbackBookingRows += 1;
    fallbackBookedTotal += residualBooked;
  }

  const mergedBookingRowsMap = new Map<string, {
    day_key: string;
    sequence_key: string;
    setter: string;
    booked_total: number;
    booked_jack: number;
    booked_brandon: number;
    booked_self: number;
    booked_after_sms_reply: number;
  }>();
  for (const row of bookingRows) {
    const mergeKey = `${row.day_key}|${row.sequence_key}|${row.setter}`;
    const existing = mergedBookingRowsMap.get(mergeKey);
    if (!existing) {
      mergedBookingRowsMap.set(mergeKey, { ...row });
      continue;
    }
    existing.booked_total += row.booked_total;
    existing.booked_jack += row.booked_jack;
    existing.booked_brandon += row.booked_brandon;
    existing.booked_self += row.booked_self;
    existing.booked_after_sms_reply += row.booked_after_sms_reply;
  }
  const mergedBookingRows = Array.from(mergedBookingRowsMap.values());

  const bookingAliases = Array.from(new Set(mergedBookingRows.map((row) => row.sequence_key).filter(Boolean)));
  const aliasRows =
    bookingAliases.length > 0
      ? await prisma.sequence_aliases.findMany({
          where: { raw_label: { in: bookingAliases } },
          select: { raw_label: true, sequence_id: true },
        })
      : [];
  const aliasByRawLabel = new Map(aliasRows.map((row) => [row.raw_label, row.sequence_id]));
  const smsBaseMap = new Map(
    smsRows.map((row) => [
      `${row.day}|${row.sequenceId}|${row.repId}`,
      { uniqueContacted: row.uniqueContacted, bookingSignalsSms: row.bookingSignalsSms },
    ]),
  );

  const bookingFactRows = mergedBookingRows.map((row) => {
    const sequenceId = aliasByRawLabel.get(row.sequence_key) || manual.id;
    const repId = normalizeRep(row.setter);
    const smsBase = smsBaseMap.get(`${row.day_key}|${sequenceId}|${repId}`);
    const uniqueContacted = smsBase?.uniqueContacted || 0;
    return {
      day: toDayDate(row.day_key),
      sequence_id: sequenceId,
      rep_id: repId,
      booked_total: row.booked_total,
      booked_jack: row.booked_jack,
      booked_brandon: row.booked_brandon,
      booked_self: row.booked_self,
      booked_after_sms_reply: row.booked_after_sms_reply,
      booking_rate_pct: uniqueContacted > 0 ? (row.booked_total / uniqueContacted) * 100 : 0,
      diagnostic_booking_signals: smsBase?.bookingSignalsSms || 0,
    };
  });

  const leadRows = await prisma.$queryRawUnsafe<Array<{
    day_key: string;
    sequence_id: string;
    rep_id: string;
    leads_count: number;
    p0: number;
    p1: number;
    p2: number;
    p3: number;
    p4: number;
    rm_cash: number;
    rm_ins: number;
    rm_bal: number;
    rm_unknown: number;
    emp_full: number;
    emp_part: number;
    emp_unknown: number;
    ci_high: number;
    ci_med: number;
    ci_low: number;
    ci_unknown: number;
  }>>(
    `WITH latest_touch AS (
       SELECT
         c.id AS conversation_id,
         COALESCE(se.sequence_id, $3::uuid) AS sequence_id,
         COALESCE(NULLIF(lower(trim(se.aloware_user)), ''), 'unknown') AS rep_id
       FROM conversations c
       LEFT JOIN LATERAL (
         SELECT sequence_id, aloware_user
         FROM sms_events
         WHERE conversation_id = c.id
           AND direction = 'outbound'
         ORDER BY event_ts DESC
         LIMIT 1
       ) se ON TRUE
     )
     SELECT
       to_char(date_trunc('day', cs.updated_at AT TIME ZONE $4), 'YYYY-MM-DD') AS day_key,
       lt.sequence_id,
       lt.rep_id,
       COUNT(*)::int AS leads_count,
       COUNT(*) FILTER (WHERE cs.qualification_progress_step = 0)::int AS p0,
       COUNT(*) FILTER (WHERE cs.qualification_progress_step = 1)::int AS p1,
       COUNT(*) FILTER (WHERE cs.qualification_progress_step = 2)::int AS p2,
       COUNT(*) FILTER (WHERE cs.qualification_progress_step = 3)::int AS p3,
       COUNT(*) FILTER (WHERE cs.qualification_progress_step >= 4)::int AS p4,
       COUNT(*) FILTER (WHERE cs.qualification_revenue_mix = 'mostly_cash')::int AS rm_cash,
       COUNT(*) FILTER (WHERE cs.qualification_revenue_mix = 'mostly_insurance')::int AS rm_ins,
       COUNT(*) FILTER (WHERE cs.qualification_revenue_mix = 'balanced')::int AS rm_bal,
       COUNT(*) FILTER (WHERE cs.qualification_revenue_mix = 'unknown' OR cs.qualification_revenue_mix IS NULL)::int AS rm_unknown,
       COUNT(*) FILTER (WHERE cs.qualification_full_or_part_time = 'full_time')::int AS emp_full,
       COUNT(*) FILTER (WHERE cs.qualification_full_or_part_time = 'part_time')::int AS emp_part,
       COUNT(*) FILTER (WHERE cs.qualification_full_or_part_time = 'unknown' OR cs.qualification_full_or_part_time IS NULL)::int AS emp_unknown,
       COUNT(*) FILTER (WHERE cs.qualification_coaching_interest = 'high')::int AS ci_high,
       COUNT(*) FILTER (WHERE cs.qualification_coaching_interest = 'medium')::int AS ci_med,
       COUNT(*) FILTER (WHERE cs.qualification_coaching_interest = 'low')::int AS ci_low,
       COUNT(*) FILTER (WHERE cs.qualification_coaching_interest = 'unknown' OR cs.qualification_coaching_interest IS NULL)::int AS ci_unknown
     FROM conversation_state cs
     JOIN latest_touch lt ON lt.conversation_id = cs.conversation_id
     WHERE cs.updated_at >= $1::timestamptz
       AND cs.updated_at <= $2::timestamptz
     GROUP BY 1,2,3`,
    rangeFrom.toISOString(),
    rangeTo.toISOString(),
    manual.id,
    params.timeZone,
  );

  const leadFactRows = leadRows.map((row) => ({
    day: toDayDate(row.day_key),
    sequence_id: row.sequence_id,
    rep_id: row.rep_id,
    leads_count: row.leads_count,
    progress_step_0_count: row.p0,
    progress_step_1_count: row.p1,
    progress_step_2_count: row.p2,
    progress_step_3_count: row.p3,
    progress_step_4_count: row.p4,
    revenue_mix_mostly_cash: row.rm_cash,
    revenue_mix_mostly_ins: row.rm_ins,
    revenue_mix_balanced: row.rm_bal,
    revenue_mix_unknown: row.rm_unknown,
    employment_full_time: row.emp_full,
    employment_part_time: row.emp_part,
    employment_unknown: row.emp_unknown,
    coaching_interest_high: row.ci_high,
    coaching_interest_medium: row.ci_med,
    coaching_interest_low: row.ci_low,
    coaching_interest_unknown: row.ci_unknown,
    source_bucket_unknown: 0,
    source_bucket_known: 0,
  }));

  const mondayRows = await prisma.$queryRawUnsafe<Array<{
    board_id: string;
    board_class: string;
    sync_status: string | null;
    source_coverage_pct: number;
    campaign_coverage_pct: number;
    set_by_coverage_pct: number;
    touchpoints_coverage_pct: number;
    snapshot_count: number;
    lead_attribution_count: number;
    metric_fact_count: number;
  }>>(
    `SELECT
       board_id,
       board_class,
       sync_status,
       source_coverage_pct,
       campaign_coverage_pct,
       set_by_coverage_pct,
       touchpoints_coverage_pct,
       snapshot_count,
       lead_attribution_count,
       metric_fact_count
     FROM analytics_data_quality_v`,
  );

  const mondayDayDate = toDayDate(toDay);
  const mondayFactRows = mondayRows.map((row) => ({
    day: mondayDayDate,
    board_id: row.board_id,
    board_class: row.board_class,
    sync_status: row.sync_status,
    is_stale: row.sync_status !== 'success',
    source_coverage_pct: Number(row.source_coverage_pct || 0),
    campaign_coverage_pct: Number(row.campaign_coverage_pct || 0),
    set_by_coverage_pct: Number(row.set_by_coverage_pct || 0),
    touchpoints_coverage_pct: Number(row.touchpoints_coverage_pct || 0),
    snapshot_count: Number(row.snapshot_count || 0),
    lead_attribution_count: Number(row.lead_attribution_count || 0),
    metric_fact_count: Number(row.metric_fact_count || 0),
  }));

  const writes = [
    prisma.$executeRawUnsafe(`DELETE FROM fact_sms_daily WHERE day >= $1::date AND day <= $2::date`, fromDay, toDay),
    ...(smsRows.length > 0
      ? [
          prisma.fact_sms_daily.createMany({
            data: smsRows.map((row) => ({
              day: toDayDate(row.day),
              sequence_id: row.sequenceId,
              rep_id: row.repId,
              messages_sent: row.messagesSent,
              unique_contacted: row.uniqueContacted,
              replies_received: row.repliesReceived,
              opt_outs: row.optOuts,
              booking_signals_sms: row.bookingSignalsSms,
              reply_rate_pct: row.replyRatePct,
              opt_out_rate_pct: row.optOutRatePct,
            })),
          }),
        ]
      : []),
    prisma.$executeRawUnsafe(`DELETE FROM fact_booking_daily WHERE day >= $1::date AND day <= $2::date`, fromDay, toDay),
    ...(bookingFactRows.length > 0
      ? [
          prisma.fact_booking_daily.createMany({
            data: bookingFactRows,
          }),
        ]
      : []),
    prisma.$executeRawUnsafe(`DELETE FROM fact_lead_quality_daily WHERE day >= $1::date AND day <= $2::date`, fromDay, toDay),
    ...(leadFactRows.length > 0
      ? [
          prisma.fact_lead_quality_daily.createMany({
            data: leadFactRows,
          }),
        ]
      : []),
    prisma.$executeRawUnsafe(`DELETE FROM fact_monday_health_daily WHERE day >= $1::date AND day <= $2::date`, fromDay, toDay),
    ...(mondayFactRows.length > 0
      ? [
          prisma.fact_monday_health_daily.createMany({
            data: mondayFactRows,
          }),
        ]
      : []),
  ];

  await prisma.$transaction(writes);

  logger?.info?.('kpi-facts: refreshed daily facts', {
    fromDay,
    toDay,
    smsRows: smsRows.length,
    bookingRows: bookingFactRows.length,
    fallbackBookingRows,
    fallbackBookedTotal,
  });

  return {
    fromDay,
    toDay,
    smsRows: smsRows.length,
    bookingRows: bookingFactRows.length,
    fallbackBookingRows,
    fallbackBookedTotal,
  };
};
