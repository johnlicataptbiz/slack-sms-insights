import { useId, type ReactNode, useState } from 'react';
import { motion, AnimatePresence, type Variants } from 'framer-motion';
import { Loader2, AlertTriangle, Inbox as InboxIcon, ArrowRight, TrendingUp, TrendingDown } from 'lucide-react';
import {
  FloatingPortal,
  autoUpdate,
  flip,
  offset,
  shift,
  useDismiss,
  useFloating,
  useFocus,
  useHover,
  useInteractions,
  useRole,
} from '@floating-ui/react';

import { V2_TERM_DEFINITIONS, type V2TermKey } from '../copy';
import {
  metricCardVariants,
  listContainerVariants,
  listItemVariants,
  panelVariants,
  alertVariants,
  badgeVariants,
  tooltipVariants,
  springs,
  easing,
  fadeInUp,
} from '../utils/motion';

// ─── Sparkline ───────────────────────────────────────────────────────────────
export function V2Sparkline({
  data,
  width = 60,
  height = 24,
  stroke = 'currentColor',
  strokeWidth = 2,
  fill = 'rgba(17, 184, 214, 0.15)',
  animated = true,
}: {
  data: number[];
  width?: number;
  height?: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  animated?: boolean;
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
      <motion.path
        d={areaPath}
        fill={fill}
        initial={animated ? { opacity: 0 } : false}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.3 }}
      />
      <motion.path
        d={linePath}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={animated ? { pathLength: 0, opacity: 0 } : false}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{
          pathLength: { duration: 1, ease: easing.smooth },
          opacity: { duration: 0.3 }
        }}
      />
    </svg>
  );
}

// ─── Page Header ─────────────────────────────────────────────────────────────
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
    <motion.header
      className="V2PageHeader"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: easing.smooth }}
    >
      <div>
        <motion.p
          className="V2PageHeader__eyebrow"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          PT Biz Setter Ops
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15, ease: easing.smooth }}
        >
          {title}
        </motion.h1>
        <motion.p
          className="V2PageHeader__subtitle"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.25 }}
        >
          {subtitle}
        </motion.p>
      </div>
      {right ? (
        <motion.div
          className="V2PageHeader__right"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          {right}
        </motion.div>
      ) : null}
    </motion.header>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────────────
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
    <motion.section
      className={`V2Panel ${className || ''}`.trim()}
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      whileHover={{
        boxShadow: '0 12px 35px rgba(8, 12, 29, 0.12)',
        transition: { duration: 0.2 }
      }}
    >
      {title ? (
        <motion.h2
          className="V2Panel__title"
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          {title}
        </motion.h2>
      ) : null}
      {caption ? (
        <motion.p
          className="V2Panel__caption"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          {caption}
        </motion.p>
      ) : null}
      {children}
    </motion.section>
  );
}

