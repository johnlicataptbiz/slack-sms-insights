import type { SalesTrendPoint } from '../../api/types';

type Props = {
  points: SalesTrendPoint[];
};

const max = (values: number[]): number => values.reduce((m, v) => (v > m ? v : m), 0);

export function SalesTrendChart({ points }: Props) {
  const maxSent = max(points.map((p) => p.messagesSent));
  const maxBooked = max(points.map((p) => p.booked));
  const maxOptOuts = max(points.map((p) => p.optOuts));
  const maxReplies = max(points.map((p) => p.repliesReceived));

  const scale = (value: number, denom: number): number => {
    if (denom <= 0) return 0;
    return Math.round((value / denom) * 100);
  };

  if (points.length === 0) {
    return <div style={{ opacity: 0.7 }}>No data</div>;
  }

  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {points.map((p) => (
        <div
          key={p.day}
          style={{
            display: 'grid',
            gridTemplateColumns: '90px 1fr',
            gap: 12,
            alignItems: 'center',
          }}
        >
          <div style={{ fontFamily: 'monospace', fontSize: 12, opacity: 0.8 }}>{p.day}</div>

          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 60px', gap: 8, alignItems: 'center' }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Sent</div>
              <div style={{ height: 8, background: '#1f2937', borderRadius: 999 }}>
                <div
                  style={{
                    width: `${scale(p.messagesSent, maxSent)}%`,
                    height: '100%',
                    background: '#60a5fa',
                    borderRadius: 999,
                  }}
                />
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, textAlign: 'right' }}>{p.messagesSent}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 60px', gap: 8, alignItems: 'center' }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Replies</div>
              <div style={{ height: 8, background: '#1f2937', borderRadius: 999 }}>
                <div
                  style={{
                    width: `${scale(p.repliesReceived, maxReplies)}%`,
                    height: '100%',
                    background: '#34d399',
                    borderRadius: 999,
                  }}
                />
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, textAlign: 'right' }}>{p.repliesReceived}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 60px', gap: 8, alignItems: 'center' }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Booked</div>
              <div style={{ height: 8, background: '#1f2937', borderRadius: 999 }}>
                <div
                  style={{
                    width: `${scale(p.booked, maxBooked)}%`,
                    height: '100%',
                    background: '#fbbf24',
                    borderRadius: 999,
                  }}
                />
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, textAlign: 'right' }}>{p.booked}</div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 60px', gap: 8, alignItems: 'center' }}>
              <div style={{ fontSize: 12, opacity: 0.8 }}>Opt-outs</div>
              <div style={{ height: 8, background: '#1f2937', borderRadius: 999 }}>
                <div
                  style={{
                    width: `${scale(p.optOuts, maxOptOuts)}%`,
                    height: '100%',
                    background: '#f87171',
                    borderRadius: 999,
                  }}
                />
              </div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, textAlign: 'right' }}>{p.optOuts}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
