import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect } from 'vitest';
import { BookingAttributionPanel } from '../BookingAttributionPanel';
import type { SalesMetricsV2 } from '../../../api/v2-types';

describe('BookingAttributionPanel', () => {
  const mockBookedCredit = {
    total: 50,
    jack: 20,
    brandon: 15,
    selfBooked: 15,
  };

  const mockAttribution: SalesMetricsV2['provenance']['sequenceBookedAttribution'] = {
    source: 'slack_booked_calls',
    model: 'strict_sms_first_conversion',
    totalCalls: 50,
    matchedCalls: 30,
    unattributedCalls: 10,
    manualCalls: 10,
    strictSmsReplyLinkedCalls: 25,
    nonSmsOrUnknownCalls: 5,
    unattributedAuditRows: []
  };

  it('renders booked credit correctly', () => {
    render(
      <MemoryRouter>
        <BookingAttributionPanel 
          bookedCredit={mockBookedCredit} 
          modeLabel="Last 7 days" 
          mode="7d"
        />
      </MemoryRouter>
    );
    
    expect(screen.getByText('Booking Attribution')).toBeInTheDocument();
    expect(screen.getByText('Total Slack Bookings')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    
    expect(screen.getByText('jack')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    
    expect(screen.getByText('brandon')).toBeInTheDocument();
    expect(screen.getAllByText('15')[0]).toBeInTheDocument();
    
    expect(screen.getByText('selfBooked')).toBeInTheDocument();
  });

  it('renders attribution correctly', () => {
    render(
      <MemoryRouter>
        <BookingAttributionPanel 
          bookedCredit={mockBookedCredit}
          attribution={mockAttribution} 
          modeLabel="Last 7 days" 
          mode="7d"
        />
      </MemoryRouter>
    );
    
    expect(screen.getByText('Matched to Sequence')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    expect(screen.getByText('Manual / Direct')).toBeInTheDocument();
    expect(screen.getAllByText('10')[0]).toBeInTheDocument();
    expect(screen.getByText('Unattributed Gaps')).toBeInTheDocument();
  });
});
