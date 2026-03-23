import { SMSMessage } from '../types/aloware.js';
import { insertSmsEvent, type NewSmsEvent } from './sms-event-store.js';
import { logger } from './logger.js';

export class AlowareProcessor {
  public async processWebhook(event: SMSMessage) {
    try {
      logger.info('Processing Aloware webhook', { eventId: event.id });

      const newEvent: NewSmsEvent = {
        slackTeamId: 'aloware-webhook',
        slackChannelId: 'direct-webhook',
        slackMessageTs: event.id,
        eventTs: new Date(event.created_at),
        direction: event.direction as 'inbound' | 'outbound',
        contactId: event.contact_id || null,
        contactPhone: event.contact_phone || null,
        contactName: `${event.contact_first_name || ''} ${event.contact_last_name || ''}`.trim() || null,
        alowareUser: event.user_email || null,
        body: event.body || null,
        line: event.line_phone_number || null,
        sequence: event.sequence_id || null,
        raw: event,
      };

      const result = await insertSmsEvent(newEvent, logger);
      
      if (result) {
        logger.info('Successfully ingested Aloware event via webhook', { eventId: event.id });
      } else {
        logger.warn('Failed to ingest Aloware event via webhook', { eventId: event.id });
      }
    } catch (error) {
      logger.error('Error in AlowareProcessor.processWebhook', error);
      throw error;
    }
  }
}
