import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import { SequencePerformanceTable, type MergedSeqRow } from '../SequencePerformanceTable';

describe('SequencePerformanceTable', () => {
  const mockMergedRows: MergedSeqRow[] = [
    {
      label: 'Test Sequence v1.0',
      leadMagnet: 'Test Magnet',
      version: 'v1.0',
      firstSeenAt: '2023-01-01',
      messagesSent: 100,
      uniqueContacted: 100,
      repliesReceived: 20,
      replyRatePct: 20,
      canonicalBookedCalls: 5,
      bookingRatePct: 5,
      canonicalBookedAfterSmsReply: 4,
      canonicalBookedJack: 2,
      canonicalBookedBrandon: 2,
      canonicalBookedSelf: 1,
      optOuts: 2,
      optOutRatePct: 2,
      bookedAuditRows: [],
      diagnosticSmsBookingSignals: 0,
      isManual: false,
      uniqueReplied: 20,
      smsReplyPct: 80,
    },
    {
      label: 'Manual Sequence',
      leadMagnet: 'Manual',
      version: '',
      firstSeenAt: '2023-01-01',
      messagesSent: 50,
      uniqueContacted: 50,
      repliesReceived: 10,
      replyRatePct: 20,
      canonicalBookedCalls: 2,
      bookingRatePct: 4,
      canonicalBookedAfterSmsReply: 1,
      canonicalBookedJack: 1,
      canonicalBookedBrandon: 1,
      canonicalBookedSelf: 0,
      optOuts: 1,
      optOutRatePct: 2,
      bookedAuditRows: [],
      diagnosticSmsBookingSignals: 0,
      isManual: true,
      uniqueReplied: 10,
      smsReplyPct: 50,
    }
  ];

  it('renders empty state when no active sequences', () => {
    const manualOnlyRows = mockMergedRows.filter(r => r.isManual);
    render(<SequencePerformanceTable mergedRows={manualOnlyRows} modeLabel="Last 7 days" />);
    
    expect(screen.getByText('No sequence data for this window.')).toBeInTheDocument();
  });

  it('renders sequence performance data correctly', () => {
    render(<SequencePerformanceTable mergedRows={mockMergedRows} modeLabel="Last 7 days" />);
    
    // Should show the lead magnet family
    expect(screen.getByText('Test Magnet')).toBeInTheDocument();
    
    // Should show the version
    expect(screen.getByText('v1.0')).toBeInTheDocument();
    
    // Should show metrics
    expect(screen.getByText('100')).toBeInTheDocument();
    expect(screen.getByText('leads')).toBeInTheDocument();
    expect(screen.getByText('100 msgs')).toBeInTheDocument();
    expect(screen.getAllByText('20.0%')[0]).toBeInTheDocument(); // Reply rate
    expect(screen.getAllByText('5.0%')[1]).toBeInTheDocument(); // Booking rate
    
    // Should show interaction count
    expect(screen.getByText('20 interactions')).toBeInTheDocument();
    
    // Should show rep attribution
    expect(screen.getByText('5 calls')).toBeInTheDocument();
    expect(screen.getByText('(J:2 B:2 S:1)')).toBeInTheDocument();
  });

  it('filters out manual sequences', () => {
    render(<SequencePerformanceTable mergedRows={mockMergedRows} modeLabel="Last 7 days" />);
    
    // Should not show manual sequence data
    expect(screen.queryByText('Manual')).not.toBeInTheDocument();
  });
});
