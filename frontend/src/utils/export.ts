import type { MergedSeqRow } from '../v2/components/SequencePerformanceTable';

/**
 * Export sequence data to CSV format
 */
export function exportToCSV(data: MergedSeqRow[], filename: string): void {
  const headers = [
    'Sequence',
    'Lead Magnet',
    'Version',
    'Messages Sent',
    'Unique Contacted',
    'Replies Received',
    'Reply Rate %',
    'Booked Calls',
    'Booking Rate %',
    'Booked After SMS Reply',
    'Opt-outs',
    'Opt-out Rate %'
  ];
  
  const rows = data.map(r => [
    r.label,
    r.leadMagnet,
    r.version,
    r.messagesSent,
    r.uniqueContacted,
    r.repliesReceived,
    r.replyRatePct.toFixed(1),
    r.canonicalBookedCalls,
    r.bookingRatePct.toFixed(1),
    r.canonicalBookedAfterSmsReply,
    r.optOuts,
    r.optOutRatePct.toFixed(1)
  ]);
  
  const csv = [headers, ...rows]
    .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    .join('\n');
  
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Format date for filename
 */
export function formatDateForFilename(date: Date = new Date()): string {
  return date.toISOString().split('T')[0];
}
