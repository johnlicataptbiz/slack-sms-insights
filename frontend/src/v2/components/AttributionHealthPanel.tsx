import { useMemo } from 'react';
import { V2Panel, V2State } from './V2Primitives';
import { useV2AttributionHealth } from '../../api/v2Queries';

const formatTimestamp = (value: string | null | undefined): string => {
  if (!value) return 'n/a';
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return 'n/a';
  return parsed.toLocaleString();
};

export function AttributionHealthPanel() {
  const { data, isLoading, isError, error } = useV2AttributionHealth();

  const lagLabel = useMemo(() => {
    if (data?.lagHours == null) return 'n/a';
    return `${data.lagHours.toFixed(1)}h`;
  }, [data?.lagHours]);

  const panelTone = data?.isLagging ? 'critical' : 'default';

  if (isLoading) {
    return (
      <V2Panel title="Attribution Health" caption="Ensuring Slack bookings stay current." tone={panelTone}>
        <V2State kind="loading">Checking attribution freshness…</V2State>
      </V2Panel>
    );
  }

  if (isError || !data) {
    return (
      <V2Panel title="Attribution Health" caption="Ensuring Slack bookings stay current." tone="critical">
        <V2State kind="error">Failed to load attribution health: {(error as any)?.message || 'unknown'}</V2State>
      </V2Panel>
    );
  }

  return (
    <V2Panel title="Attribution Health" caption="Latest booked call vs. attribution timestamps." tone={panelTone}>
      <div className="V2SplitStat">
        <div>
          <span>Lag</span>
          <strong>{lagLabel}</strong>
        </div>
        <div>
          <span>Latest booked</span>
          <strong>{formatTimestamp(data.maxBookedCallsTs)}</strong>
        </div>
        <div>
          <span>Latest attributed</span>
          <strong>{formatTimestamp(data.maxAttributionTs)}</strong>
        </div>
      </div>
      {data.isLagging && (
        <div className="V2InlineWarning" style={{ marginTop: '1rem' }}>
          Attribution lag exceeds 24h — the dashboard may show fallback bookings until the refresh completes.
        </div>
      )}
    </V2Panel>
  );
}