// ─── Metric Card ─────────────────────────────────────────────────────────────
export function V2MetricCard({
  label,
  value,
  meta,
  tone,
  sparkline,
  trend,
  glow,
}: {
  label: ReactNode;
  value: ReactNode;
  meta?: ReactNode;
  tone?: 'default' | 'positive' | 'critical' | 'accent';
  sparkline?: number[] | undefined;
  trend?: 'up' | 'down' | 'flat' | undefined;
  glow?: boolean | 'positive' | 'critical';
}) {
  const trendIcon = trend === 'up'
    ? <TrendingUp size={12} />
    : trend === 'down'
    ? <TrendingDown size={12} />
    : null;
  const [isHovered, setIsHovered] = useState(false);

  const glowClass = glow
    ? glow === 'positive'
      ? 'V2MetricCard--glow V2MetricCard--glow-positive'
      : glow === 'critical'
      ? 'V2MetricCard--glow V2MetricCard--glow-critical'
      : 'V2MetricCard--glow'
    : '';

  return (
    <motion.article
      className={`V2MetricCard ${tone ? `V2MetricCard--${tone}` : ''} ${glowClass}`.trim()}
      variants={metricCardVariants}
      initial="hidden"
      animate="visible"
      whileHover="hover"
      whileTap={{ scale: 0.98 }}
      onHoverStart={() => setIsHovered(true)}
      onHoverEnd={() => setIsHovered(false)}
    >
      <div className="V2MetricCard__header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <motion.p
          className="V2MetricCard__label"
          animate={{
            color: isHovered ? 'var(--v2-accent)' : 'var(--v2-muted)',
          }}
          transition={{ duration: 0.2 }}
        >
          {label}
        </motion.p>
        {sparkline && sparkline.length >= 2 ? (
          <V2Sparkline
            data={sparkline}
            stroke={tone === 'positive' ? '#13b981' : tone === 'critical' ? '#ef4c62' : '#11b8d6'}
            fill={tone === 'positive' ? 'rgba(19, 185, 129, 0.12)' : tone === 'critical' ? 'rgba(239, 76, 98, 0.12)' : 'rgba(17, 184, 214, 0.12)'}
            animated={true}
          />
        ) : null}
      </div>
      <motion.p
        className="V2MetricCard__value"
        style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.2, ...springs.bouncy }}
      >
        {value}
        <AnimatePresence>
          {trendIcon && (
            <motion.span
              className={`V2MetricCard__trendBadge V2MetricCard__trendBadge--${trend}`}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }}
              transition={springs.bouncy}
            >
              {trendIcon}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.p>
      {meta ? (
        <motion.p
          className="V2MetricCard__meta"
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25, duration: 0.3 }}
        >
          {meta}
        </motion.p>
      ) : null}
    </motion.article>
  );
}

// ─── Animated List ───────────────────────────────────────────────────────────
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
      variants={listContainerVariants}
      initial="hidden"
      animate="visible"
    >
      {children}
    </motion.div>
  );
}

// ─── Progress Bar ────────────────────────────────────────────────────────────
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
    <div
      style={{
        width: '100%',
        height,
        background: bg,
        borderRadius: 999,
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <motion.div
        initial={{ width: 0, opacity: 0 }}
        animate={{ width: `${pct}%`, opacity: 1 }}
        transition={{ duration: 0.8, ease: easing.smooth, delay: 0.1 }}
        style={{
          height: '100%',
          background: color,
          borderRadius: 999,
          minWidth: pct > 0 ? 4 : 0,
          boxShadow: `0 0 8px ${color}40`,
        }}
      />
      {/* Shimmer effect */}
      <motion.div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)',
          borderRadius: 999,
        }}
        animate={{
          x: ['-100%', '200%'],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          repeatDelay: 2,
          ease: 'easeInOut',
        }}
      />
    </div>
  );
}

// ─── State Display ───────────────────────────────────────────────────────────
export function V2State({
  kind,
  children,
  onRetry,
}: {
  kind: 'loading' | 'error' | 'empty';
  children: ReactNode;
  onRetry?: () => void;
}) {
  const iconVariants: Variants = {
    loading: {
      rotate: 360,
      transition: { duration: 1.5, repeat: Infinity, ease: 'linear' as const },
    },
    error: {
      scale: [1, 1.1, 1],
      transition: { duration: 0.5 },
    },
    empty: {
      y: [0, -5, 0],
      transition: { duration: 2, repeat: Infinity, ease: 'easeInOut' as const },
    },
  };

  return (
    <motion.div
      className={`V2State V2State--${kind}`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <motion.span
        className="V2State__icon"
        variants={iconVariants}
        animate={kind}
      >
        {kind === 'loading' ? <Loader2 size={24} /> : kind === 'error' ? <AlertTriangle size={24} /> : <InboxIcon size={24} />}
      </motion.span>
      <span className="V2State__text">{children}</span>
      {kind === 'error' && (
        <div className="V2State__actions">
          {onRetry && (
            <button
              type="button"
              className="V2State__btn V2State__btn--primary"
              onClick={onRetry}
            >
              Try again
            </button>
          )}
          <button
            type="button"
            className="V2State__btn V2State__btn--secondary"
            onClick={() => window.location.reload()}
          >
            Reload page
          </button>
        </div>
      )}
    </motion.div>
  );
}

// ─── Risk Alert ──────────────────────────────────────────────────────────────
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
    <motion.div
      className="V2RiskAlert V2RiskAlert--critical"
      variants={alertVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      <motion.div
        className="V2RiskAlert__icon"
        animate={{
          scale: [1, 1.2, 1],
          rotate: [0, -10, 10, 0],
        }}
        transition={{
          duration: 0.5,
          repeat: Infinity,
          repeatDelay: 3,
        }}
      >
        <AlertTriangle size={20} />
      </motion.div>
      <div className="V2RiskAlert__content">
        <h3 className="V2RiskAlert__title">{title}</h3>
        <p className="V2RiskAlert__text">
          {count} sequence{count === 1 ? '' : 's'} with opt-out rate ≥ 6% detected. Review immediately to prevent list damage.
        </p>
      </div>
      {onAction ? (
        <motion.button
          type="button"
          className="V2RiskAlert__action"
          onClick={onAction}
          whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.2)' }}
          whileTap={{ scale: 0.95 }}
        >
          {actionLabel}
        </motion.button>
      ) : null}
    </motion.div>
  );
}

