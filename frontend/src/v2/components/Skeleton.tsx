import { motion } from 'framer-motion';

// ═══════════════════════════════════════════════════════════════════════════════
// Issue #11: Loading Skeleton Components
// ═══════════════════════════════════════════════════════════════════════════════

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string | number;
  className?: string;
}

export function Skeleton({
  width = '100%',
  height = '1rem',
  borderRadius = '4px',
  className = '',
}: SkeletonProps) {
  return (
    <motion.div
      className={`V2Skeleton ${className}`}
      style={{ width, height, borderRadius }}
      initial={{ opacity: 0.5 }}
      animate={{ opacity: [0.5, 0.8, 0.5] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
      aria-hidden="true"
      role="presentation"
    />
  );
}

export function SkeletonText({
  lines = 3,
  lastLineWidth = '60%',
}: {
  lines?: number;
  lastLineWidth?: string;
}) {
  return (
    <div className="V2Skeleton__text" role="presentation" aria-label="Loading content">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          width={i === lines - 1 ? lastLineWidth : '100%'}
          height="0.875rem"
          className="V2Skeleton__line"
        />
      ))}
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="V2Skeleton__card" role="presentation" aria-label="Loading card">
      <div className="V2Skeleton__cardHeader">
        <Skeleton width="60%" height="1.25rem" />
        <Skeleton width="2rem" height="1.25rem" borderRadius="50%" />
      </div>
      <div className="V2Skeleton__cardBody">
        <Skeleton width="40%" height="2.5rem" className="V2Skeleton__value" />
        <Skeleton width="80%" height="0.75rem" />
      </div>
      <Skeleton width="100%" height="24px" className="V2Skeleton__sparkline" />
    </div>
  );
}

export function SkeletonMetricCard() {
  return (
    <div className="V2Skeleton__metricCard" role="presentation" aria-label="Loading metric">
      <div className="V2Skeleton__metricHeader">
        <Skeleton width="70%" height="0.875rem" />
        <Skeleton width="1.5rem" height="1.5rem" borderRadius="50%" />
      </div>
      <Skeleton width="50%" height="2rem" className="V2Skeleton__metricValue" />
      <div className="V2Skeleton__metricFooter">
        <Skeleton width="100%" height="24px" />
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, columns = 4 }: { rows?: number; columns?: number }) {
  return (
    <div className="V2Skeleton__table" role="presentation" aria-label="Loading table">
      <div className="V2Skeleton__tableHeader">
        {Array.from({ length: columns }).map((_, i) => (
          <Skeleton key={i} width={`${100 / columns - 2}%`} height="1rem" />
        ))}
      </div>
      <div className="V2Skeleton__tableBody">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={rowIdx} className="V2Skeleton__tableRow">
            {Array.from({ length: columns }).map((_, colIdx) => (
              <Skeleton
                key={colIdx}
                width={`${Math.random() * 40 + 40}%`}
                height="0.875rem"
              />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function SkeletonInbox() {
  return (
    <div className="V2Skeleton__inbox" role="presentation" aria-label="Loading inbox">
      <div className="V2Skeleton__inboxList">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="V2Skeleton__inboxItem">
            <Skeleton width="2.5rem" height="2.5rem" borderRadius="50%" />
            <div className="V2Skeleton__inboxItemContent">
              <Skeleton width="60%" height="0.875rem" />
              <Skeleton width="100%" height="0.75rem" />
              <Skeleton width="40%" height="0.625rem" />
            </div>
          </div>
        ))}
      </div>
      <div className="V2Skeleton__inboxDetail">
        <div className="V2Skeleton__inboxHeader">
          <Skeleton width="3rem" height="3rem" borderRadius="50%" />
          <div className="V2Skeleton__inboxHeaderText">
            <Skeleton width="50%" height="1.25rem" />
            <Skeleton width="30%" height="0.75rem" />
          </div>
        </div>
        <div className="V2Skeleton__inboxMessages">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`V2Skeleton__message V2Skeleton__message--${i % 2 === 0 ? 'in' : 'out'}`}>
              <Skeleton width={`${Math.random() * 30 + 50}%`} height="3rem" borderRadius="12px" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="V2Skeleton__dashboard" role="presentation" aria-label="Loading dashboard">
      <div className="V2Skeleton__dashboardHeader">
        <Skeleton width="200px" height="2rem" />
        <div className="V2Skeleton__dashboardActions">
          <Skeleton width="120px" height="2.5rem" borderRadius="8px" />
          <Skeleton width="120px" height="2.5rem" borderRadius="8px" />
        </div>
      </div>

      <div className="V2Skeleton__metricsGrid">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonMetricCard key={i} />
        ))}
      </div>

      <div className="V2Skeleton__panelsGrid">
        <div className="V2Skeleton__panel V2Skeleton__panel--wide">
          <Skeleton width="40%" height="1.25rem" className="V2Skeleton__panelTitle" />
          <SkeletonTable rows={5} columns={4} />
        </div>
        <div className="V2Skeleton__panel">
          <Skeleton width="50%" height="1.25rem" className="V2Skeleton__panelTitle" />
          <SkeletonText lines={4} />
        </div>
      </div>
    </div>
  );
}

export default Skeleton;
