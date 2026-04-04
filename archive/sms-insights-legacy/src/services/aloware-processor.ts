import { SMSMessage } from "../types/aloware.js";
import {
  insertSmsEvent,
  type NewSmsEvent,
} from "../../services/sms-event-store.js";
import { logger } from "../../services/logger.js";

export class AlowareProcessor {
  public async processWebhook(event: SMSMessage) {
    try {
      logger.aloware.info(
        { eventId: event.id || "unknown" },
        "Processing Aloware webhook",
      );

      // Map Aloware webhook fields to our internal SmsEvent structure
      // Aloware webhooks often use 'from', 'to', 'message' for SMS events
      const direction: NewSmsEvent["direction"] =
        event.direction === "inbound" || event.direction === "outbound"
          ? event.direction
          : event.from && event.to
            ? "inbound"
            : "unknown";
      const contactPhone =
        event.contact_phone ||
        (direction === "inbound" ? event.from : event.to);
      const body = event.body || event.message || "";
      const eventId =
        event.id ||
        `webhook-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const eventTs = event.created_at
        ? new Date(event.created_at)
        : new Date();

      const newEvent: NewSmsEvent = {
        slackTeamId: "aloware-webhook",
        slackChannelId: "direct-webhook",
        slackMessageTs: eventId,
        eventTs: Number.isNaN(eventTs.getTime()) ? new Date() : eventTs,
        direction,
        contactId: event.contact_id?.toString() || null,
        contactPhone: contactPhone || null,
        contactName:
          `${event.contact_first_name || ""} ${event.contact_last_name || ""}`.trim() ||
          null,
        alowareUser: event.user_email || event.user_id?.toString() || null,
        body: body,
        line: event.line_phone_number || event.line_id?.toString() || null,
        sequence: event.sequence_id?.toString() || null,
        raw: event,
      };

      const result = await insertSmsEvent(newEvent, logger.aloware);
      logger.aloware.info(
        {
          eventId,
          storedEventId: result?.id || null,
          direction,
          contactPhone: newEvent.contactPhone,
        },
        "Aloware webhook processed and stored",
      );
    } catch (error) {
      logger.aloware.error(
        { error },
        "Error in AlowareProcessor.processWebhook",
      );
      throw error;
    }
  }
}
