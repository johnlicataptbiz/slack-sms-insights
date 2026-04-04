import 'dotenv/config';
import { upsertConversationFromEvent } from '../services/conversation-projector.js';
import { closeDatabase, initDatabase } from '../services/db.js';
import { insertSmsEvent } from '../services/sms-event-store.js';
import { upsertNeedsReplyWorkItem } from '../services/work-item-engine.js';

async function seedSmsEvents() {
  console.log('Initializing database...');
  await initDatabase();

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

  const events = [
    // Conversation 1: needs reply
    {
      slackTeamId: 'T12345',
      slackChannelId: 'C12345',
      slackMessageTs: '1700000000.000001',
      eventTs: twoHoursAgo,
      direction: 'inbound' as const,
      contactId: 'contact_123',
      contactPhone: '+15551234567',
      contactName: 'John Doe',
      alowareUser: 'rep1',
      body: 'Hi, interested in your services',
      line: 'Main',
      sequence: 'Alpha Sequence',
    },
    // Conversation 2: replied (resolved)
    {
      slackTeamId: 'T12345',
      slackChannelId: 'C12345',
      slackMessageTs: '1700000001.000001',
      eventTs: oneHourAgo,
      direction: 'inbound' as const,
      contactId: 'contact_456',
      contactPhone: '+15559876543',
      contactName: 'Jane Smith',
      alowareUser: 'rep2',
      body: 'Do you have availability?',
      line: 'Main',
      sequence: 'Beta Sequence',
    },
    {
      slackTeamId: 'T12345',
      slackChannelId: 'C12345',
      slackMessageTs: '1700000002.000001',
      eventTs: new Date(oneHourAgo.getTime() + 5 * 60 * 1000), // 5 min later
      direction: 'outbound' as const,
      contactId: 'contact_456',
      contactPhone: '+15559876543',
      contactName: 'Jane Smith',
      alowareUser: 'rep2',
      body: 'Yes, we have availability next week',
      line: 'Main',
      sequence: 'Beta Sequence',
    },
  ];

  for (const eventData of events) {
    console.log(`Inserting SMS event for ${eventData.contactName}...`);
    const event = await insertSmsEvent(eventData);
    if (event) {
      console.log(`Inserted event ID: ${event.id}`);

      // Project conversation
      const conversation = await upsertConversationFromEvent(event);
      if (conversation) {
        console.log(`Projected conversation ID: ${conversation.id}`);

        // Create work item if inbound
        if (event.direction === 'inbound') {
          const workItem = await upsertNeedsReplyWorkItem(conversation, event);
          if (workItem) {
            console.log(`Created work item ID: ${workItem.id}`);
          }
        }
      }
    }
  }

  console.log('SMS events seeding complete.');
  await closeDatabase();
}

seedSmsEvents().catch(console.error);
