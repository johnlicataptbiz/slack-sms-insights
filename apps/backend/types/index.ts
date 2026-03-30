export interface SMSMessage {
  id?: string;
  from: string;
  to: string;
  body: string;
  direction: 'inbound' | 'outbound';
  timestamp: Date;
  status?: string;
}