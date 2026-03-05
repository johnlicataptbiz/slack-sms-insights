import { V2Panel } from './V2Primitives';

const fmtInt = (n: number) => n.toLocaleString();

interface BookedCredit {
  total: number;
  jack: number;
  brandon: number;
  selfBooked: number;
}

interface MonthlyBookings {
  sequenceInitiated: number;
  manualInitiated: number;
  total: number;
}

interface BookingAttributionPanelProps {
  bookedCredit?: BookedCredit;
  monthlyBookings?: MonthlyBookings;
  modeLabel: string;
  mode: string;
}

export function BookingAttributionPanel({
  bookedCredit,
  monthlyBookings,
  modeLabel,
  mode,
}: BookingAttributionPanelProps) {
  return (
    <>
      {bookedCredit && (
        <V2Panel
          title={`Booking Attribution — ${modeLabel}`}
          caption={`Rep split for the selected ${mode} window · Booked = Slack-verified`}
        >
          <div className="V2SeqAttribution">
            <div className="V2SeqAttribution__grid">
              <div className="V2SeqAttribution__item V2SeqAttribution__item--total">
                <span className="V2SeqAttribution__label">Total Booked</span>
                <span className="V2SeqAttribution__value">{fmtInt(bookedCredit.total)}</span>
              </div>
              <div className="V2SeqAttribution__item">
                <span className="V2SeqAttribution__label">Jack</span>
                <span className="V2SeqAttribution__value">{fmtInt(bookedCredit.jack)}</span>
              </div>
              <div className="V2SeqAttribution__item">
                <span className="V2SeqAttribution__label">Brandon</span>
                <span className="V2SeqAttribution__value">{fmtInt(bookedCredit.brandon)}</span>
              </div>
              <div className="V2SeqAttribution__item">
                <span className="V2SeqAttribution__label">Self-Booked</span>
                <span className="V2SeqAttribution__value">{fmtInt(bookedCredit.selfBooked)}</span>
              </div>
            </div>
            <p className="V2SeqAttribution__note">
              Rep split reflects the selected {mode} rolling window. Booked = Slack-verified bookings channel.
            </p>
          </div>
        </V2Panel>
      )}
      {monthlyBookings && (
        <V2Panel
          title="Channel Attribution — Monthly"
          caption="Sequence-initiated vs direct outreach · always monthly scoreboard window (channel split not available per rolling window)"
        >
          <div className="V2SeqAttribution">
            <div className="V2SeqAttribution__grid">
              <div className="V2SeqAttribution__item V2SeqAttribution__item--highlight">
                <span className="V2SeqAttribution__label">From Sequences</span>
                <span className="V2SeqAttribution__value">{fmtInt(monthlyBookings.sequenceInitiated)}</span>
              </div>
              <div className="V2SeqAttribution__item">
                <span className="V2SeqAttribution__label">From Direct Outreach</span>
                <span className="V2SeqAttribution__value">{fmtInt(monthlyBookings.manualInitiated)}</span>
              </div>
              <div className="V2SeqAttribution__item V2SeqAttribution__item--total">
                <span className="V2SeqAttribution__label">Total (month)</span>
                <span className="V2SeqAttribution__value">{fmtInt(monthlyBookings.total)}</span>
              </div>
            </div>
            <p className="V2SeqAttribution__note">
              A sequence gets credit when it started the first outbound contact with a lead, even if manual follow-ups came before the booking.
            </p>
          </div>
        </V2Panel>
      )}
    </>
  );
}
