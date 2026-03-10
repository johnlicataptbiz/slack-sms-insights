export const v2Copy = {
  nav: {
    insights: 'Performance',
    inbox: 'Messages',
    runs: 'Daily Activity',
    setterJack: "Jack's Stats",
    setterBrandon: "Brandon's Stats",
    sequences: 'Sequences',
    attribution: 'Booking Audit',
  },
  actions: {
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
    label: 'Internal Booking Signal',
    definition: 'Internal QA signal only. This is not used for booked-call credit.',
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
    definition: 'Unique leads the team started texting.',
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
    definition: 'Reply rate from automated follow-up sequences.',
  },
  selfBooked: {
    label: 'Self-Booked',
    definition: 'Discovery calls booked without setter help.',
  },
  sequenceMatchCoverage: {
    label: 'Bookings Tied to a Sequence',
    definition: 'Booked calls where we can confidently tie the lead back to a sequence.',
  },
};

export const V2_TERM_GROUPS: Array<{ title: string; keys: V2TermKey[] }> = [
  {
    title: 'Main Metrics',
    keys: [
      'callsBookedSlack',
      'callsBookedCreditSlack',
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
