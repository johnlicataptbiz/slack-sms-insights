import { SMSMessage } from '../types/aloware.js';
import { insertSmsEvent, type NewSmsEvent } from './sms-event-store.js';
import { logger } from './logger.js';

export class AlowareProcessor {
  public async processWebhook(event: SMSMessage) {
    try {
      logger.info('Processing Aloware webhook', { eventId: event.id || 'unknown' });

      // Map Aloware webhook fields to our internal SmsEvent structure
      // Aloware webhooks often use 'from', 'to', 'message' for SMS events
      const direction = event.direction || (event.from && event.to ? 'inbound' : 'unknown');
      const contactPhone = event.contact_phone || (direction === 'inbound' ? event.from : event.to);
      const body = event.body || event.message || '';
      const eventId = event.id || `webhook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      const newEvent: NewSmsEvent = {
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

      const result = await insertSmsEvent(newEvent, logger);
      
      if (result) {
        logger.info('Successfully ingested Aloware event via webhook', { eventId: eventId });
      } else {
        logger.warn('Failed to ingest Aloware event via webhook', { eventId: eventId });
      }
    } catch (error) {
      logger.error('Error in AlowareProcessor.processWebhook', error);
      throw error;
    }
  }
}
