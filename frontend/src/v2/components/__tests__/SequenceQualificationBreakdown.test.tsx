import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { SequenceQualificationBreakdown } from '../SequenceQualificationBreakdown';

describe('SequenceQualificationBreakdown', () => {
  const mockItems = [
    {
      sequenceLabel: 'Test Sequence',
      totalConversations: 100,
      fullTime: { count: 50, pct: 50, sampleQuote: 'I work full time' },
      partTime: { count: 20, pct: 20, sampleQuote: null },
      mostlyCash: { count: 30, pct: 30, sampleQuote: null },
      mostlyInsurance: { count: 40, pct: 40, sampleQuote: null },
      balancedMix: { count: 10, pct: 10, sampleQuote: null },
      brickAndMortar: { count: 60, pct: 60, sampleQuote: null },
      mobile: { count: 10, pct: 10, sampleQuote: null },
      online: { count: 5, pct: 5, sampleQuote: null },
      hybrid: { count: 5, pct: 5, sampleQuote: null },
      highInterest: { count: 40, pct: 40, sampleQuote: null },
      mediumInterest: { count: 30, pct: 30, sampleQuote: null },
      lowInterest: { count: 10, pct: 10, sampleQuote: null },
      unknownEmployment: { count: 30, pct: 30, sampleQuote: null },
      unknownRevenue: { count: 20, pct: 20, sampleQuote: null },
      unknownDelivery: { count: 20, pct: 20, sampleQuote: null },
      unknownInterest: { count: 20, pct: 20, sampleQuote: null },
      topNiches: [{ niche: 'Sports', count: 20 }],
      mondayOutcomes: {
        linkedContacts: 50,
        totalOutcomes: 50,
        booked: 10,
        closedWon: 5,
        closedLost: 20,
        noShow: 5,
        cancelled: 10,
        badTiming: 0,
        badFit: 0,
        other: 0,
        unknown: 0,
        bookedPct: 20,
        closedWonPct: 10,
        noShowPct: 10,
        cancelledPct: 20,
      }
    }
  ];

  it('renders loading state', () => {
    render(<SequenceQualificationBreakdown items={[]} isLoading={true} />);
    expect(screen.getByText('Loading sequence qualification data...')).toBeInTheDocument();
  });

  it('renders empty state', () => {
    render(<SequenceQualificationBreakdown items={[]} isLoading={false} />);
    expect(screen.getByText('No sequence qualification data available for this time period.')).toBeInTheDocument();
  });

  it('renders sequence data and handles expansion', () => {
    render(<SequenceQualificationBreakdown items={mockItems} isLoading={false} />);
    
    // Header should be visible
    expect(screen.getByText('Lead Qualification by Sequence')).toBeInTheDocument();
    expect(screen.getByText('Test Sequence')).toBeInTheDocument();
    
    // Details should not be visible initially
    expect(screen.queryByText('Employment Status')).not.toBeInTheDocument();
    
    // Click to expand
    const expandButton = screen.getByRole('button', { name: /Test Sequence/i });
    fireEvent.click(expandButton);
    
    // Details should now be visible
    expect(screen.getByText('Employment Status')).toBeInTheDocument();
    expect(screen.getByText('Revenue Mix')).toBeInTheDocument();
    expect(screen.getByText('Clinic Setup')).toBeInTheDocument();
    expect(screen.getByText('Coaching Interest')).toBeInTheDocument();
    expect(screen.getByText('Monday Outcomes')).toBeInTheDocument();
    
    // Check sample quote
    expect(screen.getByText('"I work full time"')).toBeInTheDocument();
  });
});
