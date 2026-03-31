export interface SMSMessage {
  id?: string;
  direction: 'inbound' | 'outbound' | 'unknown';
  body: string | object; // Can be string or nested object
  contact_phone?: string;
  contact_id?: string;
  contact_first_name?: string;
  contact_last_name?: string;
  user_email?: string;
  user_id?: string | number;
  line_phone_number?: string;
  line_id?: string | number;
  sequence_id?: string;
  created_at?: string;
  // Legacy webhook fields
  from?: string;
  to?: string;
  message?: string;
  // Additional fields for processing
  timestamp?: Date;
  status?: string;
}
</xai:function_call">Write to file completed successfully. File: packages/shared/src/types/aloware.ts