// ─── Term Tooltip ────────────────────────────────────────────────────────────
export function V2Term({ term, label }: { term: V2TermKey; label?: ReactNode }) {
  const id = useId();
  const definition = V2_TERM_DEFINITIONS[term];
  const text = label ?? definition.label;
  const [isOpen, setIsOpen] = useState(false);
  const {
    refs,
    floatingStyles,
    context,
  } = useFloating({
    open: isOpen,
    onOpenChange: setIsOpen,
    placement: 'bottom-start',
    whileElementsMounted: autoUpdate,
    middleware: [offset(8), flip({ padding: 8 }), shift({ padding: 8 })],
  });
  const hover = useHover(context, { move: false });
  const focus = useFocus(context);
  const dismiss = useDismiss(context);
  const role = useRole(context, { role: 'tooltip' });
  const { getReferenceProps, getFloatingProps } = useInteractions([
    hover,
    focus,
    dismiss,
    role,
  ]);

  return (
    <span className="V2Term">
      <motion.button
        className="V2Term__button"
        type="button"
        ref={refs.setReference}
        whileHover={{ scale: 1.02 }}
        {...getReferenceProps({
          'aria-describedby': isOpen ? id : undefined,
        })}
      >
        <span>{text}</span>
        <motion.span
          className="V2Term__badge"
          aria-hidden="true"
          animate={{
            backgroundColor: isOpen ? 'var(--v2-accent)' : 'rgba(17, 184, 214, 0.15)',
            color: isOpen ? '#ffffff' : 'var(--v2-accent)',
          }}
          transition={{ duration: 0.15 }}
        >
          i
        </motion.span>
      </motion.button>
      <AnimatePresence>
        {isOpen && (
          <FloatingPortal>
            <div
              id={id}
              ref={refs.setFloating}
              style={floatingStyles}
              {...getFloatingProps()}
            >
              <motion.span
                className="V2Term__tooltip"
                variants={tooltipVariants}
                initial="hidden"
                animate="visible"
                exit="hidden"
              >
                <strong>{definition.label}</strong>
                <span>{definition.definition}</span>
              </motion.span>
            </div>
          </FloatingPortal>
        )}
      </AnimatePresence>
    </span>
  );
}

