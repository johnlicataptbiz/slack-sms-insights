import type { Logger } from '@slack/bolt';
import { getPrismaClient } from './prisma.js';
import type {
  CoachingInterest,
  DeliveryModel,
  EmploymentStatus,
  InboxContactProfileRow,
  RevenueMixCategory,
} from './inbox-contact-profiles.js';

export type CadenceStatus = 'idle' | 'podcast_sent' | 'call_offered' | 'nurture_pool';

export type ConversationStateRow = {
  conversation_id: string;
  qualification_full_or_part_time: EmploymentStatus;
  qualification_niche: string | null;
  qualification_revenue_mix: RevenueMixCategory;
  qualification_delivery_model: DeliveryModel;
  qualification_coaching_interest: CoachingInterest;
  qualification_progress_step: number;
  escalation_level: 1 | 2 | 3 | 4;
  escalation_reason: string | null;
  escalation_overridden: boolean;
  last_podcast_sent_at: Date | null;
  next_followup_due_at: Date | null;
  cadence_status: CadenceStatus;
  // Phase 3 columns
  objection_tags: string[];
  guardrail_override_count: number;
  call_outcome: string | null;
  created_at: Date;
  updated_at: Date;
};

export type SendAttemptStatus = 'blocked' | 'queued' | 'sent' | 'failed';

export type SendAttemptRow = {
  id: string;
  conversation_id: string;
  message_body: string;
  sender_identity: string | null;
  line_id: string | null;
  from_number: string | null;
  allowlist_decision: boolean;
  dnc_decision: boolean;
  idempotency_key: string | null;
  status: SendAttemptStatus;
  retry_count: number;
  request_payload: unknown | null;
  response_payload: unknown | null;
  error_message: string | null;
  created_at: Date;
};

export type DraftSuggestionRow = {
  id: string;
  conversation_id: string;
  prompt_snapshot_hash: string;
  retrieved_exemplar_ids: unknown | null;
  generated_text: string;
  lint_score: number;
  structural_score: number;
  lint_issues: unknown | null;
  accepted: boolean;
  edited: boolean;
  send_linked_event_id: string | null;
  raw: unknown | null;
  created_at: Date;
  updated_at: Date;
};

export type ConversionExampleRow = {
  id: string;
  source_outbound_event_id: string;
  booked_call_label: string | null;
  closed_won_label: string | null;
  escalation_level: 1 | 2 | 3 | 4;
  structure_signature: string | null;
  qualifier_snapshot: unknown | null;
  channel_marker: string;
  created_at: Date;
};

export type UpsertConversionExampleInput = {
  sourceOutboundEventId: string;
  bookedCallLabel?: string | null;
  closedWonLabel?: string | null;
  escalationLevel: 1 | 2 | 3 | 4;
  structureSignature?: string | null;
  qualifierSnapshot?: unknown | null;
  channelMarker?: string | null;
};

export type SetterVoiceExampleRow = {
  id: string;
  conversation_id: string | null;
  event_ts: Date;
  body: string | null;
  line: string | null;
  aloware_user: string | null;
  from_conversion_example: boolean;
  escalation_level: 1 | 2 | 3 | 4 | null;
};

export type InboxConversationListRow = {
  id: string;
  contact_key: string;
  contact_id: string | null;
  contact_phone: string | null;
  current_rep_id: string | null;
  status: 'open' | 'closed' | 'dnc';
  last_inbound_at: Date | null;
  last_outbound_at: Date | null;
  last_touch_at: Date | null;
  unreplied_inbound_count: number;
  next_followup_due_at: Date | null;
  created_at: Date;
  updated_at: Date;
  profile_name: string | null;
  profile_phone: string | null;
  profile_email: string | null;
  profile_timezone: string | null;
  profile_niche: string | null;
  profile_revenue_mix_category: RevenueMixCategory | null;
  profile_employment_status: EmploymentStatus | null;
  profile_coaching_interest: CoachingInterest | null;
  profile_dnc: boolean | null;
  state_qualification_full_or_part_time: EmploymentStatus | null;
  state_qualification_niche: string | null;
  state_qualification_revenue_mix: RevenueMixCategory | null;
  state_qualification_delivery_model: DeliveryModel | null;
  state_qualification_coaching_interest: CoachingInterest | null;
  state_qualification_progress_step: number | null;
  state_escalation_level: number | null;
  state_escalation_reason: string | null;
  state_escalation_overridden: boolean | null;
  state_last_podcast_sent_at: Date | null;
  state_cadence_status: CadenceStatus | null;
  state_next_followup_due_at: Date | null;
  state_objection_tags: string[] | null;
  state_call_outcome: string | null;
  state_guardrail_override_count: number | null;
  open_needs_reply_count: number;
  needs_reply_due_at: Date | null;
  last_message_body: string | null;
  last_message_direction: 'inbound' | 'outbound' | 'unknown' | null;
  last_message_at: Date | null;
  latest_outbound_user: string | null;
  latest_outbound_line: string | null;
  monday_booked: boolean;
};

export type InboxMessageRow = {
  id: string;
  conversation_id: string | null;
  event_ts: Date;
  direction: 'inbound' | 'outbound' | 'unknown';
  body: string | null;
  sequence: string | null;
  line: string | null;
  aloware_user: string | null;
  slack_channel_id: string;
  slack_message_ts: string;
};

export type InboxConversationDetail = {
  conversation: InboxConversationListRow;
  profile: InboxContactProfileRow | null;
  state: ConversationStateRow;
  messages: InboxMessageRow[];
  drafts: DraftSuggestionRow[];
  mondayTrail: Array<{
    boardId: string;
    itemId: string;
    itemName: string | null;
    stage: string | null;
    callDate: string | null;
    disposition: string | null;
    isBooked: boolean;
    updatedAt: string;
  }>;
};

const getPrisma = () => getPrismaClient();

const BOOKED_CALLS_CHANNEL_ID = (process.env.BOOKED_CALLS_CHANNEL_ID || '').trim() || null;

