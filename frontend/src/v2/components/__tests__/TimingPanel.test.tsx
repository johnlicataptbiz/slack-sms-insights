import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { describe, it, expect } from 'vitest';
import { TimingPanel } from '../TimingPanel';

describe('TimingPanel', () => {
  const mockTimingData = {
    medianTimeToFirstReplyMinutes: 125,
    replyRateByDayOfWeek: [
      {
        dayOfWeek: 'Monday',
        replyRatePct: 15.5,
        outboundCount: 100,
        replyCount: 15,
      },
      {
        dayOfWeek: 'Tuesday',
        replyRatePct: 20.0,
        outboundCount: 150,
        replyCount: 30,
      },
    ],
  };

  it('renders the median time correctly', () => {
    render(<TimingPanel timing={mockTimingData} />);
    
    expect(screen.getByText('Median Time to First Reply')).toBeInTheDocument();
    // 125 minutes = 2h 5m
    expect(screen.getByText('2h 5m')).toBeInTheDocument();
  });

  it('renders the reply rate by day of week chart', () => {
    render(<TimingPanel timing={mockTimingData} />);
    
    expect(screen.getByText('Reply Rate by Day of Week')).toBeInTheDocument();
    
    expect(screen.getByText('Monday')).toBeInTheDocument();
    expect(screen.getByText('15.5%')).toBeInTheDocument();
    expect(screen.getByText('100 sent')).toBeInTheDocument();
    
    expect(screen.getByText('Tuesday')).toBeInTheDocument();
    expect(screen.getByText('20.0%')).toBeInTheDocument();
    expect(screen.getByText('150 sent')).toBeInTheDocument();
  });

  it('handles null median time', () => {
    const noMedianData = {
      ...mockTimingData,
      medianTimeToFirstReplyMinutes: null,
    };
    
    render(<TimingPanel timing={noMedianData} />);
    
    expect(screen.queryByText('Median Time to First Reply')).not.toBeInTheDocument();
  });
});