// ─── Stat Bar ────────────────────────────────────────────────────────────────
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
          <motion.div
            key={i}
            className="V2StatBar__segment"
            style={{ background: seg.color }}
            initial={{ width: 0 }}
            animate={{ width: `${total > 0 ? (seg.value / total) * 100 : 0}%` }}
            transition={{ duration: 0.8, delay: i * 0.1, ease: easing.smooth }}
            title={`${seg.label}: ${seg.value}`}
            whileHover={{
              scale: 1.02,
              filter: 'brightness(1.1)',
            }}
          />
        ))}
      </div>
      <motion.div
        className="V2StatBar__legend"
        variants={listContainerVariants}
        initial="hidden"
        animate="visible"
      >
        {segments.map((seg, i) => (
          <motion.div
            key={i}
            className="V2StatBar__legendItem"
            variants={listItemVariants}
          >
            <span className="V2StatBar__dot" style={{ background: seg.color }} />
            <span className="V2StatBar__label">{seg.label}</span>
            <span className="V2StatBar__value">{seg.value}</span>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
}

// ─── Pipeline Visual ─────────────────────────────────────────────────────────
export function V2PipelineVisual({
  stages,
}: {
  stages: { label: string; value: number; color?: string }[];
}) {
  const max = Math.max(...stages.map((s) => s.value), 1);

  return (
    <motion.div
      className="V2PipelineVisual"
      variants={listContainerVariants}
      initial="hidden"
      animate="visible"
    >
      {stages.map((stage, i) => (
        <motion.div
          key={i}
          className="V2PipelineVisual__stage"
          variants={listItemVariants}
        >
          <div className="V2PipelineVisual__head">
            <span className="V2PipelineVisual__label">{stage.label}</span>
            <motion.div
              className="V2PipelineVisual__number"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 + i * 0.1 }}
            >
              {stage.value}
            </motion.div>
          </div>
          <div className="V2PipelineVisual__track">
            <motion.div
              className="V2PipelineVisual__bar"
              style={{ background: stage.color || 'var(--v2-accent)' }}
              initial={{ width: 0 }}
              animate={{ width: `${(stage.value / max) * 100}%` }}
              transition={{ duration: 0.6, delay: i * 0.1, ease: easing.smooth }}
            />
          </div>
        </motion.div>
      ))}
    </motion.div>
  );
}

// ─── Action List ─────────────────────────────────────────────────────────────
export function V2ActionList({ actions }: { actions: string[] }) {
  return (
    <motion.ul
      className="V2ActionList"
      variants={listContainerVariants}
      initial="hidden"
      animate="visible"
    >
      {actions.map((action, i) => (
        <motion.li
          key={i}
          className="V2ActionList__item"
          variants={listItemVariants}
          whileHover={{ x: 4, backgroundColor: 'rgba(17, 184, 214, 0.05)' }}
        >
          <motion.span
            className="V2ActionList__icon"
            animate={{ x: [0, 3, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 2 }}
          >
            <ArrowRight size={14} />
          </motion.span>
          <span className="V2ActionList__text">{action}</span>
        </motion.li>
      ))}
    </motion.ul>
  );
}

// ─── Health Indicator ────────────────────────────────────────────────────────
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
    <motion.div
      className={`V2HealthIndicator V2HealthIndicator--${status}`}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      whileHover={{ scale: 1.02 }}
    >
      <motion.div
        className="V2HealthIndicator__dot"
        animate={status === 'critical' ? {
          scale: [1, 1.3, 1],
          opacity: [1, 0.7, 1],
        } : {}}
        transition={{ duration: 1, repeat: Infinity }}
      />
      <span className="V2HealthIndicator__label">{label}</span>
      <span className="V2HealthIndicator__value">{value.toFixed(1)}%</span>
    </motion.div>
  );
}

// ─── Mini Trend ──────────────────────────────────────────────────────────────
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
    <motion.article
      className="V2MiniTrend"
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      whileHover={{
        scale: 1.01,
        backgroundColor: 'rgba(17, 184, 214, 0.03)',
        transition: { duration: 0.15 }
      }}
    >
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
    </motion.article>
  );
}

