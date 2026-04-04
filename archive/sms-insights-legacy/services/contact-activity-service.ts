/**
 * Contact Activity Service
 * API for querying and managing contact activities from the new unified timeline
 */

import prisma from "../src/lib/prisma.js";

export interface ContactActivityRow {
  id: string;
  contact_key: string;
  activity_type: string;
  reference_id: string | null;
  reference_type: string | null;
  rep_id: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  occurred_at: Date;
  created_at: Date;
}

export async function listContactActivities(
  contactKey: string,
  limit = 50,
  offset = 0
): Promise<ContactActivityRow[]> {
  return prisma.$queryRaw<ContactActivityRow[]>`
    SELECT 
      id,
      contact_key,
      activity_type,
      reference_id,
      reference_type,
      rep_id,
      summary,
      metadata,
      occurred_at,
      created_at
    FROM contact_activities
    WHERE contact_key = ${contactKey}
    ORDER BY occurred_at DESC
    LIMIT ${limit}
    OFFSET ${offset}
  `;
}

export async function getContactActivityStats(
  contactKey: string
): Promise<{
  total_activities: number;
  sms_inbound: number;
  sms_outbound: number;
  calls_inbound: number;
  calls_outbound: number;
  calls_missed: number;
  last_activity_at: Date | null;
}> {
  const stats = await prisma.$queryRaw<Array<{
    activity_type: string;
    count: bigint;
  }>>`
    SELECT activity_type, COUNT(*) as count
    FROM contact_activities
    WHERE contact_key = ${contactKey}
    GROUP BY activity_type
  `;

  const result = {
    total_activities: 0,
    sms_inbound: 0,
    sms_outbound: 0,
    calls_inbound: 0,
    calls_outbound: 0,
    calls_missed: 0,
    last_activity_at: null as Date | null,
  };

  for (const row of stats) {
    const count = Number(row.count);
    result.total_activities += count;
    
    switch (row.activity_type) {
      case "sms_inbound":
        result.sms_inbound = count;
        break;
      case "sms_outbound":
        result.sms_outbound = count;
        break;
      case "call_inbound":
        result.calls_inbound = count;
        break;
      case "call_outbound":
        result.calls_outbound = count;
        break;
      case "call_missed":
        result.calls_missed = count;
        break;
    }
  }

  const lastActivity = await prisma.$queryRaw<Array<{ occurred_at: Date }>>`
    SELECT occurred_at 
    FROM contact_activities 
    WHERE contact_key = ${contactKey}
    ORDER BY occurred_at DESC 
    LIMIT 1
  `;

  if (lastActivity.length > 0) {
    result.last_activity_at = lastActivity[0].occurred_at;
  }

  return result;
}

export async function createContactActivity(data: {
  contact_key: string;
  activity_type: string;
  reference_id?: string;
  reference_type?: string;
  rep_id?: string;
  summary?: string;
  metadata?: Record<string, unknown>;
}): Promise<ContactActivityRow> {
  // @ts-expect-error - Prisma client raw types don't include new tables until regenerated
  return prisma.contact_activities.create({
    data: {
      contact_key: data.contact_key,
      activity_type: data.activity_type as any,
      reference_id: data.reference_id,
      reference_type: data.reference_type,
      rep_id: data.rep_id,
      summary: data.summary,
      metadata: data.metadata as any,
      occurred_at: new Date(),
    },
  });
}
