import { useNavigate } from 'react-router-dom';
import type { BookedCredit, SalesMetricsV2 } from '../../api/v2-types';
import { V2Panel } from './V2Primitives';

interface BookingAttributionPanelProps {
  bookedCredit?: BookedCredit | undefined;
  attribution?: SalesMetricsV2['provenance']['sequenceBookedAttribution'] | undefined;
  modeLabel: string;
  mode: string;
}

export function BookingAttributionPanel({ bookedCredit, attribution, modeLabel }: BookingAttributionPanelProps) {
  const navigate = useNavigate();

  if (!bookedCredit) return null;

  return (
    <V2Panel title="Booking Attribution" caption={`How ${modeLabel} bookings are being credited and sourced.`}>
      <div className="V2SplitStat" style={{ marginBottom: '1.5rem' }}>
        <div>
          <span>Total Slack Bookings</span>
          <strong>{attribution?.totalCalls ?? bookedCredit.total}</strong>
        </div>
        <div>
          <span>Matched to Sequence</span>
          <strong>{attribution?.matchedCalls ?? '—'}</strong>
        </div>
        <div>
          <span>Manual / Direct</span>
          <strong>{attribution?.manualCalls ?? '—'}</strong>
        </div>
        <div style={{ color: (attribution?.unattributedCalls ?? 0) > 0 ? 'var(--v2-warning)' : 'inherit' }}>
          <span>Unattributed Gaps</span>
          <strong>{attribution?.unattributedCalls ?? 0}</strong>
        </div>
      </div>

      <div className="V2ActionRow">
        <button 
          type="button"
          className="V2Btn" 
          onClick={() => navigate('/v2/attribution')}
          title="See detailed audit of every booked call and its attribution path."
        >
          View Attribution Deep Dive
        </button>
      </div>

      <div className="V2Divider" style={{ margin: '1.5rem 0', height: '1px', background: 'var(--v2-border)' }} />

      <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--v2-text-dim)', marginBottom: '0.75rem' }}>
        Rep Credits ({modeLabel})
      </h4>
      <div className="V2RepSplits">
        {Object.entries(bookedCredit).map(([rep, count]) => {
          if (rep === 'total') return null;
          return (
            <div key={rep} className="V2RepStat">
              <span className="V2RepStat__name" style={{ textTransform: 'capitalize' }}>{rep}</span>
              <span className="V2RepStat__count">{count}</span>
            </div>
          );
        })}
      </div>
    </V2Panel>
  );
}
