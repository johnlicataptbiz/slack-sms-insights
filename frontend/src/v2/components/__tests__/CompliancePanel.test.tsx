import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import { CompliancePanel } from '../CompliancePanel';

describe('CompliancePanel', () => {
  const mockComplianceData = {
    optOutRateWeeklyPct: 2.5,
    optOutRateMonthlyPct: 3.5,
    topOptOutSequences: [
      {
        label: 'Test Sequence 1',
        optOuts: 10,
        optOutRatePct: 4.5,
      },
      {
        label: 'Test Sequence 2',
        optOuts: 15,
        optOutRatePct: 6.0,
      },
    ],
  };

  it('renders the compliance rates correctly', () => {
    render(<CompliancePanel compliance={mockComplianceData} />);
    
    expect(screen.getByText('Weekly Opt-Out Rate')).toBeInTheDocument();
    expect(screen.getByText('2.5%')).toBeInTheDocument();
    
    expect(screen.getByText('Monthly Opt-Out Rate')).toBeInTheDocument();
    expect(screen.getByText('3.5%')).toBeInTheDocument();
  });

  it('renders the top opt-out sequences table', () => {
    render(<CompliancePanel compliance={mockComplianceData} />);
    
    expect(screen.getByText('Highest Opt-Out Sequences')).toBeInTheDocument();
    expect(screen.getByText('Test Sequence 1')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('4.5%')).toBeInTheDocument();
    
    expect(screen.getByText('Test Sequence 2')).toBeInTheDocument();
    expect(screen.getByText('15')).toBeInTheDocument();
    expect(screen.getByText('6.0%')).toBeInTheDocument();
  });

  it('does not render the table if there are no top opt-out sequences', () => {
    const emptyData = {
      ...mockComplianceData,
      topOptOutSequences: [],
    };
    
    render(<CompliancePanel compliance={emptyData} />);
    
    expect(screen.queryByText('Highest Opt-Out Sequences')).not.toBeInTheDocument();
  });
});
