import React, { useMemo } from 'react';
import { V2Panel } from './V2Primitives';
import './ReplyTimingPanel.css';

export type ReplyTimingPanelProps = {
  timing: {
    medianTimeToFirstReplyMinutes: number | null;
    replyRateByDayOfWeek: Array<{
      dayOfWeek: string;
      outboundCount: number;
      replyCount: number;
      replyRatePct: number;
    }>;
  } | null | undefined;
  sequences: Array<{
    label: string;
    medianTimeToFirstReplyMinutes?: number | null;
    avgTimeToFirstReplyMinutes?: number | null;
  }>;
};

const formatDuration = (minutes: number | null): string => {
  if (minutes === null || minutes === undefined) return '—';
  
  if (minutes < 60) {
    return `${Math.round(minutes)}m`;
  } else if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  } else {
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  }
};

const DayOfWeekChart: React.FC<{
  days: Array<{ dayOfWeek: string; replyRatePct: number }>;
}> = ({ days }) => {
  const maxRate = Math.max(...days.map(d => d.replyRatePct), 1);
   
  const getColor = (rate: number): string => {
    if (rate >= 20) return 'var(--v2-success)';
    if (rate >= 15) return 'var(--v2-accent)';
    if (rate >= 10) return 'var(--v2-warning)';
    return 'var(--v2-text-dim)';
  };

  return (
    <div className="ReplyTimingPanel__dayChart">
      {days.map((day) => (
        <div key={day.dayOfWeek} className="ReplyTimingPanel__dayItem">
          <div className="ReplyTimingPanel__dayLabel">{day.dayOfWeek.slice(0, 3)}</div>
          <div className="ReplyTimingPanel__dayBarWrapper">
            <div
              className="ReplyTimingPanel__dayBar"
              style={{
                width: `${Math.min(100, (day.replyRatePct / maxRate) * 100)}%`,
                backgroundColor: getColor(day.replyRatePct),
              }}
            />
            <span className="ReplyTimingPanel__dayValue">
              {day.replyRatePct.toFixed(1)}%
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};

export const ReplyTimingPanel: React.FC<ReplyTimingPanelProps> = ({ timing, sequences }) => {
  const fastestSequences = useMemo(() => {
    return [...sequences]
      .filter(s => s.medianTimeToFirstReplyMinutes !== null && s.medianTimeToFirstReplyMinutes !== undefined)
      .sort((a, b) => (a.medianTimeToFirstReplyMinutes || Infinity) - (b.medianTimeToFirstReplyMinutes || Infinity))
      .slice(0, 5);
  }, [sequences]);

  if (!timing) {
    return (
      <V2Panel title="⏱️ Reply Timing Insights" caption="Loading timing data...">
        <div className="ReplyTimingPanel__loading">Loading reply timing analytics...</div>
      </V2Panel>
    );
  }

  const { medianTimeToFirstReplyMinutes, replyRateByDayOfWeek } = timing;

  return (
    <V2Panel 
      title="⏱️ Reply Timing Insights" 
      caption="When leads respond best · Median time to first reply by day of week"
    >
      <div className="ReplyTimingPanel">
        {/* Main Metric */}
        <div className="ReplyTimingPanel__metrics">
          <div className="ReplyTimingPanel__metric">
            <div className="ReplyTimingPanel__metricValue">
              {formatDuration(medianTimeToFirstReplyMinutes)}
            </div>
            <div className="ReplyTimingPanel__metricLabel">Median Time to First Reply</div>
          </div>
        </div>

        {/* Reply Rate by Day of Week */}
        {replyRateByDayOfWeek && replyRateByDayOfWeek.length > 0 && (
          <div className="ReplyTimingPanel__section">
            <h4 className="ReplyTimingPanel__sectionTitle">Reply Rate by Day of Week</h4>
            <DayOfWeekChart days={replyRateByDayOfWeek} />
          </div>
        )}

        {/* Fastest Responding Sequences */}
        {fastestSequences.length > 0 && (
          <div className="ReplyTimingPanel__section">
            <h4 className="ReplyTimingPanel__sectionTitle">Fastest Responding Sequences</h4>
            <div className="ReplyTimingPanel__sequenceList">
              {fastestSequences.map((seq, index) => (
                <div key={seq.label} className="ReplyTimingPanel__sequenceItem">
                  <span className="ReplyTimingPanel__sequenceRank">#{index + 1}</span>
                  <span className="ReplyTimingPanel__sequenceName" title={seq.label}>
                    {seq.label.length > 30 ? `${seq.label.slice(0, 27)}...` : seq.label}
                  </span>
                  <span className="ReplyTimingPanel__sequenceTime">
                    {formatDuration(seq.medianTimeToFirstReplyMinutes || null)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </V2Panel>
  );
};

export default ReplyTimingPanel;