const buildBookedCallsExistsSql = (bookedCallsChannelPlaceholder: string): string => `
        EXISTS (
          SELECT 1
          FROM booked_calls bc
          LEFT JOIN LATERAL (
            SELECT
              COALESCE(
                NULLIF(
                  (regexp_match(
                    COALESCE(bc.raw #>> '{attachments,0,fallback}', ''),
                    '\\\\*(?:Phone|Phone Number|Mobile Phone)\\\\*:\\\\s*([^\\\\n]+)'
                  ))[1],
                  ''
                ),
                NULLIF(
                  (regexp_match(
                    COALESCE(bc.text, ''),
                    '(\\\\+?\\\\d[\\\\d\\\\s().-]{8,}\\\\d)'
                  ))[1],
                  ''
                )
              ) AS phone_raw,
              COALESCE(
                NULLIF(
                  (regexp_match(
                    COALESCE(bc.raw #>> '{attachments,0,fallback}', ''),
                    '\\\\*(?:Name|Contact Name)\\\\*:\\\\s*([^\\\\n]+)'
                  ))[1],
                  ''
                ),
                NULLIF(
                  trim(
                    concat_ws(
                      ' ',
                      (regexp_match(
                        COALESCE(bc.raw #>> '{attachments,0,fallback}', ''),
                        '\\\\*First Name\\\\*:\\\\s*([^\\\\n]+)'
                      ))[1],
                      (regexp_match(
                        COALESCE(bc.raw #>> '{attachments,0,fallback}', ''),
                        '\\\\*Last Name\\\\*:\\\\s*([^\\\\n]+)'
                      ))[1]
                    )
                  ),
                  ''
                )
              ) AS name_raw
          ) parsed ON TRUE
          WHERE (${bookedCallsChannelPlaceholder}::text IS NULL OR bc.slack_channel_id = ${bookedCallsChannelPlaceholder}::text)
            AND (
              COALESCE(bc.text, '') ~* '(call booked|booked|appointment|scheduled|automation|\\\\bset\\\\b)'
              OR COALESCE(bc.raw #>> '{attachments,0,fallback}', '') ~* '(call booked|booked|appointment|scheduled|automation|\\\\bset\\\\b)'
            )
            AND (
              (
                RIGHT(regexp_replace(COALESCE(c.contact_phone, ''), '\\\\D', '', 'g'), 10) <> ''
                AND RIGHT(regexp_replace(COALESCE(parsed.phone_raw, ''), '\\\\D', '', 'g'), 10) <> ''
                AND RIGHT(regexp_replace(COALESCE(c.contact_phone, ''), '\\\\D', '', 'g'), 10)
                  = RIGHT(regexp_replace(COALESCE(parsed.phone_raw, ''), '\\\\D', '', 'g'), 10)
              )
              OR (
                COALESCE(lower(trim(p.name)), '') <> ''
                AND COALESCE(lower(trim(parsed.name_raw)), '') <> ''
                AND lower(trim(p.name)) = lower(trim(parsed.name_raw))
              )
            )
        )
`;

export const getConversationState = async (
  conversationId: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<ConversationStateRow | null> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.conversation_state.findUnique({
      where: { conversation_id: conversationId },
    });
    return result as unknown as ConversationStateRow | null;
  } catch (err) {
    logger?.error('getConversationState failed', err);
    throw err;
  }
};

export const ensureConversationState = async (
  conversationId: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<ConversationStateRow> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.conversation_state.upsert({
      where: { conversation_id: conversationId },
      update: { updated_at: new Date() },
      create: { conversation_id: conversationId },
    });
    return result as unknown as ConversationStateRow;
  } catch (err) {
    logger?.error('ensureConversationState failed', err);
    throw err;
  }
};

export type UpdateConversationStateInput = {
  fullOrPartTime?: EmploymentStatus;
  niche?: string | null;
  revenueMix?: RevenueMixCategory;
  deliveryModel?: DeliveryModel;
  coachingInterest?: CoachingInterest;
  progressStep?: number;
  escalationLevel?: 1 | 2 | 3 | 4;
  escalationReason?: string | null;
  escalationOverridden?: boolean;
  lastPodcastSentAt?: string | null;
  nextFollowupDueAt?: string | null;
  cadenceStatus?: CadenceStatus;
};

