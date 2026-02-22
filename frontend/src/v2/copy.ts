export const v2Copy = {
  nav: {
    insights: 'Team Insights',
    inbox: 'SMS Inbox',
    runs: 'Daily Runs',
    setterJack: 'Jack Scorecard',
    setterBrandon: 'Brandon Scorecard',
    sequences: 'Sequence Performance',
    attribution: 'Attribution Deep Dive',
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
    label: 'Calls Booked (Slack)',
    definition: 'Canonical booked-call KPI from Slack booked-call records and reaction routing.',
  },
  callsBookedCreditSlack: {
    label: 'Booked Call Credit (Slack)',
    definition: 'Booked-call credit assigned to each setter from Slack records.',
  },
  smsBookingHintsDiagnostic: {
    label: 'SMS Booking Hints (Diagnostic)',
    definition: 'SMS heuristics used for QA and coaching. These never roll into Calls Booked KPI totals.',
  },
  peopleContacted: {
    label: 'People Contacted',
    definition: 'Unique leads messaged in the selected window.',
  },
  replyRatePeople: {
    label: 'Reply Rate (People)',
    definition: 'Unique leads who replied divided by unique leads contacted.',
  },
  outboundConversations: {
    label: 'Outbound Convos',
    definition: 'Conversation volume driven by setter outbound activity.',
  },
  optOuts: {
    label: 'Opt-Outs',
    definition: 'Count of leads who opted out in the selected window.',
  },
  optOutRate: {
    label: 'Opt-Out Rate',
    definition: 'Opt-out leads divided by outbound conversation volume.',
  },
  manualReplyRate: {
    label: 'Manual Reply Rate',
    definition: 'Reply rate from manual outbound messages only.',
  },
  sequenceReplyRate: {
    label: 'Sequence Reply Rate',
    definition: 'Reply rate from sequence-driven outreach only.',
  },
  selfBooked: {
    label: 'Self-Booked Calls',
    definition: 'Calls booked and credited as self-booked rather than assigned to a setter.',
  },
  sequenceMatchCoverage: {
    label: 'Sequence Match Coverage',
    definition: 'Calls booked that matched a known sequence label over total calls booked.',
  },
};

export const V2_TERM_GROUPS: Array<{ title: string; keys: V2TermKey[] }> = [
  {
    title: 'Core Scorecard Metrics',
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
    title: 'Attribution Rules + Coverage',
    keys: ['manualReplyRate', 'sequenceReplyRate', 'selfBooked', 'sequenceMatchCoverage'],
  },
];
