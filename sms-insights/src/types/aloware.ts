export interface SMSMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  contact_phone: string;
  contact_id?: string;
  contact_first_name?: string;
  contact_last_name?: string;
  user_email?: string;
  line_phone_number?: string;
  sequence_id?: string;
  created_at: string;
}