export const updateConversationState = async (
  conversationId: string,
  input: UpdateConversationStateInput,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<ConversationStateRow> => {
  const prisma = getPrisma();

  try {
    const updateData: any = {
      updated_at: new Date(),
    };
    if (input.fullOrPartTime !== undefined) updateData.qualification_full_or_part_time = input.fullOrPartTime;
    if (input.niche !== undefined) updateData.qualification_niche = input.niche;
    if (input.revenueMix !== undefined) updateData.qualification_revenue_mix = input.revenueMix;
    if (input.deliveryModel !== undefined) updateData.qualification_delivery_model = input.deliveryModel;
    if (input.coachingInterest !== undefined) updateData.qualification_coaching_interest = input.coachingInterest;
    if (input.progressStep !== undefined) updateData.qualification_progress_step = input.progressStep;
    if (input.escalationLevel !== undefined) updateData.escalation_level = input.escalationLevel;
    if (input.escalationReason !== undefined) updateData.escalation_reason = input.escalationReason;
    if (input.escalationOverridden !== undefined) updateData.escalation_overridden = input.escalationOverridden;
    if (input.lastPodcastSentAt !== undefined) updateData.last_podcast_sent_at = input.lastPodcastSentAt ? new Date(input.lastPodcastSentAt) : null;
    if (input.nextFollowupDueAt !== undefined) updateData.next_followup_due_at = input.nextFollowupDueAt ? new Date(input.nextFollowupDueAt) : null;
    if (input.cadenceStatus !== undefined) updateData.cadence_status = input.cadenceStatus;

    const result = await prisma.conversation_state.upsert({
      where: { conversation_id: conversationId },
      update: updateData,
      create: {
        conversation_id: conversationId,
        ...updateData,
      },
    });

    return result as unknown as ConversationStateRow;
  } catch (err) {
    logger?.error('updateConversationState failed', err);
    throw err;
  }
};

export type ListInboxConversationsParams = {
  limit: number;
  offset: number;
  status?: 'open' | 'closed' | 'dnc';
  repId?: string;
  needsReplyOnly?: boolean;
  search?: string;
};

export const listInboxConversations = async (
  params: ListInboxConversationsParams,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<InboxConversationListRow[]> => {
  const prisma = getPrisma();
  try {
    const where: string[] = [];
    const values: Array<any> = [];
    let index = 1;

    if (params.status) {
      where.push(`c.status = $${index++}`);
      values.push(params.status);
    }
    if (params.repId) {
      where.push(`c.current_rep_id = $${index++}`);
      values.push(params.repId);
    }
    if (params.needsReplyOnly) {
      where.push('COALESCE(open_items.open_needs_reply_count, 0) > 0');
    }
    if (params.search && params.search.trim().length > 0) {
      where.push(`(
        COALESCE(p.name, '') ILIKE $${index}
        OR COALESCE(p.phone, '') ILIKE $${index}
        OR COALESCE(c.contact_phone, '') ILIKE $${index}
        OR COALESCE(c.contact_key, '') ILIKE $${index}
      )`);
      values.push(`%${params.search.trim()}%`);
      index += 1;
    }

    const limit = Math.max(1, Math.min(params.limit, 200));
    const offset = Math.max(0, params.offset);

    values.push(BOOKED_CALLS_CHANNEL_ID ?? null);
    const bookedCallsChannelPlaceholder = `$${index++}`;

    values.push(limit);
    const limitPlaceholder = `$${index++}`;
    values.push(offset);
    const offsetPlaceholder = `$${index++}`;

    const sql = `
      WITH open_items AS (
        SELECT
          conversation_id,
          COUNT(*) FILTER (WHERE type = 'needs_reply' AND resolved_at IS NULL) AS open_needs_reply_count,
          MIN(due_at) FILTER (WHERE type = 'needs_reply' AND resolved_at IS NULL) AS needs_reply_due_at
        FROM work_items
        GROUP BY conversation_id
      ),
      latest_message AS (
        SELECT DISTINCT ON (conversation_id)
          conversation_id,
          body,
          direction,
          event_ts
        FROM sms_events
        WHERE conversation_id IS NOT NULL
        ORDER BY conversation_id, event_ts DESC
      ),
      latest_outbound AS (
        SELECT DISTINCT ON (conversation_id)
          conversation_id,
          aloware_user,
          line,
          event_ts
        FROM sms_events
        WHERE conversation_id IS NOT NULL
          AND direction = 'outbound'
        ORDER BY conversation_id, event_ts DESC
      )
      SELECT
        c.id,
        c.contact_key,
        c.contact_id,
        c.contact_phone,
        c.current_rep_id,
        c.status,
        c.last_inbound_at,
        c.last_outbound_at,
        c.last_touch_at,
        c.unreplied_inbound_count,
        c.next_followup_due_at,
        c.created_at,
        c.updated_at,
        p.name AS profile_name,
        p.phone AS profile_phone,
        p.email AS profile_email,
        p.timezone AS profile_timezone,
        p.niche AS profile_niche,
        p.revenue_mix_category AS profile_revenue_mix_category,
        p.employment_status AS profile_employment_status,
        p.coaching_interest AS profile_coaching_interest,
        p.dnc AS profile_dnc,
        s.qualification_full_or_part_time AS state_qualification_full_or_part_time,
        s.qualification_niche AS state_qualification_niche,
        s.qualification_revenue_mix AS state_qualification_revenue_mix,
        s.qualification_delivery_model AS state_qualification_delivery_model,
        s.qualification_coaching_interest AS state_qualification_coaching_interest,
        s.qualification_progress_step AS state_qualification_progress_step,
        s.escalation_level AS state_escalation_level,
        s.escalation_reason AS state_escalation_reason,
        s.escalation_overridden AS state_escalation_overridden,
        s.last_podcast_sent_at AS state_last_podcast_sent_at,
        s.cadence_status AS state_cadence_status,
        s.next_followup_due_at AS state_next_followup_due_at,
        COALESCE(s.objection_tags, '{}') AS state_objection_tags,
        s.call_outcome AS state_call_outcome,
        COALESCE(s.guardrail_override_count, 0) AS state_guardrail_override_count,
        COALESCE(open_items.open_needs_reply_count, 0)::integer AS open_needs_reply_count,
        open_items.needs_reply_due_at,
        latest_message.body AS last_message_body,
        latest_message.direction AS last_message_direction,
        latest_message.event_ts AS last_message_at,
        latest_outbound.aloware_user AS latest_outbound_user,
        latest_outbound.line AS latest_outbound_line,
        ${buildBookedCallsExistsSql(bookedCallsChannelPlaceholder)} AS monday_booked
      FROM conversations c
      LEFT JOIN inbox_contact_profiles p
        ON p.contact_key = c.contact_key
      LEFT JOIN conversation_state s
        ON s.conversation_id = c.id
      LEFT JOIN open_items
        ON open_items.conversation_id = c.id
      LEFT JOIN latest_message
        ON latest_message.conversation_id = c.id
      LEFT JOIN latest_outbound
        ON latest_outbound.conversation_id = c.id
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY
        CASE WHEN COALESCE(open_items.open_needs_reply_count, 0) > 0 THEN 0 ELSE 1 END ASC,
        c.last_touch_at DESC NULLS LAST,
        c.updated_at DESC
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder};
    `;

    const result = await prisma.$queryRawUnsafe<InboxConversationListRow[]>(sql, ...values);
    return result;
  } catch (err) {
    logger?.error('listInboxConversations failed', err);
    throw err;
  }
};

export const getInboxConversationById = async (
  conversationId: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<InboxConversationListRow | null> => {
  const prisma = getPrisma();
  try {
    const sql = `
      WITH open_items AS (
        SELECT
          conversation_id,
          COUNT(*) FILTER (WHERE type = 'needs_reply' AND resolved_at IS NULL) AS open_needs_reply_count,
          MIN(due_at) FILTER (WHERE type = 'needs_reply' AND resolved_at IS NULL) AS needs_reply_due_at
        FROM work_items
        GROUP BY conversation_id
      ),
      latest_message AS (
        SELECT DISTINCT ON (conversation_id)
          conversation_id,
          body,
          direction,
          event_ts
        FROM sms_events
        WHERE conversation_id IS NOT NULL
        ORDER BY conversation_id, event_ts DESC
      ),
      latest_outbound AS (
        SELECT DISTINCT ON (conversation_id)
          conversation_id,
          aloware_user,
          line,
          event_ts
        FROM sms_events
        WHERE conversation_id IS NOT NULL
          AND direction = 'outbound'
        ORDER BY conversation_id, event_ts DESC
      )
      SELECT
        c.id,
        c.contact_key,
        c.contact_id,
        c.contact_phone,
        c.current_rep_id,
        c.status,
        c.last_inbound_at,
        c.last_outbound_at,
        c.last_touch_at,
        c.unreplied_inbound_count,
        c.next_followup_due_at,
        c.created_at,
        c.updated_at,
        p.name AS profile_name,
        p.phone AS profile_phone,
        p.email AS profile_email,
        p.timezone AS profile_timezone,
        p.niche AS profile_niche,
        p.revenue_mix_category AS profile_revenue_mix_category,
        p.employment_status AS profile_employment_status,
        p.coaching_interest AS profile_coaching_interest,
        p.dnc AS profile_dnc,
        s.qualification_full_or_part_time AS state_qualification_full_or_part_time,
        s.qualification_niche AS state_qualification_niche,
        s.qualification_revenue_mix AS state_qualification_revenue_mix,
        s.qualification_delivery_model AS state_qualification_delivery_model,
        s.qualification_coaching_interest AS state_qualification_coaching_interest,
        s.qualification_progress_step AS state_qualification_progress_step,
        s.escalation_level AS state_escalation_level,
        s.escalation_reason AS state_escalation_reason,
        s.escalation_overridden AS state_escalation_overridden,
        s.last_podcast_sent_at AS state_last_podcast_sent_at,
        s.cadence_status AS state_cadence_status,
        s.next_followup_due_at AS state_next_followup_due_at,
        COALESCE(s.objection_tags, '{}') AS state_objection_tags,
        s.call_outcome AS state_call_outcome,
        COALESCE(s.guardrail_override_count, 0) AS state_guardrail_override_count,
        COALESCE(open_items.open_needs_reply_count, 0)::integer AS open_needs_reply_count,
        open_items.needs_reply_due_at,
        latest_message.body AS last_message_body,
        latest_message.direction AS last_message_direction,
        latest_message.event_ts AS last_message_at,
        latest_outbound.aloware_user AS latest_outbound_user,
        latest_outbound.line AS latest_outbound_line,
        ${buildBookedCallsExistsSql('$2')} AS monday_booked
      FROM conversations c
      LEFT JOIN inbox_contact_profiles p
        ON p.contact_key = c.contact_key
      LEFT JOIN conversation_state s
        ON s.conversation_id = c.id
      LEFT JOIN open_items
        ON open_items.conversation_id = c.id
      LEFT JOIN latest_message
        ON latest_message.conversation_id = c.id
      LEFT JOIN latest_outbound
        ON latest_outbound.conversation_id = c.id
      WHERE c.id = $1
      LIMIT 1;
      `;

    const result = await prisma.$queryRawUnsafe<InboxConversationListRow[]>(sql, conversationId, BOOKED_CALLS_CHANNEL_ID ?? null);
    return result[0] ?? null;
  } catch (err) {
    logger?.error('getInboxConversationById failed', err);
    throw err;
  }
};

export const listMessagesForConversation = async (
  conversationId: string,
  limit: number,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<InboxMessageRow[]> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.$queryRawUnsafe<InboxMessageRow[]>(
      `
      SELECT
        recent.id,
        recent.conversation_id,
        recent.event_ts,
        recent.direction,
        recent.body,
        recent.sequence,
        recent.line,
        recent.aloware_user,
        recent.slack_channel_id,
        recent.slack_message_ts
      FROM (
        SELECT
          id,
          conversation_id,
          event_ts,
          direction,
          body,
          sequence,
          line,
          aloware_user,
          slack_channel_id,
          slack_message_ts
        FROM sms_events
        WHERE conversation_id = $1::uuid
        ORDER BY event_ts DESC, id DESC
        LIMIT $2
      ) AS recent
      ORDER BY recent.event_ts ASC, recent.id ASC;
      `,
      conversationId,
      Math.max(1, Math.min(limit, 500)),
    );

    return result;
  } catch (err) {
    logger?.error('listMessagesForConversation failed', err);
    throw err;
  }
};

export const listMondayTrailForContactKey = async (
  contactKey: string,
  limit: number,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<InboxConversationDetail['mondayTrail']> => {
  const prisma = getPrisma();
  try {
    const normalizedLimit = Math.max(1, Math.min(limit, 50));

    const result = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        m.board_id,
        m.item_id,
        m.item_name,
        m.stage,
        m.call_date,
        m.disposition,
        m.is_booked,
        m.updated_at
      FROM monday_call_snapshots m
      WHERE m.contact_key = $1
         OR (
           m.contact_key = (
             SELECT 'name:' || p.name
             FROM inbox_contact_profiles p
             WHERE p.contact_key = $1
               AND p.name IS NOT NULL
               AND p.name <> ''
             LIMIT 1
           )
         )
      ORDER BY m.updated_at DESC
      LIMIT $2;
      `,
      contactKey,
      normalizedLimit,
    );

    return result.map((row) => ({
      boardId: row.board_id,
      itemId: row.item_id,
      itemName: row.item_name,
      stage: row.stage,
      callDate: row.call_date,
      disposition: row.disposition,
      isBooked: row.is_booked,
      updatedAt: row.updated_at,
    }));
  } catch (err) {
    logger?.error('listMondayTrailForContactKey failed', err);
    throw err;
  }
};

export type InsertSendAttemptInput = {
  conversationId: string;
  messageBody: string;
  senderIdentity?: string | null;
  lineId?: string | null;
  fromNumber?: string | null;
  allowlistDecision: boolean;
  dncDecision: boolean;
  idempotencyKey?: string | null;
  status: SendAttemptStatus;
  requestPayload?: unknown | null;
  responsePayload?: unknown | null;
  retryCount?: number;
  errorMessage?: string | null;
};

export const insertSendAttempt = async (
  input: InsertSendAttemptInput,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SendAttemptRow> => {
  const prisma = getPrisma();
  try {
    const data = {
      conversation_id: input.conversationId,
      message_body: input.messageBody,
      sender_identity: input.senderIdentity ?? null,
      line_id: input.lineId ?? null,
      from_number: input.fromNumber ?? null,
      allowlist_decision: input.allowlistDecision,
      dnc_decision: input.dncDecision,
      idempotency_key: input.idempotencyKey ?? null,
      status: input.status,
      retry_count: input.retryCount ?? 0,
      request_payload: input.requestPayload as any ?? null,
      response_payload: input.responsePayload as any ?? null,
      error_message: input.errorMessage ?? null,
    };

    if (input.idempotencyKey) {
      const result = await prisma.send_attempts.upsert({
        where: {
          conversation_id_idempotency_key: {
            conversation_id: input.conversationId,
            idempotency_key: input.idempotencyKey,
          },
        },
        update: {
          response_payload: input.responsePayload as any ?? undefined,
          status: input.status,
          retry_count: {
            increment: 0, // We need to replicate GREATEST. Prisma doesn't have GREATEST in fluent API easily.
          },
          error_message: input.errorMessage ?? undefined,
        },
        create: data,
      });

      // Special handling for retry_count GREATEST via $executeRaw if needed, 
      // but usually retry_count is managed by the caller.
      // The original SQL: retry_count = GREATEST(send_attempts.retry_count, EXCLUDED.retry_count)
      // Let's use $queryRawUnsafe to perfectly match the original behavior for upsert.
      const upsertSql = `
        INSERT INTO send_attempts (
          conversation_id, message_body, sender_identity, line_id, from_number,
          allowlist_decision, dnc_decision, idempotency_key, status, retry_count,
          request_payload, response_payload, error_message
        )
        VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT (conversation_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL
        DO UPDATE SET
          response_payload = COALESCE(EXCLUDED.response_payload, send_attempts.response_payload),
          status = EXCLUDED.status,
          retry_count = GREATEST(send_attempts.retry_count, EXCLUDED.retry_count),
          error_message = COALESCE(EXCLUDED.error_message, send_attempts.error_message)
        RETURNING *;
      `;
      const rows = await prisma.$queryRawUnsafe<SendAttemptRow[]>(
        upsertSql,
        input.conversationId, input.messageBody, input.senderIdentity ?? null,
        input.lineId ?? null, input.fromNumber ?? null, input.allowlistDecision,
        input.dncDecision, input.idempotencyKey, input.status, input.retryCount ?? 0,
        input.requestPayload ?? null, input.responsePayload ?? null, input.errorMessage ?? null
      );
      return rows[0];
    } else {
      const result = await prisma.send_attempts.create({
        data,
      });
      return result as unknown as SendAttemptRow;
    }
  } catch (err) {
    logger?.error('insertSendAttempt failed', err);
    throw err;
  }
};

export const reserveSendAttemptIdempotency = async (
  input: Omit<InsertSendAttemptInput, 'status' | 'retryCount' | 'responsePayload' | 'errorMessage'> & {
    idempotencyKey: string;
  },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SendAttemptRow | null> => {
  const prisma = getPrisma();
  try {
    const sql = `
      INSERT INTO send_attempts (
        conversation_id, message_body, sender_identity, line_id, from_number,
        allowlist_decision, dnc_decision, idempotency_key, status, retry_count,
        request_payload, response_payload, error_message
      )
      VALUES ($1::uuid,$2,$3,$4,$5,$6,$7,$8,'queued',0,$9,NULL,NULL)
      ON CONFLICT (conversation_id, idempotency_key)
      WHERE idempotency_key IS NOT NULL
      DO NOTHING
      RETURNING *;
    `;
    const rows = await prisma.$queryRawUnsafe<SendAttemptRow[]>(
      sql,
      input.conversationId, input.messageBody, input.senderIdentity ?? null,
      input.lineId ?? null, input.fromNumber ?? null, input.allowlistDecision,
      input.dncDecision, input.idempotencyKey, input.requestPayload ?? null
    );
    return rows[0] ?? null;
  } catch (err) {
    logger?.error('reserveSendAttemptIdempotency failed', err);
    throw err;
  }
};

export const getSendAttemptByIdempotency = async (
  conversationId: string,
  idempotencyKey: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SendAttemptRow | null> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.send_attempts.findUnique({
      where: {
        conversation_id_idempotency_key: {
          conversation_id: conversationId,
          idempotency_key: idempotencyKey,
        },
      },
    });
    return result as unknown as SendAttemptRow | null;
  } catch (err) {
    logger?.error('getSendAttemptByIdempotency failed', err);
    throw err;
  }
};

export type SendAttemptVolumeCounts = {
  sentLastHour: number;
  sentLastDay: number;
  conversationSentLastHour: number;
};

export const getSendAttemptVolumeCounts = async (
  conversationId: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SendAttemptVolumeCounts> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        COUNT(*) FILTER (
          WHERE status = 'sent'
            AND created_at >= NOW() - INTERVAL '1 hour'
        )::text AS sent_last_hour,
        COUNT(*) FILTER (
          WHERE status = 'sent'
            AND created_at >= NOW() - INTERVAL '1 day'
        )::text AS sent_last_day,
        COUNT(*) FILTER (
          WHERE status = 'sent'
            AND conversation_id = $1::uuid
            AND created_at >= NOW() - INTERVAL '1 hour'
        )::text AS conversation_sent_last_hour
      FROM send_attempts;
      `,
      conversationId,
    );

    const row = result[0];
    return {
      sentLastHour: Number.parseInt(row?.sent_last_hour || '0', 10) || 0,
      sentLastDay: Number.parseInt(row?.sent_last_day || '0', 10) || 0,
      conversationSentLastHour: Number.parseInt(row?.conversation_sent_last_hour || '0', 10) || 0,
    };
  } catch (err) {
    logger?.error('getSendAttemptVolumeCounts failed', err);
    throw err;
  }
};

export type InsertDraftSuggestionInput = {
  conversationId: string;
  promptSnapshotHash: string;
  retrievedExemplarIds?: string[];
  generatedText: string;
  lintScore: number;
  structuralScore: number;
  lintIssues?: string[];
  raw?: unknown;
};

export const insertDraftSuggestion = async (
  input: InsertDraftSuggestionInput,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<DraftSuggestionRow> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.draft_suggestions.create({
      data: {
        conversation_id: input.conversationId,
        prompt_snapshot_hash: input.promptSnapshotHash,
        retrieved_exemplar_ids: input.retrievedExemplarIds as any ?? null,
        generated_text: input.generatedText,
        lint_score: input.lintScore,
        structural_score: input.structuralScore,
        lint_issues: input.lintIssues as any ?? null,
        raw: input.raw as any ?? null,
      },
    });

    return result as unknown as DraftSuggestionRow;
  } catch (err) {
    logger?.error('insertDraftSuggestion failed', err);
    throw err;
  }
};

export const listDraftSuggestionsForConversation = async (
  conversationId: string,
  limit: number,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<DraftSuggestionRow[]> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.draft_suggestions.findMany({
      where: { conversation_id: conversationId },
      orderBy: { created_at: 'desc' },
      take: Math.max(1, Math.min(limit, 50)),
    });
    return result as unknown as DraftSuggestionRow[];
  } catch (err) {
    logger?.error('listDraftSuggestionsForConversation failed', err);
    throw err;
  }
};


export const getDraftSuggestionById = async (
  draftId: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<DraftSuggestionRow | null> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.draft_suggestions.findUnique({
      where: { id: draftId },
    });
    return result as unknown as DraftSuggestionRow | null;
  } catch (err) {
    logger?.error('getDraftSuggestionById failed', err);
    throw err;
  }
};

