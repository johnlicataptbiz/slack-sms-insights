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
    return <div className="SalesTrend__empty">No data</div>;
  }

  return (
    <div className="SalesTrend">
      {points.map((p) => (
        <div key={p.day} className="SalesTrend__row">
          <div className="SalesTrend__day">{p.day}</div>

          <div className="SalesTrend__bars">
            <div className="SalesTrend__line">
              <div className="SalesTrend__label">Sent</div>
              <div className="SalesTrend__track">
                <div className="SalesTrend__fill SalesTrend__fill--sent" style={{ width: `${scale(p.messagesSent, maxSent)}%` }} />
              </div>
              <div className="SalesTrend__value">{p.messagesSent}</div>
            </div>

            <div className="SalesTrend__line">
              <div className="SalesTrend__label">Replies</div>
              <div className="SalesTrend__track">
                <div
                  className="SalesTrend__fill SalesTrend__fill--replies"
                  style={{ width: `${scale(p.repliesReceived, maxReplies)}%` }}
                />
              </div>
              <div className="SalesTrend__value">{p.repliesReceived}</div>
            </div>

            <div className="SalesTrend__line">
              <div className="SalesTrend__label">Booked</div>
              <div className="SalesTrend__track">
                <div className="SalesTrend__fill SalesTrend__fill--booked" style={{ width: `${scale(p.booked, maxBooked)}%` }} />
              </div>
              <div className="SalesTrend__value">{p.booked}</div>
            </div>

            <div className="SalesTrend__line">
              <div className="SalesTrend__label">Opt-outs</div>
              <div className="SalesTrend__track">
                <div
                  className="SalesTrend__fill SalesTrend__fill--optouts"
                  style={{ width: `${scale(p.optOuts, maxOptOuts)}%` }}
                />
              </div>
              <div className="SalesTrend__value">{p.optOuts}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
