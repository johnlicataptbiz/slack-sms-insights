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
    label: 'Calls Booked',
    definition: 'Total confirmed calls scheduled from our outreach efforts.',
  },
  callsBookedCreditSlack: {
    label: 'Setter Credit',
    definition: 'How many calls each team member booked.',
  },
  smsBookingHintsDiagnostic: {
    label: 'Booking Hints',
    definition: 'Tips our system spots for booking more calls.',
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
    label: 'Outbound Messages',
    definition: 'Texts we sent to potential clients.',
  },
  optOuts: {
    label: 'Unsubscribes',
    definition: 'People who asked to stop receiving messages.',
  },
  optOutRate: {
    label: 'Unsubscribe Rate',
    definition: 'Percent of people who opted out after hearing from us.',
  },
  manualReplyRate: {
    label: 'Direct Reply Rate',
    definition: 'Reply rate from messages we sent directly.',
  },
  sequenceReplyRate: {
    label: 'Sequence Reply Rate',
    definition: 'Reply rate from automated follow-ups.',
  },
  selfBooked: {
    label: 'Self-Booked',
    definition: 'Calls booked without setter help.',
  },
  sequenceMatchCoverage: {
    label: 'Sequence Coverage',
    definition: 'How many booked calls came from our outreach sequences.',
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