export const updateDraftSuggestionFeedback = async (
  draftId: string,
  params: {
    accepted?: boolean;
    edited?: boolean;
    sendLinkedEventId?: string | null;
  },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<DraftSuggestionRow | null> => {
  const prisma = getPrisma();
  try {
    const updateData: any = {
      updated_at: new Date(),
    };
    if (typeof params.accepted === 'boolean') updateData.accepted = params.accepted;
    if (typeof params.edited === 'boolean') updateData.edited = params.edited;
    if (params.sendLinkedEventId !== undefined) updateData.send_linked_event_id = params.sendLinkedEventId;

    const result = await prisma.draft_suggestions.update({
      where: { id: draftId },
      data: updateData,
    });

    return result as unknown as DraftSuggestionRow | null;
  } catch (err) {
    logger?.error('updateDraftSuggestionFeedback failed', err);
    throw err;
  }
};

export const upsertConversionExample = async (
  input: UpsertConversionExampleInput,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<ConversionExampleRow> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.conversion_examples.upsert({
      where: { source_outbound_event_id: input.sourceOutboundEventId },
      update: {
        booked_call_label: input.bookedCallLabel ?? undefined,
        closed_won_label: input.closedWonLabel ?? undefined,
        escalation_level: input.escalationLevel,
        structure_signature: input.structureSignature ?? undefined,
        qualifier_snapshot: input.qualifierSnapshot as any ?? undefined,
        channel_marker: input.channelMarker ?? undefined,
      },
      create: {
        source_outbound_event_id: input.sourceOutboundEventId,
        booked_call_label: input.bookedCallLabel ?? null,
        closed_won_label: input.closedWonLabel ?? null,
        escalation_level: input.escalationLevel,
        structure_signature: input.structureSignature ?? null,
        qualifier_snapshot: input.qualifierSnapshot as any ?? null,
        channel_marker: input.channelMarker || 'sms',
      },
    });

    return result as unknown as ConversionExampleRow;
  } catch (err) {
    logger?.error('upsertConversionExample failed', err);
    throw err;
  }
};

