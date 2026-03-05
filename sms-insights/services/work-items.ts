import type { Logger } from '@slack/bolt';
import { getPrismaClient } from './prisma.js';
import { publishRealtimeEvent } from './realtime.js';

const getPrisma = () => getPrismaClient();

export type WorkItemListRow = {
  id: string;
  type: string;
  severity: 'low' | 'med' | 'high';
  due_at: string;
  created_at: string;
  resolved_at: string | null;
  rep_id: string | null;

  conversation_id: string;
  contact_key: string;
  contact_id: string | null;
  contact_phone: string | null;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  last_touch_at: string | null;
  unreplied_inbound_count: number;
};

// No longer need getDbOrThrow as getPrisma handles error states or lazy initialization.

export type WorkItemCursor = {
  dueAt: string;
  id: string;
};

export type ListOpenWorkItemsParams = {
  type?: string;
  repId?: string;
  severity?: 'low' | 'med' | 'high';
  overdueOnly?: boolean;
  dueBefore?: string; // ISO timestamp
  limit: number;
  offset?: number; // legacy
  cursor?: WorkItemCursor; // new
};

export type ListOpenWorkItemsResult = {
  items: WorkItemListRow[];
  nextCursor: WorkItemCursor | null;
};

const encodeCursor = (cursor: WorkItemCursor): string => {
  return Buffer.from(JSON.stringify(cursor), 'utf8').toString('base64url');
};

const decodeCursor = (cursor: string): WorkItemCursor => {
  const raw = Buffer.from(cursor, 'base64url').toString('utf8');
  const parsed = JSON.parse(raw) as { dueAt?: unknown; id?: unknown };
  if (typeof parsed?.dueAt !== 'string' || typeof parsed?.id !== 'string') {
    throw new Error('Invalid cursor');
  }
  return { dueAt: parsed.dueAt, id: parsed.id };
};

export const listOpenWorkItems = async (
  params: ListOpenWorkItemsParams,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<ListOpenWorkItemsResult> => {
  const prisma = getPrisma();
  try {
    const limit = Math.max(1, Math.min(params.limit, 200));
    const where: any = {
      resolved_at: null,
    };

    if (params.type) where.type = params.type;
    if (params.repId) where.rep_id = params.repId;
    if (params.severity) where.severity = params.severity;
    if (params.overdueOnly) where.due_at = { lt: new Date() };
    if (params.dueBefore) where.due_at = { lt: new Date(params.dueBefore) };

    const results = await prisma.work_items.findMany({
      where,
      include: {
        conversations: true,
      },
      orderBy: [
        { due_at: 'asc' },
        { id: 'asc' },
      ],
      take: limit + 1,
      cursor: params.cursor ? { id: params.cursor.id } : undefined,
      skip: params.offset || (params.cursor ? 1 : undefined),
    });

    const hasMore = results.length > limit;
    const itemsRaw = hasMore ? results.slice(0, limit) : results;

    const items: WorkItemListRow[] = itemsRaw.map((wi: any) => ({
      id: wi.id,
      type: wi.type,
      severity: wi.severity as any,
      due_at: wi.due_at.toISOString(),
      created_at: wi.created_at.toISOString(),
      resolved_at: wi.resolved_at ? wi.resolved_at.toISOString() : null,
      rep_id: wi.rep_id,
      conversation_id: wi.conversations.id,
      contact_key: wi.conversations.contactKey,
      contact_id: wi.conversations.contact_id,
      contact_phone: wi.conversations.contact_phone,
      last_inbound_at: wi.conversations.last_inbound_at ? wi.conversations.last_inbound_at.toISOString() : null,
      last_outbound_at: wi.conversations.last_outbound_at ? wi.conversations.last_outbound_at.toISOString() : null,
      last_touch_at: wi.conversations.last_touch_at ? wi.conversations.last_touch_at.toISOString() : null,
      unreplied_inbound_count: wi.conversations.unreplied_inbound_count,
    }));

    const last = items.at(-1);
    const nextCursor: WorkItemCursor | null = hasMore && last ? { dueAt: last.due_at, id: last.id } : null;

    return { items, nextCursor };
  } catch (err) {
    logger?.error('listOpenWorkItems failed', err);
    throw err;
  }
};

export const resolveWorkItem = async (
  id: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<boolean> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.work_items.updateMany({
      where: { id, resolved_at: null },
      data: { resolved_at: new Date() },
    });

    if (result.count > 0) {
      publishRealtimeEvent({
        type: 'work-item-updated',
        payload: { id, status: 'resolved', resolvedAt: new Date().toISOString() },
      });
      return true;
    }
    return false;
  } catch (err) {
    logger?.error('resolveWorkItem failed', err);
    throw err;
  }
};

export const assignWorkItem = async (
  id: string,
  repId: string,
  logger?: Pick<Logger, 'debug' | 'info' | 'warn' | 'error'>,
): Promise<boolean> => {
  const prisma = getPrisma();
  try {
    const result = await prisma.work_items.update({
      where: { id },
      data: { rep_id: repId },
      select: { id: true, rep_id: true },
    });

    if (result) {
      publishRealtimeEvent({
        type: 'work-item-updated',
        payload: { id: result.id, repId: result.rep_id },
      });
      return true;
    }
    return false;
  } catch (err) {
    logger?.error('assignWorkItem failed', err);
    throw err;
  }
};

export const encodeWorkItemCursor = (cursor: WorkItemCursor): string => encodeCursor(cursor);
export const decodeWorkItemCursor = (cursor: string): WorkItemCursor => decodeCursor(cursor);
