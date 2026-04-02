import { PrismaClient } from '@prisma/client';

process.env.DATABASE_URL = 'postgresql://postgres:WglVXtUmBjZIhCtOTLcLbeWpxsganAsi@crossover.proxy.rlwy.net:56263/railway';

async function extractMarch2023SmsConversations() {
  const prisma = new PrismaClient();

  try {
    // Query booked calls in March 2023
    const startDate = new Date('2023-03-01T00:00:00Z');
    const endDate = new Date('2023-04-01T00:00:00Z');

    const bookedCalls = await prisma.booked_calls.findMany({
      where: {
        created_at: {
          gte: startDate,
          lt: endDate,
        },
      },
      orderBy: {
        created_at: 'asc',
      },
    });

    console.log(`Found ${bookedCalls.length} booked calls in March 2023`);

    const conversations = [];

    for (const bookedCall of bookedCalls) {
      // Find the corresponding SMS event
      const smsEvent = await prisma.sms_events.findFirst({
        where: {
          slack_channel_id: bookedCall.slack_channel_id,
          slack_message_ts: bookedCall.slack_message_ts,
        },
      });

      if (!smsEvent || !smsEvent.conversation_id) {
        console.log(`No conversation found for booked call ${bookedCall.id}`);
        continue;
      }

      const conversationId = smsEvent.conversation_id;

      // Get conversation details
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        include: {
          conversation_state: true,
        },
      });

      if (!conversation) {
        console.log(`Conversation ${conversationId} not found`);
        continue;
      }

      // Get all SMS events for this conversation
      const smsEvents = await prisma.sms_events.findMany({
        where: { conversation_id: conversationId },
        orderBy: { event_ts: 'asc' },
      });

      // Compile the conversation data
      const conversationData = {
        booking: {
          id: bookedCall.id,
          slack_team_id: bookedCall.slack_team_id,
          slack_channel_id: bookedCall.slack_channel_id,
          slack_message_ts: bookedCall.slack_message_ts,
          event_ts: bookedCall.event_ts,
          text: bookedCall.text,
          created_at: bookedCall.created_at,
          first_sms_touch_at: bookedCall.first_sms_touch_at,
        },
        conversation: {
          id: conversation.id,
          contactKey: conversation.contactKey,
          contact_id: conversation.contact_id,
          contact_phone: conversation.contact_phone,
          current_rep_id: conversation.current_rep_id,
          status: conversation.status,
          last_inbound_at: conversation.last_inbound_at,
          last_outbound_at: conversation.last_outbound_at,
          last_touch_at: conversation.last_touch_at,
          unreplied_inbound_count: conversation.unreplied_inbound_count,
          nextFollowupAt: conversation.nextFollowupAt,
          createdAt: conversation.createdAt,
          updatedAt: conversation.updatedAt,
          state: conversation.conversation_state ? {
            qualification_full_or_part_time: conversation.conversation_state.qualification_full_or_part_time,
            qualification_niche: conversation.conversation_state.qualification_niche,
            qualification_revenue_mix: conversation.conversation_state.qualification_revenue_mix,
            qualification_coaching_interest: conversation.conversation_state.qualification_coaching_interest,
            qualification_progress_step: conversation.conversation_state.qualification_progress_step,
            escalation_level: conversation.conversation_state.escalation_level,
            escalation_reason: conversation.conversation_state.escalation_reason,
            escalation_overridden: conversation.conversation_state.escalation_overridden,
            last_podcast_sent_at: conversation.conversation_state.last_podcast_sent_at,
            next_followup_due_at: conversation.conversation_state.next_followup_due_at,
            cadence_status: conversation.conversation_state.cadence_status,
            objection_tags: conversation.conversation_state.objection_tags,
            guardrail_override_count: conversation.conversation_state.guardrail_override_count,
            call_outcome: conversation.conversation_state.call_outcome,
          } : null,
        },
        sms_thread: smsEvents.map(event => ({
          id: event.id,
          event_ts: event.event_ts,
          direction: event.direction,
          contact_id: event.contact_id,
          contact_phone: event.contact_phone,
          contact_name: event.contact_name,
          aloware_user: event.aloware_user,
          body: event.body,
          line: event.line,
          sequence: event.sequence,
          created_at: event.created_at,
        })),
      };

      conversations.push(conversationData);
    }

    const result = {
      metadata: {
        extraction_timestamp: new Date().toISOString(),
        march_2023_booked_calls_count: bookedCalls.length,
        conversations_extracted: conversations.length,
        database_analysis: {
          total_booked_calls_in_period: bookedCalls.length,
          conversations_with_sms_data: conversations.length,
          note: conversations.length === 0 ? 'No SMS conversations found for booked calls in March 2023' : 'SMS conversations successfully extracted',
        },
      },
      conversations,
    };

    // Write to file
    const fs = await import('fs');
    await fs.promises.writeFile('march_booked_sms_conversations.json', JSON.stringify(result, null, 2));

    console.log(`Extraction complete. ${conversations.length} conversations saved to march_booked_sms_conversations.json`);

  } catch (error) {
    console.error('Error during extraction:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

extractMarch2023SmsConversations();