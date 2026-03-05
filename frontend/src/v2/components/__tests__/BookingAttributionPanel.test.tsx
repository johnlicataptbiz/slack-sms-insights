import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { BookingAttributionPanel } from '../BookingAttributionPanel';

describe('BookingAttributionPanel', () => {
  const mockBookedCredit = {
    total: 50,
    jack: 20,
    brandon: 15,
    selfBooked: 15,
  };

  const mockMonthlyBookings = {
    sequenceInitiated: 30,
    manualInitiated: 20,
    total: 50,
  };

  it('renders booked credit correctly', () => {
    render(
      <BookingAttributionPanel 
        bookedCredit={mockBookedCredit} 
        modeLabel="Last 7 days" 
        mode="7d" 
      />
    );
    
    expect(screen.getByText('Booking Attribution — Last 7 days')).toBeInTheDocument();
    expect(screen.getByText('Total Booked')).toBeInTheDocument();
    expect(screen.getByText('50')).toBeInTheDocument();
    
    expect(screen.getByText('Jack')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    
    expect(screen.getByText('Brandon')).toBeInTheDocument();
    expect(screen.getAllByText('15')[0]).toBeInTheDocument();
    
    expect(screen.getByText('Self-Booked')).toBeInTheDocument();
  });

  it('renders monthly bookings correctly', () => {
    render(
      <BookingAttributionPanel 
        monthlyBookings={mockMonthlyBookings} 
        modeLabel="Last 7 days" 
        mode="7d" 
      />
    );
    
    expect(screen.getByText('Channel Attribution — Monthly')).toBeInTheDocument();
    
    expect(screen.getByText('From Sequences')).toBeInTheDocument();
    expect(screen.getByText('30')).toBeInTheDocument();
    
    expect(screen.getByText('From Direct Outreach')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    
    expect(screen.getByText('Total (month)')).toBeInTheDocument();
  });

  it('renders both panels when both data objects are provided', () => {
    render(
      <BookingAttributionPanel 
        bookedCredit={mockBookedCredit}
        monthlyBookings={mockMonthlyBookings} 
        modeLabel="Last 7 days" 
        mode="7d" 
      />
    );
    
    expect(screen.getByText('Booking Attribution — Last 7 days')).toBeInTheDocument();
    expect(screen.getByText('Channel Attribution — Monthly')).toBeInTheDocument();
  });
});