export const updateConversationStatus = async (
  conversationId: string,
  status: 'open' | 'closed' | 'dnc',
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<{ id: string; status: 'open' | 'closed' | 'dnc' } | null> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        status: true,
      },
    });
    return result as { id: string; status: 'open' | 'closed' | 'dnc' };
  } catch (err) {
    logger?.error('updateConversationStatus failed', err);
    throw err;
  }
};

// ─── Conversation Notes (Whisper Notes) ──────────────────────────────────────

export type ConversationNoteRow = {
  id: string;
  conversation_id: string;
  author: string;
  text: string;
  created_at: Date;
};

export const insertConversationNote = async (
  conversationId: string,
  author: string,
  text: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<ConversationNoteRow> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.conversation_notes.create({
      data: {
        conversation_id: conversationId,
        author,
        text,
      },
    });
    return result as unknown as ConversationNoteRow;
  } catch (err) {
    logger?.error('insertConversationNote failed', err);
    throw err;
  }
};

export const listConversationNotes = async (
  conversationId: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<ConversationNoteRow[]> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.conversation_notes.findMany({
      where: { conversation_id: conversationId },
      orderBy: { created_at: 'asc' },
    });
    return result as unknown as ConversationNoteRow[];
  } catch (err) {
    logger?.error('listConversationNotes failed', err);
    throw err;
  }
};

