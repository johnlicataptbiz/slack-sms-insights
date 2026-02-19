export interface SequenceRow {
  label: string;
  messagesSent: number;
  repliesReceived: number;
  booked: number;
  optOuts: number;
  replyRate: number;
}

export interface RepMetrics {
  name: string;
  outboundConversations: number;
  bookings: number;
  optOuts: number;
  sequences: SequenceRow[];
}

export interface ParsedReport {
  title: string;
  date?: string;
  totalMessagesSent: number;
  totalRepliesReceived: number;
  totalBooked: number;
  totalOptOuts: number;
  overallReplyRate: number;
  reps: RepMetrics[];
  allSequences: SequenceRow[];
}

const SEQUENCE_LINE_PATTERN =
  /^-\s*(.+?):\s*sent\s+(\d+).*?(?:replies(?:\s+received)?|replied)\s+(\d+)\s*\(([0-9.]+)%[^)]*\).*?book(?:ings?|ed)\s+(\d+).*?opt[-\s]?outs?\s+(\d+)/i;

const REP_PATTERN = /^\*Rep:\s*(.+)\*/i;
const OUTBOUND_CONV_PATTERN = /- Outbound Conversations:\s*(\d+)/i;
const BOOKINGS_PATTERN = /- Book(?:ings?|ed):\s*(\d+)/i;
const OPT_OUTS_PATTERN = /- Opt[-\s]?Outs?:\s*(\d+)/i;
const DATE_PATTERN = /^Date:\s*(.+)$/im;

export function parseReport(reportText: string): ParsedReport {
  const lines = reportText.split('\n').map(l => l.trim());
  const reps: RepMetrics[] = [];
  let currentRep: RepMetrics | null = null;

  const dateMatch = reportText.match(DATE_PATTERN);
  const date = dateMatch ? dateMatch[1] : undefined;

  for (const line of lines) {
    // Check for Rep header
    const repMatch = line.match(REP_PATTERN);
    if (repMatch) {
      currentRep = {
        name: repMatch[1],
        outboundConversations: 0,
        bookings: 0,
        optOuts: 0,
        sequences: []
      };
      reps.push(currentRep);
      continue;
    }

    if (currentRep) {
      const outboundMatch = line.match(OUTBOUND_CONV_PATTERN);
      if (outboundMatch) {
        currentRep.outboundConversations = parseInt(outboundMatch[1], 10);
        continue;
      }

      const bookingsMatch = line.match(BOOKINGS_PATTERN);
      if (bookingsMatch) {
        currentRep.bookings = parseInt(bookingsMatch[1], 10);
        continue;
      }

      const optOutsMatch = line.match(OPT_OUTS_PATTERN);
      if (optOutsMatch) {
        currentRep.optOuts = parseInt(optOutsMatch[1], 10);
        continue;
      }
    }

    // Check for Sequence line
    const seqMatch = line.match(SEQUENCE_LINE_PATTERN);
    if (seqMatch) {
      const row: SequenceRow = {
        label: seqMatch[1].trim(),
        messagesSent: parseInt(seqMatch[2], 10),
        repliesReceived: parseInt(seqMatch[3], 10),
        replyRate: parseFloat(seqMatch[4]),
        booked: parseInt(seqMatch[5], 10),
        optOuts: parseInt(seqMatch[6], 10)
      };

      if (currentRep) {
        currentRep.sequences.push(row);
      }
    }
  }

  // Aggregate all sequences
  const sequenceMap = new Map<string, SequenceRow>();
  for (const rep of reps) {
    for (const seq of rep.sequences) {
      const existing = sequenceMap.get(seq.label);
      if (existing) {
        existing.messagesSent += seq.messagesSent;
        existing.repliesReceived += seq.repliesReceived;
        existing.booked += seq.booked;
        existing.optOuts += seq.optOuts;
        existing.replyRate = existing.messagesSent > 0 
          ? (existing.repliesReceived / existing.messagesSent) * 100 
          : 0;
      } else {
        sequenceMap.set(seq.label, { ...seq });
      }
    }
  }

  const allSequences = Array.from(sequenceMap.values()).sort((a, b) => b.messagesSent - a.messagesSent);

  const totalMessagesSent = allSequences.reduce((sum, s) => sum + s.messagesSent, 0);
  const totalRepliesReceived = allSequences.reduce((sum, s) => sum + s.repliesReceived, 0);

  // Prefer sequence-level totals for "Bookings" and "Opt-Outs" because the raw report's
  // rep-level "Core Metrics" can be inconsistent with the per-sequence breakdown.
  // Example: rep core metrics may show "Bookings: 8" while the top sequence shows 3;
  // the dashboard should reflect the true total across sequences (3+1+0+2+2+... = 8).
  const totalBooked = allSequences.reduce((sum, s) => sum + s.booked, 0);
  const totalOptOuts = allSequences.reduce((sum, s) => sum + s.optOuts, 0);

  return {
    title: "Daily SMS Snapshot",
    date,
    totalMessagesSent,
    totalRepliesReceived,
    totalBooked,
    totalOptOuts,
    overallReplyRate: totalMessagesSent > 0 ? (totalRepliesReceived / totalMessagesSent) * 100 : 0,
    reps,
    allSequences
  };
}
