import React from 'react';

interface Props {
  label: string;
  value: string | number;
  tone?: 'neutral' | 'danger' | 'success';
}

export function MetricCard({ label, value, tone = 'neutral' }: Props) {
  return (
    <div className={`MetricCard MetricCard--${tone}`}>
      <div className="MetricCard__label">{label}</div>
      <div className="MetricCard__value">{value}</div>
    </div>
  );
}
