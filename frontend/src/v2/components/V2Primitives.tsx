import { useId, type ReactNode } from 'react';
import { motion } from 'framer-motion';

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
    <motion.article 
      className={`V2MetricCard ${tone ? `V2MetricCard--${tone}` : ''}`}
      variants={{
        hidden: { opacity: 0, y: 15 },
        show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 400, damping: 30 } }
      }}
    >
      <div className="V2MetricCard__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <p className="V2MetricCard__label">{label}</p>
        {sparkline && sparkline.length >= 2 ? (
          <V2Sparkline
            data={sparkline}
            stroke={tone === 'positive' ? '#13b981' : tone === 'critical' ? '#ef4c62' : '#11b8d6'}
            fill={tone === 'positive' ? 'rgba(19, 185, 129, 0.12)' : tone === 'critical' ? 'rgba(239, 76, 98, 0.12)' : 'rgba(17, 184, 214, 0.12)'}
          />
        ) : null}
      </div>
      <p className="V2MetricCard__value" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
        {value}
        {trendIcon ? (
          <span className={`V2MetricCard__trendBadge V2MetricCard__trendBadge--${trend}`}>
            {trendIcon}
          </span>
        ) : null}
      </p>
      {meta ? <p className="V2MetricCard__meta">{meta}</p> : null}
    </motion.article>
  );
}

export function V2AnimatedList({ 
  children, 
  className 
}: { 
  children: ReactNode; 
  className?: string;
}) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      animate="show"
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: { staggerChildren: 0.05 }
        }
      }}
    >
      {children}
    </motion.div>
  );
}

export function V2ProgressBar({
  value,
  max = 100,
  color = 'var(--v2-accent)',
  bg = 'rgba(7, 19, 36, 0.08)',
  height = 6,
}: {
  value: number;
  max?: number;
  color?: string;
  bg?: string;
  height?: number;
}) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div style={{ width: '100%', height, background: bg, borderRadius: 999, overflow: 'hidden' }}>
      <motion.div
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        style={{ height: '100%', background: color, borderRadius: 999, minWidth: pct > 0 ? 4 : 0 }}
      />
    </div>
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

// Visual Components for Dashboard

export function V2StatBar({
  segments,
  total,
}: {
  segments: { label: string; value: number; color: string }[];
  total: number;
}) {
  return (
    <div className="V2StatBar">
      <div className="V2StatBar__track">
        {segments.map((seg, i) => (
          <div
            key={i}
            className="V2StatBar__segment"
            style={{
              width: `${total > 0 ? (seg.value / total) * 100 : 0}%`,
              background: seg.color,
            }}
            title={`${seg.label}: ${seg.value}`}
          />
        ))}
      </div>
      <div className="V2StatBar__legend">
        {segments.map((seg, i) => (
          <div key={i} className="V2StatBar__legendItem">
            <span className="V2StatBar__dot" style={{ background: seg.color }} />
            <span className="V2StatBar__label">{seg.label}</span>
            <span className="V2StatBar__value">{seg.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function V2PipelineVisual({
  stages,
}: {
  stages: { label: string; value: number; color?: string }[];
}) {
  const max = Math.max(...stages.map((s) => s.value), 1);
  
  return (
    <div className="V2PipelineVisual">
      {stages.map((stage, i) => (
        <div key={i} className="V2PipelineVisual__stage">
          <div className="V2PipelineVisual__barWrap">
            <div
              className="V2PipelineVisual__bar"
              style={{
                width: `${(stage.value / max) * 100}%`,
                background: stage.color || 'var(--v2-accent)',
              }}
            />
            <span className="V2PipelineVisual__number">{stage.value}</span>
          </div>
          <span className="V2PipelineVisual__label">{stage.label}</span>
        </div>
      ))}
    </div>
  );
}

export function V2ActionList({ actions }: { actions: string[] }) {
  return (
    <ul className="V2ActionList">
      {actions.map((action, i) => (
        <li key={i} className="V2ActionList__item">
          <span className="V2ActionList__icon">→</span>
          <span className="V2ActionList__text">{action}</span>
        </li>
      ))}
    </ul>
  );
}

export function V2HealthIndicator({
  value,
  threshold,
  label,
}: {
  value: number;
  threshold: number;
  label: string;
}) {
  const status = value >= threshold ? 'critical' : value >= threshold / 2 ? 'warning' : 'healthy';
  
  return (
    <div className={`V2HealthIndicator V2HealthIndicator--${status}`}>
      <div className="V2HealthIndicator__dot" />
      <span className="V2HealthIndicator__label">{label}</span>
      <span className="V2HealthIndicator__value">{value.toFixed(1)}%</span>
    </div>
  );
}

export function V2MiniTrend({
  day,
  sent,
  replyRate,
  booked,
  optOuts,
}: {
  day: string;
  sent: number;
  replyRate: number;
  booked: number;
  optOuts: number;
}) {
  return (
    <article className="V2MiniTrend">
      <h3 className="V2MiniTrend__day">{day}</h3>
      <div className="V2MiniTrend__grid">
        <div className="V2MiniTrend__stat">
          <span className="V2MiniTrend__label">Sent</span>
          <span className="V2MiniTrend__value">{sent.toLocaleString()}</span>
        </div>
        <div className="V2MiniTrend__stat">
          <span className="V2MiniTrend__label">Reply</span>
          <span className="V2MiniTrend__value V2MiniTrend__value--accent">{replyRate.toFixed(1)}%</span>
        </div>
        <div className="V2MiniTrend__stat">
          <span className="V2MiniTrend__label">Sets</span>
          <span className="V2MiniTrend__value V2MiniTrend__value--positive">{booked}</span>
        </div>
        <div className="V2MiniTrend__stat">
          <span className="V2MiniTrend__label">Opt-outs</span>
          <span className="V2MiniTrend__value V2MiniTrend__value--critical">{optOuts}</span>
        </div>
      </div>
    </article>
  );
}