// ─── Snooze (reuses existing next_followup_due_at on conversations) ───────────

export const snoozeConversation = async (
  conversationId: string,
  snoozedUntil: string | null,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<{ id: string; next_followup_due_at: Date | null }> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        nextFollowupAt: snoozedUntil ? new Date(snoozedUntil) : null,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        nextFollowupAt: true,
      },
    });
    return {
      id: result.id,
      next_followup_due_at: result.nextFollowupAt,
    };
  } catch (err) {
    logger?.error('snoozeConversation failed', err);
    throw err;
  }
};

// ─── Assignment ───────────────────────────────────────────────────────────────

export const assignConversation = async (
  conversationId: string,
  ownerLabel: string | null,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<{ id: string; owner_label: string | null }> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        current_rep_id: ownerLabel,
        updatedAt: new Date(),
      },
      select: {
        id: true,
        current_rep_id: true,
      },
    });
    return { id: result.id, owner_label: result.current_rep_id ?? null };
  } catch (err) {
    logger?.error('assignConversation failed', err);
    throw err;
  }
};

// ─── Message Templates ────────────────────────────────────────────────────────

export type MessageTemplateRow = {
  id: string;
  name: string;
  body: string;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
};

export const listMessageTemplates = async (
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<MessageTemplateRow[]> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.message_templates.findMany({
      orderBy: { name: 'asc' },
    });
    return result as unknown as MessageTemplateRow[];
  } catch (err) {
    logger?.error('listMessageTemplates failed', err);
    throw err;
  }
};

