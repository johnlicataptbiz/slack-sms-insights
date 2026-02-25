export const v2Copy = {
  nav: {
    insights: 'Performance',
    inbox: 'Messages',
    runs: 'Daily Activity',
    setterJack: "Jack's Stats",
    setterBrandon: "Brandon's Stats",
    sequences: 'Sequences',
    attribution: 'Attribution',
  },
  actions: {
    legacyUi: 'Legacy UI',
    kpiDefinitions: 'KPI Definitions',
    close: 'Close',
  },
} as const;

export type V2TermKey =
  | 'callsBookedSlack'
  | 'callsBookedCreditSlack'
  | 'smsBookingHintsDiagnostic'
  | 'peopleContacted'
  | 'replyRatePeople'
  | 'outboundConversations'
  | 'optOuts'
  | 'optOutRate'
  | 'manualReplyRate'
  | 'sequenceReplyRate'
  | 'selfBooked'
  | 'sequenceMatchCoverage';

type V2TermDefinition = {
  label: string;
  definition: string;
};

export const V2_TERM_DEFINITIONS: Record<V2TermKey, V2TermDefinition> = {
  callsBookedSlack: {
    label: 'Calls Booked (Team)',
    definition: 'Total confirmed calls scheduled from our outreach efforts.',
  },
  callsBookedCreditSlack: {
    label: 'Calls Booked (Setter)',
    definition: 'Calls this setter booked, credited from Slack booking records.',
  },
  smsBookingHintsDiagnostic: {
    label: 'Booking Signals',
    definition: 'Conversations our system flagged as likely bookings — for reference only, not added to your booked total.',
  },
  peopleContacted: {
    label: 'Leads Reached',
    definition: 'Unique people we messaged this week.',
  },
  replyRatePeople: {
    label: 'Reply Rate',
    definition: 'What percent of people wrote back.',
  },
  outboundConversations: {
    label: 'Conversations Started',
    definition: 'Unique leads we started a conversation with.',
  },
  optOuts: {
    label: 'Opt-Outs',
    definition: 'People who replied STOP or asked to be removed from our list.',
  },
  optOutRate: {
    label: 'Opt-Out Rate',
    definition: 'Percent of people reached who opted out.',
  },
  manualReplyRate: {
    label: 'Direct Reply Rate',
    definition: 'Reply rate from messages we sent directly.',
  },
  sequenceReplyRate: {
    label: 'Sequence Reply Rate',
    definition: 'Reply rate from automated sequence follow-ups.',
  },
  selfBooked: {
    label: 'Self-Booked',
    definition: 'Discovery calls booked without setter help.',
  },
  sequenceMatchCoverage: {
    label: 'Sequence-Attributed Bookings',
    definition: 'Booked calls where a sequence started the first conversation.',
  },
};

export const V2_TERM_GROUPS: Array<{ title: string; keys: V2TermKey[] }> = [
  {
    title: 'Main Metrics',
    keys: [
      'callsBookedSlack',
      'callsBookedCreditSlack',
      'smsBookingHintsDiagnostic',
      'peopleContacted',
      'replyRatePeople',
      'outboundConversations',
      'optOuts',
      'optOutRate',
    ],
  },
  {
    title: 'Where Calls Come From',
    keys: ['manualReplyRate', 'sequenceReplyRate', 'selfBooked', 'sequenceMatchCoverage'],
  },
];
