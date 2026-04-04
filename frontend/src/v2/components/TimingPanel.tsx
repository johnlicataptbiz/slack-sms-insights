import { V2Panel } from './V2Primitives';

const fmtPct = (n: number) => `${n.toFixed(1)}%`;
const fmtInt = (n: number) => n.toLocaleString();

const fmtMins = (n: number | null): string => {
  if (n === null) return '—';
  if (n < 60) return `${Math.round(n)}m`;
  const h = Math.floor(n / 60);
  const m = Math.round(n % 60);
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
};

interface TimingData {
  medianTimeToFirstReplyMinutes: number | null;
  replyRateByDayOfWeek: Array<{
    dayOfWeek: string;
    replyRatePct: number;
    outboundCount: number;
    replyCount: number;
  }>;
}

interface TimingPanelProps {
  timing: TimingData;
}

export function TimingPanel({ timing }: TimingPanelProps) {
  return (
    <V2Panel
      title="Reply Timing"
      caption="Median time to first reply and reply rate by day of week · weekly window"
    >
      <div className="V2SeqTiming">
        {timing.medianTimeToFirstReplyMinutes !== null && (
          <div className="V2SeqTiming__median">
            <span className="V2SeqTiming__medianLabel">Median Time to First Reply</span>
            <span className="V2SeqTiming__medianValue">
              {fmtMins(timing.medianTimeToFirstReplyMinutes)}
            </span>
          </div>
        )}
        {timing.replyRateByDayOfWeek.length > 0 && (
          <div className="V2SeqTiming__chart">
            <p className="V2SeqTiming__chartTitle">Reply Rate by Day of Week</p>
            {timing.replyRateByDayOfWeek.map((day) => {
              const barPct = Math.min(day.replyRatePct, 100);
              return (
                <div key={day.dayOfWeek} className="V2SeqTiming__row">
                  <span className="V2SeqTiming__day">{day.dayOfWeek}</span>
                  <div className="V2SeqTiming__barWrap">
                    <div
                      className="V2SeqTiming__bar"
                      style={{ width: `${barPct}%` }}
                      title={`${fmtPct(day.replyRatePct)} reply rate · ${fmtInt(day.outboundCount)} sent · ${fmtInt(day.replyCount)} replied`}
                    />
                  </div>
                  <span className="V2SeqTiming__pct">{fmtPct(day.replyRatePct)}</span>
                  <span className="V2SeqTiming__vol">{fmtInt(day.outboundCount)} sent</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </V2Panel>
  );
}