export const insertMessageTemplate = async (
  name: string,
  body: string,
  createdBy: string | null,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<MessageTemplateRow> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.message_templates.create({
      data: {
        name,
        body,
        created_by: createdBy ?? undefined,
      },
    });
    return result as unknown as MessageTemplateRow;
  } catch (err) {
    logger?.error('insertMessageTemplate failed', err);
    throw err;
  }
};

export const deleteMessageTemplate = async (
  id: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<boolean> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.message_templates.delete({
      where: { id },
    });
    return !!result;
  } catch (err) {
    logger?.error('deleteMessageTemplate failed', err);
    throw err;
  }
};

// ─── Phase 3: Objection Tags ──────────────────────────────────────────────────

export const updateObjectionTags = async (
  conversationId: string,
  tags: string[],
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<{ conversation_id: string; objection_tags: string[] }> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.conversation_state.upsert({
      where: { conversation_id: conversationId },
      update: {
        objection_tags: tags,
        updated_at: new Date(),
      },
      create: {
        conversation_id: conversationId,
        objection_tags: tags,
      },
      select: {
        conversation_id: true,
        objection_tags: true,
      },
    });
    return result;
  } catch (err) {
    logger?.error('updateObjectionTags failed', err);
    throw err;
  }
};

// ─── Phase 3: Call Outcome ────────────────────────────────────────────────────

export const VALID_CALL_OUTCOMES = ['not_a_fit', 'too_early', 'budget', 'joined', 'ghosted'] as const;
export type CallOutcome = (typeof VALID_CALL_OUTCOMES)[number];

export const updateCallOutcome = async (
  conversationId: string,
  outcome: string | null,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<{ conversation_id: string; call_outcome: string | null }> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.conversation_state.upsert({
      where: { conversation_id: conversationId },
      update: {
        call_outcome: outcome,
        updated_at: new Date(),
      },
      create: {
        conversation_id: conversationId,
        call_outcome: outcome,
      },
      select: {
        conversation_id: true,
        call_outcome: true,
      },
    });
    return result;
  } catch (err) {
    logger?.error('updateCallOutcome failed', err);
    throw err;
  }
};

// ─── Phase 3: Guardrail Override Tracking ────────────────────────────────────

export const incrementGuardrailOverride = async (
  conversationId: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<{ conversation_id: string; guardrail_override_count: number }> => {
  const prisma = getPrisma();
  try {
    // Replicating the increment behavior via upsert.
    // However, Prisma doesn't support relative increments in create.
    // So we first find or create, then update, or just use raw if it's cleaner.
    // Let's use raw to be safe and efficient for increments.
    const result = await prisma.$queryRawUnsafe<any[]>(
      `
      INSERT INTO conversation_state (conversation_id, guardrail_override_count)
      VALUES ($1::uuid, 1)
      ON CONFLICT (conversation_id)
      DO UPDATE SET
        guardrail_override_count = conversation_state.guardrail_override_count + 1,
        updated_at = NOW()
      RETURNING conversation_id, guardrail_override_count;
      `,
      conversationId,
    );
    return result[0];
  } catch (err) {
    logger?.error('incrementGuardrailOverride failed', err);
    throw err;
  }
};

// ─── Phase 3: Analytics ───────────────────────────────────────────────────────

export type StageConversionRow = {
  escalation_level: number;
  total_conversations: number;
  call_offered_count: number;
  call_outcome_count: number;
  conversion_rate_pct: number;
};

export const getStageConversionAnalytics = async (
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<StageConversionRow[]> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.$queryRawUnsafe<StageConversionRow[]>(`
      SELECT
        COALESCE(s.escalation_level, 1) AS escalation_level,
        COUNT(DISTINCT c.id)::int AS total_conversations,
        COUNT(DISTINCT c.id) FILTER (WHERE s.cadence_status IN ('call_offered'))::int AS call_offered_count,
        COUNT(DISTINCT c.id) FILTER (WHERE s.call_outcome IS NOT NULL)::int AS call_outcome_count,
        ROUND(
          100.0 * COUNT(DISTINCT c.id) FILTER (WHERE s.cadence_status IN ('call_offered'))
          / NULLIF(COUNT(DISTINCT c.id), 0),
          1
        ) AS conversion_rate_pct
      FROM conversations c
      LEFT JOIN conversation_state s ON s.conversation_id = c.id
      WHERE c.status != 'dnc'
      GROUP BY COALESCE(s.escalation_level, 1)
      ORDER BY escalation_level ASC
    `);
    return result;
  } catch (err) {
    logger?.error('getStageConversionAnalytics failed', err);
    throw err;
  }
};

export type ObjectionFrequencyRow = {
  tag: string;
  count: number;
};

export type SetterAssistPerformanceRow = {
  chip_label: string;
  sent_count: number;
  replied_count: number;
  joined_count: number;
  reply_rate_pct: number;
};

export const getObjectionFrequencyAnalytics = async (
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<ObjectionFrequencyRow[]> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.$queryRawUnsafe<ObjectionFrequencyRow[]>(`
      SELECT
        unnested.tag,
        COUNT(*)::int AS count
      FROM conversation_state,
        LATERAL unnest(objection_tags) AS unnested(tag)
      WHERE array_length(objection_tags, 1) > 0
      GROUP BY unnested.tag
      ORDER BY count DESC
    `);
    return result;
  } catch (err) {
    logger?.error('getObjectionFrequencyAnalytics failed', err);
    throw err;
  }
};

