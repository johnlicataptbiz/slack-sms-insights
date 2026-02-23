import { useId, type ReactNode } from 'react';

import { V2_TERM_DEFINITIONS, type V2TermKey } from '../copy';

export function V2Sparkline({
  data,
  width = 60,
  height = 24,
  stroke = 'currentColor',
  strokeWidth = 2,
  fill = 'rgba(17, 184, 214, 0.15)',
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
}) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;

  const points = data.map((value, index) => {
    const x = (index / (data.length - 1)) * width;
    const y = height - ((value - min) / range) * height;
    return `${x},${y}`;
  });

  const areaPath = `M0,${height} L${points.join(' L')} L${width},${height} Z`;
  const linePath = `M${points.join(' L')}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="V2Sparkline"
      aria-hidden="true"
    >
      <path d={areaPath} fill={fill} />
      <path d={linePath} fill="none" stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function V2PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle: string;
  right?: ReactNode;
}) {
  return (
    <header className="V2PageHeader">
      <div>
        <p className="V2PageHeader__eyebrow">PT Biz Setter Ops</p>
        <h1>{title}</h1>
        <p className="V2PageHeader__subtitle">{subtitle}</p>
      </div>
      {right ? <div className="V2PageHeader__right">{right}</div> : null}
    </header>
  );
}

export function V2Panel({
  title,
  caption,
  children,
  className,
}: {
  title?: ReactNode;
  caption?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`V2Panel ${className || ''}`.trim()}>
      {title ? <h2 className="V2Panel__title">{title}</h2> : null}
      {caption ? <p className="V2Panel__caption">{caption}</p> : null}
      {children}
    </section>
  );
}

export function V2MetricCard({
  label,
  value,
  meta,
  tone,
  sparkline,
  trend,
}: {
  label: ReactNode;
  value: ReactNode;
  meta?: ReactNode;
  tone?: 'default' | 'positive' | 'critical' | 'accent';
  sparkline?: number[];
  trend?: 'up' | 'down' | 'flat';
}) {
  const trendIcon = trend === 'up' ? '↑' : trend === 'down' ? '↓' : null;
  const trendClass = trend ? `V2MetricCard__trend--${trend}` : '';

  return (
    <article className={`V2MetricCard ${tone ? `V2MetricCard--${tone}` : ''}`}>
      <div className="V2MetricCard__header">
        <p className="V2MetricCard__label">{label}</p>
        {sparkline && sparkline.length >= 2 ? (
          <V2Sparkline
            data={sparkline}
            stroke={tone === 'positive' ? '#13b981' : tone === 'critical' ? '#ef4c62' : '#11b8d6'}
            fill={tone === 'positive' ? 'rgba(19, 185, 129, 0.12)' : tone === 'critical' ? 'rgba(239, 76, 98, 0.12)' : 'rgba(17, 184, 214, 0.12)'}
          />
        ) : null}
      </div>
      <p className="V2MetricCard__value">
        {value}
        {trendIcon ? <span className={`V2MetricCard__trend ${trendClass}`}>{trendIcon}</span> : null}
      </p>
      {meta ? <p className="V2MetricCard__meta">{meta}</p> : null}
    </article>
  );
}

export function V2State({ kind, children }: { kind: 'loading' | 'error' | 'empty'; children: ReactNode }) {
  return <div className={`V2State V2State--${kind}`}>{children}</div>;
}

export function V2RiskAlert({
  title,
  count,
  onAction,
  actionLabel = 'View Details',
}: {
  title: string;
  count: number;
  onAction?: () => void;
  actionLabel?: string;
}) {
  if (count === 0) return null;

  return (
    <div className="V2RiskAlert V2RiskAlert--critical">
      <div className="V2RiskAlert__icon">⚠</div>
      <div className="V2RiskAlert__content">
        <h3 className="V2RiskAlert__title">{title}</h3>
        <p className="V2RiskAlert__text">
          {count} sequence{count === 1 ? '' : 's'} with opt-out rate ≥ 6% detected. Review immediately to prevent list damage.
        </p>
      </div>
      {onAction ? (
        <button type="button" className="V2RiskAlert__action" onClick={onAction}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

export function V2Term({ term, label }: { term: V2TermKey; label?: ReactNode }) {
  const id = useId();
  const definition = V2_TERM_DEFINITIONS[term];
  const text = label ?? definition.label;

  return (
    <span className="V2Term">
      <button className="V2Term__button" type="button" aria-describedby={id}>
        <span>{text}</span>
        <span className="V2Term__badge" aria-hidden="true">
          i
        </span>
      </button>
      <span className="V2Term__tooltip" id={id} role="tooltip">
        <strong>{definition.label}</strong>
        <span>{definition.definition}</span>
      </span>
    </span>
  );
}
