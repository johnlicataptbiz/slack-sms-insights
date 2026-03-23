/**
 * Metrics Dashboard Component
 * 
 * Displays KPI cards with sparklines, progress bars, and trend indicators.
 * Uses the centralized design tokens for consistent styling.
 */

import { useMemo } from "react";
import { cn } from "../../lib/utils";
import { colors, shadows } from "../../styles/design-tokens";

// ============================================
// TYPES
// ============================================

export interface MetricData {
  label: string;
  value: number;
  previousValue?: number;
  target?: number;
  unit?: string;
  trend: ("up" | "down" | "stable")[];
  format?: "number" | "percent" | "currency";
}

export interface KpiCardProps {
  title: string;
  metric: MetricData;
  icon?: React.ReactNode;
  className?: string;
}

// ============================================
// HELPER COMPONENTS
// ============================================

/**
 * Sparkline visualization using Unicode block characters
 */
const Sparkline = ({ trend, color }: { trend: ("up" | "down" | "stable")[]; color: string }) => {
  if (!trend || trend.length === 0) return null;
  
  const blocks = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];
  
  // Convert trend directions to visual representation
  const sparkline = trend.map((direction, index) => {
    const baseHeight = direction === "up" ? 6 : direction === "down" ? 2 : 4;
    const variation = Math.sin(index * 0.5) * 1;
    const heightIndex = Math.floor(Math.max(0, Math.min(7, baseHeight + variation)));
    return blocks[heightIndex];
  }).join("");
  
  return (
    <span 
      className="font-mono text-xs tracking-tight" 
      style={{ color }}
      title={trend.join(", ")}
    >
      {sparkline}
    </span>
  );
};

/**
 * Mini progress bar
 */