// ─── Skeleton Loader ─────────────────────────────────────────────────────────
export function V2Skeleton({
  width = '100%',
  height = '1rem',
  variant = 'text',
}: {
  width?: string | number;
  height?: string | number;
  variant?: 'text' | 'circular' | 'rectangular';
}) {
  const borderRadius = variant === 'circular' ? '50%' : variant === 'text' ? '4px' : '8px';

  return (
    <motion.div
      style={{
        width,
        height,
        borderRadius,
        background: 'linear-gradient(90deg, rgba(17, 184, 214, 0.08), rgba(17, 184, 214, 0.15), rgba(17, 184, 214, 0.08))',
        backgroundSize: '200% 100%',
      }}
      animate={{
        backgroundPosition: ['200% 0', '-200% 0'],
      }}
      transition={{
        duration: 1.5,
        repeat: Infinity,
        ease: 'linear',
      }}
    />
  );
}

// ─── Hero Summary ────────────────────────────────────────────────────────────
export function V2HeroSummary({
  primaryValue,
  primaryLabel,
  primaryChange,
  secondaryMetrics,
}: {
  primaryValue: string;
  primaryLabel: string;
  primaryChange?: { value: number; isPositive: boolean };
  secondaryMetrics: Array<{
    value: string;
    label: string;
    meta?: string;
  }>;
}) {
  return (
    <motion.section
      className="V2HeroSummary"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: easing.smooth }}
    >
      <div className="V2HeroSummary__primary">
        <motion.span
          className="V2HeroSummary__value"
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2, ...springs.bouncy }}
        >
          {primaryValue}
        </motion.span>
        <span className="V2HeroSummary__label">{primaryLabel}</span>
        {primaryChange && (
          <motion.span
            className={`V2HeroSummary__change ${primaryChange.isPositive ? 'is-positive' : 'is-negative'}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.4 }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '3px' }}
          >
            {primaryChange.isPositive ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
            {Math.abs(primaryChange.value).toFixed(1)}%
          </motion.span>
        )}
      </div>
      <div className="V2HeroSummary__secondary">
        {secondaryMetrics.map((metric, index) => (
          <motion.div
            key={metric.label}
            className="V2HeroSummary__metric"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + index * 0.1 }}
          >
            <span className="V2HeroSummary__metricValue">{metric.value}</span>
            <span className="V2HeroSummary__metricLabel">{metric.label}</span>
            {metric.meta && (
              <span className="V2HeroSummary__metricMeta">{metric.meta}</span>
            )}
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}

// ─── Tab Navigation ──────────────────────────────────────────────────────────
export function V2TabNav({
  tabs,
  activeTab,
  onChange,
}: {
  tabs: Array<{ key: string; label: string; count?: number }>;
  activeTab: string;
  onChange: (key: string) => void;
}) {
  return (
    <motion.nav
      className="V2TabNav"
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          className={`V2TabNav__btn ${activeTab === tab.key ? 'is-active' : ''}`}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className="V2TabNav__count">{tab.count}</span>
          )}
        </button>
      ))}
    </motion.nav>
  );
}

// ─── Badge ───────────────────────────────────────────────────────────────────
export function V2Badge({
  children,
  variant = 'default',
  animated = false,
}: {
  children: ReactNode;
  variant?: 'default' | 'positive' | 'critical' | 'warning' | 'accent';
  animated?: boolean;
}) {
  return (
    <motion.span
      className={`V2Badge V2Badge--${variant}`}
      {...(animated ? { variants: badgeVariants } : {})}
      initial={animated ? 'hidden' : false}
      animate={animated ? 'visible' : false}
      whileHover={{ scale: 1.05 }}
    >
      {children}
    </motion.span>
  );
}

// ─── Floating Action Button ──────────────────────────────────────────────────
export function V2FloatingButton({
  onClick,
  icon,
  label,
}: {
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <motion.button
      type="button"
      className="V2FloatingButton"
      onClick={onClick}
      aria-label={label}
      initial={{ opacity: 0, scale: 0, rotate: -180 }}
      animate={{ opacity: 1, scale: 1, rotate: 0 }}
      whileHover={{
        scale: 1.1,
        boxShadow: '0 8px 25px rgba(17, 184, 214, 0.35)',
      }}
      whileTap={{ scale: 0.9 }}
      transition={springs.bouncy}
    >
      {icon}
    </motion.button>
  );
}
