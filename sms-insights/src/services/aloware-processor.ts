import { SMSMessage } from '../types/aloware.js';
import { insertSmsEvent, type NewSmsEvent } from '../../services/sms-event-store.js';
import { logger } from '../../services/logger.js';

export class AlowareProcessor {
  public async processWebhook(event: SMSMessage) {
    try {
      logger.aloware.info({ eventId: event.id || 'unknown' }, 'Processing Aloware webhook');

      // Map Aloware webhook fields to our internal SmsEvent structure
      // Aloware webhooks often use 'from', 'to', 'message' for SMS events
      const direction: NewSmsEvent['direction'] = event.direction || (event.from && event.to ? 'inbound' : 'unknown');
      const contactPhone = event.contact_phone || (direction === 'inbound' ? event.from : event.to);

      // Handle nested body structure - Aloware sometimes sends body as an object with nested body field
      let body = '';
      if (typeof event.body === 'string') {
        body = event.body;
      } else if (event.body && typeof event.body === 'object' && 'body' in event.body) {
        body = String(event.body.body || '');
      } else {
        body = event.message || '';
      }

      const eventId = event.id || `webhook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const newEvent: NewSmsEvent = {
        slackTeamId: 'aloware-webhook',
        slackChannelId: 'direct-webhook',
        slackMessageTs: eventId,
        eventTs: event.created_at ? new Date(event.created_at) : new Date(),
        direction,
        contactId: event.contact_id?.toString() || null,
        contactPhone: contactPhone || null,
        contactName: `${event.contact_first_name || ''} ${event.contact_last_name || ''}`.trim() || null,
        alowareUser: event.user_email || event.user_id?.toString() || null,
        body: body,
        line: event.line_phone_number || event.line_id?.toString() || null,
        sequence: event.sequence_id?.toString() || null,
        raw: JSON.stringify(event),
      };

      const result = await insertSmsEvent(newEvent);
      logger.aloware.info({ eventId, stored: Boolean(result) }, 'Aloware webhook processed');
    } catch (error) {
      logger.aloware.error({ error }, 'Error in AlowareProcessor.processWebhook');
      throw error;
    }
  }
}