const ProgressBar = ({ 
  value, 
  max, 
  color = colors.primary[500],
  bgColor = colors.neutral[200],
  height = 6,
}: { 
  value: number; 
  max: number; 
  color?: string;
  bgColor?: string;
  height?: number;
}) => {
  const percent = Math.min((value / max) * 100, 100);
  
  return (
    <div 
      className="w-full rounded-full overflow-hidden"
      style={{ 
        backgroundColor: bgColor,
        height: `${height}px`,
      }}
    >
      <div
        className="h-full rounded-full transition-all duration-500 ease-out"
        style={{ 
          width: `${percent}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
};

/**
 * Trend arrow indicator
 */
const TrendIndicator = ({ direction }: { direction: "up" | "down" | "stable" }) => {
  const config = {
    up: { symbol: "↑", color: colors.success[500] },
    down: { symbol: "↓", color: colors.error[500] },
    stable: { symbol: "→", color: colors.neutral[500] },
  };
  
  const { symbol, color } = config[direction];
  
  return (
    <span 
      className="font-semibold text-sm"
      style={{ color }}
      aria-label={`Trend: ${direction}`}
    >
      {symbol}
    </span>
  );
};

/**
 * Format metric value based on type
 */
const formatValue = (value: number, format?: MetricData["format"], unit?: string): string => {
  let formatted: string;
  
  switch (format) {
    case "percent":
      formatted = `${value.toFixed(1)}%`;
      break;
    case "currency":
      formatted = `$${value.toLocaleString()}`;
      break;
    default:
      formatted = value.toLocaleString();
  }
  
  return unit ? `${formatted} ${unit}` : formatted;
};

// ============================================
// KPI CARD COMPONENT
// ============================================

export const KpiCard = ({ title, metric, icon, className }: KpiCardProps) => {
  const { value, previousValue, target, trend, format, unit } = metric;
  
  // Calculate change percentage
  const changePercent = useMemo(() => {
    if (!previousValue || previousValue === 0) return null;
    return ((value - previousValue) / previousValue) * 100;
  }, [value, previousValue]);
  
  // Determine trend direction from trend array
  const overallTrend = useMemo(() => {
    if (!trend || trend.length === 0) return "stable" as const;
    const ups = trend.filter(t => t === "up").length;
    const downs = trend.filter(t => t === "down").length;
    if (ups > downs) return "up" as const;
    if (downs > ups) return "down" as const;
    return "stable" as const;
  }, [trend]);
  
  // Calculate progress if target exists
  const progressPercent = target ? Math.min((value / target) * 100, 100) : null;
  
  // Progress bar color
  const progressColor = useMemo(() => {
    if (!target) return colors.primary[500];
    const percent = (value / target) * 100;
    if (percent >= 100) return colors.success[500];
    if (percent >= 80) return colors.primary[500];
    if (percent >= 50) return colors.warning[500];
    return colors.error[500];
  }, [value, target]);
  
  return (
    <div
      className={cn(
        "rounded-xl p-4 transition-all duration-200 hover:shadow-lg",
        className
      )}
      style={{
        backgroundColor: colors.neutral[0],
        boxShadow: shadows.sm,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          {icon && (
            <span className="text-lg" aria-hidden="true">
              {icon}
            </span>
          )}
          <span 
            className="text-sm font-medium"
            style={{ color: colors.neutral[600] }}
          >
            {title}
          </span>
        </div>
        <TrendIndicator direction={overallTrend} />
      </div>
      
      {/* Value */}
      <div className="flex items-end justify-between mb-3">
        <div>
          <span 
            className="text-3xl font-bold"
            style={{ color: colors.neutral[900] }}
          >
            {formatValue(value, format, unit)}
          </span>
          
          {changePercent !== null && (
            <span 
              className="ml-2 text-sm font-medium"
              style={{ 
                color: changePercent >= 0 ? colors.success[600] : colors.error[600] 
              }}
            >
              {changePercent >= 0 ? "+" : ""}{changePercent.toFixed(1)}%
            </span>
          )}
        </div>
        
        {trend && trend.length > 0 && (
          <Sparkline 
            trend={trend}
            color={colors.primary[500]}
          />
        )}
      </div>
      
      {/* Progress Bar (if target exists) */}
      {target !== undefined && (
        <div>
          <div className="flex justify-between text-xs mb-1" style={{ color: colors.neutral[500] }}>
            <span>Progress</span>
            <span>{progressPercent?.toFixed(0)}%</span>
          </div>
          <ProgressBar 
            value={value} 
            max={target} 
            color={progressColor}
          />
          <div className="flex justify-between text-xs mt-1" style={{ color: colors.neutral[400] }}>
            <span>0</span>
            <span>Target: {formatValue(target, format, unit)}</span>
          </div>
        </div>
      )}
      
      {/* Previous value reference */}
      {previousValue !== undefined && (
        <div 
          className="text-xs mt-2 pt-2 border-t"
          style={{ 
            color: colors.neutral[400],
            borderColor: colors.neutral[100],
          }}
        >
          Previous: {formatValue(previousValue, format, unit)}
        </div>
      )}
    </div>
  );
};

// ============================================
// METRICS DASHBOARD COMPONENT
// ============================================

export interface MetricsDashboardProps {
  metrics: MetricData[];
  period?: string;
  className?: string;
}

export const MetricsDashboard = ({ metrics, period = "Today", className }: MetricsDashboardProps) => {
  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 
          className="text-lg font-semibold"
          style={{ color: colors.neutral[900] }}
        >
          Key Metrics
        </h2>
        <span 
          className="text-sm px-3 py-1 rounded-full"
          style={{ 
            backgroundColor: colors.primary[50],
            color: colors.primary[700],
          }}
        >
          {period}
        </span>
      </div>
      
      {/* KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric) => (
          <KpiCard
            key={metric.label}
            title={metric.label}
            metric={metric}
          />
        ))}
      </div>
    </div>
  );
};

// ============================================
// EXAMPLE USAGE
// ============================================

/**
 * Example data for testing the dashboard
 */
export const exampleMetrics: MetricData[] = [
  {
    label: "Bookings",
    value: 3,
    previousValue: 2,
    target: 3,
    trend: ["up", "up", "down", "up", "up", "down", "up"],
  },
  {
    label: "Reply Rate",
    value: 12.5,
    previousValue: 10.2,
    target: 10,
    unit: "%",
    format: "percent",
    trend: ["up", "up", "up", "up", "down", "up", "up"],
  },
  {
    label: "Conversations",
    value: 156,
    previousValue: 142,
    trend: ["up", "up", "up", "up", "up", "down", "up"],
  },
  {
    label: "Opt-out Rate",
    value: 2.1,
    previousValue: 3.5,
    target: 3,
    unit: "%",
    format: "percent",
    trend: ["down", "down", "down", "down", "down", "down", "down"],
  },
];

export default MetricsDashboard;
