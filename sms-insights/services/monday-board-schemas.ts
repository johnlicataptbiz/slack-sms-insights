export type MondayColumnType =
  | 'status'
  | 'text'
  | 'numbers'
  | 'date'
  | 'link'
  | 'long_text'
  | 'phone';

export type MondayColumnDefinition = {
  title: string;
  type: MondayColumnType;
  defaults?: Record<string, unknown>;
};

export type MondayBoardSchema = {
  key: 'events' | 'sequences' | 'reports';
  boardName: string;
  columns: MondayColumnDefinition[];
};

const buildStatusDefaults = (labels: string[]): Record<string, unknown> => ({
  labels: Object.fromEntries(labels.map((label, index) => [String(index), label])),
});

const buildStatusColumn = (title: string, labels: string[]): MondayColumnDefinition => ({
  title,
  type: 'status',
  defaults: buildStatusDefaults(labels),
});

export const mondaySmsBoardSchemas: Record<MondayBoardSchema['key'], MondayBoardSchema> = {
  events: {
    key: 'events',
    boardName: 'SMS Events',
    columns: [
      buildStatusColumn('Signal Type', ['Inbound', 'Outbound', 'System']),
      buildStatusColumn('Next Step', ['Reply', 'Monitor', 'Book', 'Archive']),
      { title: 'Contact Name', type: 'text' },
      { title: 'Phone Number', type: 'phone' },
      { title: 'Event Date', type: 'date' },
      buildStatusColumn('Channel', ['Circle DM', 'Aloware SMS', 'Email Marketing', 'Instagram DM', 'Game Plan Call', 'SELF BOOK']),
      { title: 'Setter', type: 'text' },
      { title: 'Slack Link', type: 'link' },
      { title: 'Summary', type: 'long_text' },
      { title: 'Conversation ID', type: 'text' },
      { title: 'Sequence', type: 'text' },
      // Computed metrics
      { title: 'Reply Rate %', type: 'numbers' },
      { title: 'Response Time Hours', type: 'numbers' },
      { title: 'Conversation Quality Score', type: 'numbers' },
    ],
  },
  sequences: {
    key: 'sequences',
    boardName: 'SMS Sequences',
    columns: [
      { title: 'Sequence Name', type: 'text' },
      { title: 'Owner', type: 'text' },
      buildStatusColumn('Status', ['Active', 'Paused', 'Testing', 'Archived']),
      { title: 'Time Window', type: 'text' },
      { title: 'Messages Sent', type: 'numbers' },
      { title: 'Replies', type: 'numbers' },
      { title: 'Reply Rate %', type: 'numbers' },
      { title: 'Booked Calls', type: 'numbers' },
      { title: 'Booking Rate %', type: 'numbers' },
      buildStatusColumn('Trend', ['Up', 'Flat', 'Down']),
      { title: 'Last Updated', type: 'date' },
      { title: 'Optimization Notes', type: 'long_text' },
      // Computed metrics
      { title: 'Week over Week Change %', type: 'numbers' },
      { title: 'Engagement Score', type: 'numbers' },
    ],
  },
  reports: {
    key: 'reports',
    boardName: 'SMS Daily Reports',
    columns: [
      { title: 'Week Start', type: 'date' },
      { title: 'Reporting Period', type: 'text' },
      { title: 'Booked Calls Total', type: 'numbers' },
      { title: 'Jack', type: 'numbers' },
      { title: 'Brandon', type: 'numbers' },
      { title: 'Self Booked', type: 'numbers' },
      buildStatusColumn('Trend', ['Up', 'Flat', 'Down']),
      buildStatusColumn('Health', ['Good', 'Watch', 'Action']),
      { title: 'Key Notes', type: 'long_text' },
      { title: 'Actions Next Week', type: 'long_text' },
      { title: 'Exceptions', type: 'long_text' },
      { title: 'Last Synced', type: 'date' },
      // Computed metrics
      { title: 'Total Booked', type: 'numbers' },
      { title: 'vs Last Week', type: 'numbers' },
      { title: 'Health Score', type: 'numbers' },
    ],
  },
};

export const findColumnIdByTitle = (
  columns: Array<{ id: string; title: string; type?: string }>,
  candidateTitles: string[],
): string | null => {
  const normalizedCandidates = candidateTitles.map((title) => title.trim().toLowerCase());
  for (const column of columns) {
    const haystack = `${column.id} ${column.title} ${column.type || ''}`.toLowerCase();
    if (normalizedCandidates.some((candidate) => haystack.includes(candidate))) {
      return column.id;
    }
  }
  return null;
};

export const findMissingBoardColumns = (
  columns: Array<{ id: string; title: string; type?: string }>,
  schema: MondayBoardSchema,
): MondayColumnDefinition[] => {
  return schema.columns.filter((definition) => {
    const found = findColumnIdByTitle(columns, [definition.title]);
    return !found;
  });
};
