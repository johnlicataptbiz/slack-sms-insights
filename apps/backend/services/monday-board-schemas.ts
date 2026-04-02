export type MondayColumnType =
  | 'status'
  | 'text'
  | 'numbers'
  | 'date'
  | 'link'
  | 'long_text'
  | 'phone'
  | 'board_relation'
  | 'mirror'
  | 'formula';

export type MondayBoardKey = 'events' | 'sequences' | 'reports';

export type MondayFormulaVersion = 'intelligent-v1';
export const MONDAY_SMS_SCHEMA_VERSION: MondayFormulaVersion = 'intelligent-v1';

export type MondayColumnDefinition = {
  title: string;
  type: MondayColumnType;
  defaults?: Record<string, unknown>;
  formula?: string;
  semantic?:
    | 'base'
    | 'join_key'
    | 'relation'
    | 'mirror'
    | 'rollup'
    | 'formula'
    | 'health'
    | 'diagnostic';
};

export type MondayBoardSchema = {
  key: MondayBoardKey;
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
      buildStatusColumn('Channel', [
        'Circle DM',
        'Aloware SMS',
        'Email Marketing',
        'Instagram DM',
        'Game Plan Call',
        'SELF BOOK',
      ]),
      { title: 'Setter', type: 'text' },
      { title: 'Slack Link', type: 'link' },
      { title: 'Summary', type: 'long_text' },
      { title: 'Conversation ID', type: 'text' },
      { title: 'Sequence', type: 'text' },
      { title: 'External Event ID', type: 'text', semantic: 'join_key' },
      { title: 'Sequence Run Key', type: 'text', semantic: 'join_key' },
      { title: 'Report Day Key', type: 'text', semantic: 'join_key' },
      { title: 'Provider Payload Hash', type: 'text', semantic: 'diagnostic' },
      { title: 'Direction', type: 'text', semantic: 'base' },
      { title: 'Message Cost', type: 'numbers', semantic: 'base' },
      { title: 'Is Reply', type: 'numbers', semantic: 'base' },
      // Computed metrics
      { title: 'Reply Rate %', type: 'numbers' },
      { title: 'Response Time Hours', type: 'numbers' },
      { title: 'Conversation Quality Score', type: 'numbers' },
      { title: 'Duplicate Suspicion Score', type: 'formula', formula: 'IF({External Event ID}="",100,0)', semantic: 'health' },
      { title: 'Missing Link Count', type: 'formula', formula: 'IF({Sequence Run Key}="",1,0)', semantic: 'health' },
      { title: 'Stale Sync Indicator', type: 'formula', formula: 'IF(DAYS(TODAY(),{Event Date})>2,1,0)', semantic: 'health' },
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
      { title: 'Sequence Run Key', type: 'text', semantic: 'join_key' },
      { title: 'Report Day Key', type: 'text', semantic: 'join_key' },
      { title: 'Events Links', type: 'board_relation', semantic: 'relation' },
      { title: 'Rollup Messages Sent', type: 'mirror', semantic: 'rollup' },
      { title: 'Rollup Replies', type: 'mirror', semantic: 'rollup' },
      { title: 'Rollup Cost', type: 'mirror', semantic: 'rollup' },
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
      {
        title: 'Delivery Rate %',
        type: 'formula',
        formula: 'IF({Messages Sent}>0,({Messages Sent}-{Replies})/{Messages Sent}*100,0)',
        semantic: 'formula',
      },
      {
        title: 'Response Rate %',
        type: 'formula',
        formula: 'IF({Messages Sent}>0,{Replies}/{Messages Sent}*100,0)',
        semantic: 'formula',
      },
      {
        title: 'Failure Rate %',
        type: 'formula',
        formula: 'IF({Messages Sent}>0,({Messages Sent}-{Booked Calls})/{Messages Sent}*100,0)',
        semantic: 'formula',
      },
      {
        title: 'Cost Per Delivered',
        type: 'formula',
        formula: 'IF({Messages Sent}>0,{Rollup Cost}/{Messages Sent},0)',
        semantic: 'formula',
      },
      { title: 'Duplicate Suspicion Score', type: 'formula', formula: 'IF({Sequence Run Key}="",100,0)', semantic: 'health' },
      { title: 'Missing Link Count', type: 'formula', formula: 'IF({Events Links}="",1,0)', semantic: 'health' },
      { title: 'Stale Sync Indicator', type: 'formula', formula: 'IF(DAYS(TODAY(),{Last Updated})>2,1,0)', semantic: 'health' },
    ],
  },
  reports: {
    key: 'reports',
    boardName: 'SMS Daily Reports',
    columns: [
      { title: 'Report Day Key', type: 'text', semantic: 'join_key' },
      { title: 'Sequence Links', type: 'board_relation', semantic: 'relation' },
      { title: 'Rollup Sequences', type: 'mirror', semantic: 'rollup' },
      { title: 'Rollup Messages Sent', type: 'mirror', semantic: 'rollup' },
      { title: 'Rollup Replies', type: 'mirror', semantic: 'rollup' },
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
      {
        title: 'Daily Delivery %',
        type: 'formula',
        formula: 'IF({Rollup Messages Sent}>0,({Rollup Messages Sent}-{Rollup Replies})/{Rollup Messages Sent}*100,0)',
        semantic: 'formula',
      },
      {
        title: 'Daily Response %',
        type: 'formula',
        formula: 'IF({Rollup Messages Sent}>0,{Rollup Replies}/{Rollup Messages Sent}*100,0)',
        semantic: 'formula',
      },
      { title: 'Anomaly Flag', type: 'formula', formula: 'IF({Health Score}<70,"YES","NO")', semantic: 'health' },
      { title: 'Duplicate Suspicion Score', type: 'formula', formula: 'IF({Report Day Key}="",100,0)', semantic: 'health' },
      { title: 'Missing Link Count', type: 'formula', formula: 'IF({Sequence Links}="",1,0)', semantic: 'health' },
      { title: 'Stale Sync Indicator', type: 'formula', formula: 'IF(DAYS(TODAY(),{Last Synced})>2,1,0)', semantic: 'health' },
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

export const findDriftedBoardColumns = (
  columns: Array<{ id: string; title: string; type?: string }>,
  schema: MondayBoardSchema,
): Array<{ expected: MondayColumnDefinition; actualType: string }> => {
  const drift: Array<{ expected: MondayColumnDefinition; actualType: string }> = [];
  for (const expected of schema.columns) {
    const found = columns.find((column) => column.title.trim().toLowerCase() === expected.title.trim().toLowerCase());
    if (!found) continue;
    const actualType = (found.type || '').trim().toLowerCase();
    const expectedType = expected.type.trim().toLowerCase();
    if (!actualType || actualType === expectedType) continue;
    drift.push({ expected, actualType });
  }
  return drift;
};

export type MondayBoardStructureDiagnostics = {
  schemaVersion: MondayFormulaVersion;
  boardKey: MondayBoardKey;
  structureValid: boolean;
  missingColumns: string[];
  driftedColumns: Array<{ title: string; expectedType: MondayColumnType; actualType: string | null }>;
};

export const buildBoardStructureDiagnostics = (
  boardKey: MondayBoardKey,
  columns: Array<{ id: string; title: string; type?: string }>,
): MondayBoardStructureDiagnostics => {
  const schema = mondaySmsBoardSchemas[boardKey];
  const missing = findMissingBoardColumns(columns, schema).map((column) => column.title);
  const drift = findDriftedBoardColumns(columns, schema).map((row) => ({
    title: row.expected.title,
    expectedType: row.expected.type,
    actualType: row.actualType,
  }));

  return {
    schemaVersion: MONDAY_SMS_SCHEMA_VERSION,
    boardKey,
    structureValid: missing.length === 0 && drift.length === 0,
    missingColumns: missing,
    driftedColumns: drift,
  };
};
