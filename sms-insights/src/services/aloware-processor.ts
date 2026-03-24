import { SMSMessage } from '../types/aloware.js';
// import { insertSmsEvent, type NewSmsEvent } from './sms-event-store.js';
import { logger } from '../../services/logger.js';

export class AlowareProcessor {
  public async processWebhook(event: SMSMessage) {
    try {
      logger.aloware.info({ eventId: event.id || 'unknown' }, 'Processing Aloware webhook');

      // Map Aloware webhook fields to our internal SmsEvent structure
      // Aloware webhooks often use 'from', 'to', 'message' for SMS events
      const direction = event.direction || (event.from && event.to ? 'inbound' : 'unknown');
      const contactPhone = event.contact_phone || (direction === 'inbound' ? event.from : event.to);
      const body = event.body || event.message || '';
      const eventId = event.id || `webhook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const newEvent = {
        slackTeamId: 'aloware-webhook',
        slackChannelId: 'direct-webhook',
        slackMessageTs: eventId,
        eventTs: event.created_at ? new Date(event.created_at) : new Date(),
        direction: direction as 'inbound' | 'outbound',
        contactId: event.contact_id?.toString() || null,
        contactPhone: contactPhone || null,
        contactName: `${event.contact_first_name || ''} ${event.contact_last_name || ''}`.trim() || null,
        alowareUser: event.user_email || event.user_id?.toString() || null,
        body: body,
        line: event.line_phone_number || event.line_id?.toString() || null,
        sequence: event.sequence_id?.toString() || null,
        raw: event,
      };

      // TODO: Implement SMS event storage
      // const result = await insertSmsEvent(newEvent, logger);
      logger.aloware.info({ eventId }, 'Aloware webhook processed (storage not yet implemented)');
    } catch (error) {
      logger.aloware.error({ error }, 'Error in AlowareProcessor.processWebhook');
      throw error;
    }
  }
}