export const getSetterAssistPerformanceAnalytics = async (
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SetterAssistPerformanceRow[]> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.$queryRawUnsafe<SetterAssistPerformanceRow[]>(`
      WITH attempts AS (
        SELECT
          sa.id,
          sa.conversation_id,
          sa.created_at,
          sa.request_payload #>> '{setterAssist,chipLabel}' AS chip_label
        FROM send_attempts sa
        WHERE sa.status = 'sent'
          AND sa.request_payload #>> '{setterAssist,chipLabel}' IS NOT NULL
          AND sa.created_at >= NOW() - INTERVAL '30 days'
      ),
      enriched AS (
        SELECT
          a.chip_label,
          a.conversation_id,
          EXISTS (
            SELECT 1
            FROM sms_events e
            WHERE e.conversation_id = a.conversation_id
              AND e.direction = 'inbound'
              AND e.event_ts > a.created_at
              AND e.event_ts <= a.created_at + INTERVAL '72 hours'
          ) AS replied_within_72h
        FROM attempts a
      )
      SELECT
        e.chip_label,
        COUNT(*)::int AS sent_count,
        COUNT(*) FILTER (WHERE e.replied_within_72h)::int AS replied_count,
        COUNT(*) FILTER (WHERE s.call_outcome = 'joined')::int AS joined_count,
        ROUND(
          (
            COUNT(*) FILTER (WHERE e.replied_within_72h)::numeric
            / NULLIF(COUNT(*)::numeric, 0)
          ) * 100,
          1
        )::float AS reply_rate_pct
      FROM enriched e
      LEFT JOIN conversation_state s
        ON s.conversation_id = e.conversation_id
      GROUP BY e.chip_label
      ORDER BY sent_count DESC, replied_count DESC, e.chip_label ASC
      LIMIT 12
    `);
    return result;
  } catch (err) {
    logger?.error('getSetterAssistPerformanceAnalytics failed', err);
    throw err;
  }
};

export const listConversionExamples = async (
  params: {
    escalationLevel?: 1 | 2 | 3 | 4;
    bookedCallLabel?: string;
    preferredOwnerLabel?: string | null;
    limit: number;
  },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<
  Array<
    ConversionExampleRow & {
      outbound_body: string | null;
      outbound_user: string | null;
      source_inbound_body: string | null;
      source_conversation_id: string | null;
      source_outbound_ts: string | null;
    }
  >
> => {
  const prisma = getPrisma();
  try {
    const where: string[] = [];
    const values: Array<string | number> = [];
    let i = 1;

    if (params.escalationLevel) {
      where.push(`ce.escalation_level = $${i++}`);
      values.push(params.escalationLevel);
    }
    if (params.bookedCallLabel) {
      where.push(`ce.booked_call_label = $${i++}`);
      values.push(params.bookedCallLabel);
    }
    if (params.preferredOwnerLabel && params.preferredOwnerLabel.trim().length > 0) {
      where.push(`LOWER(COALESCE(e.aloware_user, '')) LIKE $${i++}`);
      values.push(`%${params.preferredOwnerLabel.trim().toLowerCase()}%`);
    }

    const limit = Math.max(1, Math.min(params.limit, 50));
    const limitPlaceholder = `$${i++}`;
    values.push(limit);

    const result = await prisma.$queryRawUnsafe<any[]>(
      `
      SELECT
        ce.*,
        e.body AS outbound_body,
        e.aloware_user AS outbound_user,
        e.conversation_id AS source_conversation_id,
        e.event_ts::text AS source_outbound_ts,
        inbound.body AS source_inbound_body
      FROM conversion_examples ce
      LEFT JOIN sms_events e
        ON e.id = ce.source_outbound_event_id
      LEFT JOIN LATERAL (
        SELECT se.body
        FROM sms_events se
        WHERE se.conversation_id = e.conversation_id
          AND se.direction = 'inbound'
          AND se.event_ts <= e.event_ts
          AND COALESCE(TRIM(se.body), '') <> ''
        ORDER BY se.event_ts DESC
        LIMIT 1
      ) inbound ON TRUE
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY ce.created_at DESC
      LIMIT ${limitPlaceholder};
      `,
      ...values,
    );

    return result;
  } catch (err) {
    logger?.error('listConversionExamples failed', err);
    throw err;
  }
};

export const listSetterVoiceExamples = async (
  params: {
    ownerLabel: string;
    escalationLevel?: 1 | 2 | 3 | 4;
    limit: number;
  },
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<SetterVoiceExampleRow[]> => {
  const prisma = getPrisma();
  try {
    const owner = params.ownerLabel.trim().toLowerCase();
    if (!owner) return [];

    const values: Array<string | number> = [`%${owner}%`];
    let i = 2;
    const where: string[] = [
      `e.direction = 'outbound'`,
      `COALESCE(TRIM(e.body), '') <> ''`,
      `LOWER(COALESCE(e.aloware_user, '')) LIKE $1`,
    ];

    if (params.escalationLevel) {
      where.push(`(ce.escalation_level = $${i++} OR ce.escalation_level IS NULL)`);
      values.push(params.escalationLevel);
    }

    const limit = Math.max(1, Math.min(params.limit, 30));
    const limitPlaceholder = `$${i++}`;
    values.push(limit);

    const result = await prisma.$queryRawUnsafe<SetterVoiceExampleRow[]>(
      `
      SELECT
        e.id,
        e.conversation_id,
        e.event_ts,
        e.body,
        e.line,
        e.aloware_user,
        (ce.id IS NOT NULL) AS from_conversion_example,
        ce.escalation_level
      FROM sms_events e
      LEFT JOIN conversion_examples ce
        ON ce.source_outbound_event_id = e.id
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE WHEN ce.id IS NOT NULL THEN 0 ELSE 1 END,
        e.event_ts DESC
      LIMIT ${limitPlaceholder};
      `,
      ...values,
    );

    return result;
  } catch (err) {
    logger?.error('listSetterVoiceExamples failed', err);
    throw err;
  }
};
