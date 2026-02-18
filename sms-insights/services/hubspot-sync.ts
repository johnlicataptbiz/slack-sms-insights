import type { Logger } from '@slack/bolt';

const DEFAULT_NOTE_PREFIX = '[AI SMS INSIGHTS]';
const HUBSPOT_CONTACT_TO_NOTE_ASSOCIATION_TYPE_ID = 202;

export type HubSpotSyncConfig = {
  accessToken: string;
  enabled: boolean;
  notePrefix: string;
  portalId: string;
};

export const getHubSpotConfig = (): HubSpotSyncConfig => {
  return {
    accessToken: process.env.HUBSPOT_ACCESS_TOKEN?.trim() || '',
    enabled: (process.env.ALOWARE_HUBSPOT_SYNC_ENABLED?.trim() || 'true').toLowerCase() === 'true',
    notePrefix: process.env.ALOWARE_HUBSPOT_NOTE_PREFIX?.trim() || DEFAULT_NOTE_PREFIX,
    portalId: process.env.HUBSPOT_PORTAL_ID?.trim() || '22001532',
  };
};

/**
 * Syncs an AI-generated note to HubSpot for a contact identified by phone number.
 * Updates an existing note with the specified prefix if found, otherwise creates a new one.
 */
export const syncLeadNoteToHubSpot = async ({
  phoneNumber,
  contactName,
  noteContent,
  tags = [],
  logger,
}: {
  phoneNumber: string;
  contactName: string;
  noteContent: string;
  tags?: string[];
  logger: Logger;
}): Promise<string | undefined> => {
  const config = getHubSpotConfig();
  if (!config.enabled || !config.accessToken) {
    if (config.enabled && !config.accessToken) {
      logger.warn('HubSpot sync enabled but HUBSPOT_ACCESS_TOKEN is missing.');
    }
    return;
  }

  const finalNoteContent = tags.length > 0 ? `TAGS: ${tags.join(', ')}\n\n${noteContent}` : noteContent;

  try {
    // 1. Find Contact ID by Phone
    const contactId = await findContactByPhone(phoneNumber, config.accessToken, logger);
    if (!contactId) {
      logger.info(`No HubSpot contact found for phone: ${phoneNumber}. Skipping sync.`);
      return undefined;
    }

    // 2. Find existing AI note for this contact
    const existingNoteId = await findExistingAiNote(contactId, config.notePrefix, config.accessToken, logger);

    if (existingNoteId) {
      // 3a. Update existing note
      await updateNote(existingNoteId, finalNoteContent, config.notePrefix, config.accessToken, logger);
      logger.info(`Updated HubSpot AI Note for contact ${contactId} (${contactName})`);
    } else {
      // 3b. Create new note and associate with contact
      await createNoteWithAssociation(contactId, finalNoteContent, config.notePrefix, config.accessToken, logger);
      logger.info(`Created new HubSpot AI Note for contact ${contactId} (${contactName})`);
    }
    return contactId;
  } catch (error) {
    logger.error('Failed to sync lead note to HubSpot');
    logger.error(error);
    return undefined;
  }
};

const findContactByPhone = async (phone: string, token: string, logger: Logger): Promise<string | undefined> => {
  // Simple check for international format or digits
  const cleanPhone = phone.replace(/\D/g, '');
  if (cleanPhone.length < 7) return undefined;

  const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'phone',
              operator: 'EQ',
              value: phone,
            },
          ],
        },
        {
          filters: [
            {
              propertyName: 'mobilephone',
              operator: 'EQ',
              value: phone,
            },
          ],
        },
      ],
      limit: 1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    logger.debug(`HubSpot Contact Search failed: ${response.status} - ${errText}`);
    return undefined;
  }

  const data = (await response.json()) as { results: Array<{ id: string }> };
  return data.results?.[0]?.id;
};

const findExistingAiNote = async (
  contactId: string,
  prefix: string,
  token: string,
  logger: Logger,
): Promise<string | undefined> => {
  const response = await fetch('https://api.hubapi.com/crm/v3/objects/notes/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'associations.contact',
              operator: 'EQ',
              value: contactId,
            },
            {
              propertyName: 'hs_note_body',
              operator: 'STARTS_WITH',
              value: prefix,
            },
          ],
        },
      ],
      sorts: [
        {
          propertyName: 'hs_lastmodifieddate',
          direction: 'DESCENDING',
        },
      ],
      properties: ['hs_note_body'],
      limit: 1,
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    logger.debug(`HubSpot Note Search failed: ${response.status} - ${errText}`);
    return undefined;
  }

  const data = (await response.json()) as { results: Array<{ id: string }> };
  return data.results?.[0]?.id;
};

const createNoteWithAssociation = async (
  contactId: string,
  content: string,
  prefix: string,
  token: string,
  logger: Logger,
): Promise<void> => {
  const timestamp = new Date().toISOString();
  const body = `${prefix}\nLast Updated: ${timestamp}\n\n${content}`;

  const response = await fetch('https://api.hubapi.com/crm/v3/objects/notes', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        hs_timestamp: Date.now().toString(),
        hs_note_body: body,
      },
      associations: [
        {
          to: { id: contactId },
          types: [
            { associationCategory: 'HUBSPOT_DEFINED', associationTypeId: HUBSPOT_CONTACT_TO_NOTE_ASSOCIATION_TYPE_ID },
          ],
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to create HubSpot note: ${response.status} - ${errText}`);
  }
};

const updateNote = async (
  noteId: string,
  newContent: string,
  prefix: string,
  token: string,
  logger: Logger,
): Promise<void> => {
  const timestamp = new Date().toISOString();
  // We replace the content to avoid infinite growth, or we could append if it's small.
  // The user asked "update the same note", usually implying a summary that stays fresh.
  const body = `${prefix}\nLast Updated: ${timestamp}\n\n${newContent}`;

  const response = await fetch(`https://api.hubapi.com/crm/v3/objects/notes/${noteId}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      properties: {
        hs_note_body: body,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Failed to update HubSpot note: ${response.status} - ${errText}`);
  }
};
