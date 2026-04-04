# Slack Command Center - Next Generation Reporting

## Executive Summary

Transform Slack messaging from raw metrics dumps into a **leadership decision-making command center** that answers: *"Are we winning or losing, and what should we do about it?"*

---

## Current State Analysis

### What's Working
- `daily-report-summary.ts` - Parses Aloware snapshots into structured data
- `report-poster.ts` - Posts Block Kit with interactive buttons
- `scoreboard-poster.ts` - Weekly leaderboard with ranking
- Action buttons: Full Report, Yesterday, Scoreboard, Refresh, Dashboard

### What's Missing (The Gap)
| Current | Leadership Needs |
|---------|------------------|
| "Bookings: 3" | "✅ 3 bookings (100% of daily goal)" |
| "Reply rate: 12%" | "📈 12% reply rate (+3pts vs last week)" |
| "Opt-outs: 2" | "⚠️ 2 opt-outs (67% of daily threshold)" |
| Raw numbers | Trajectory vs targets |

---

## Target System Architecture

### Core Principles
1. **Goal-Centric** - Every metric compared to a target
2. **Trend-Aware** - Show direction, not just snapshot
3. **Action-Oriented** - Highlight what needs attention
4. **Executive-Ready** - Readable in 30 seconds

---

## Phase 1: Goal-Aware Reports (Foundation)

### 1.1 Define Goals Config
```typescript
// sms-insights/services/goal-engine.ts
const DAILY_GOALS = {
  bookings: { target: 3, warnThreshold: 0.8 },      // 3 bookings/day
  replyRate: { target: 10, unit: '%', warnThreshold: 0.8 },
  optOutRate: { target: 3, unit: '%', max: true },   // Max threshold
};

const WEEKLY_GOALS = {
  bookings: { target: 15, warnThreshold: 0.7 },
  replyRate: { target: 10, unit: '%', warnThreshold: 0.8 },
};

const MONTHLY_GOALS = {
  bookings: { target: 60, warnThreshold: 0.8 },
};
```

### 1.2 Progress Indicators
```typescript
// Emoji-based status
const getStatusEmoji = (current: number, target: GoalConfig): '🟢' | '🟡' | '🔴' => {
  const ratio = current / target.target;
  if (target.max) return ratio <= 1 ? '🟢' : ratio <= 1.5 ? '🟡' : '🔴';
  return ratio >= 1 ? '🟢' : ratio >= target.warnThreshold ? '🟡' : '🔴';
};

// Progress bar using blocks
const buildProgressBar = (current: number, target: number, width = 10): string => {
  const filled = Math.round((Math.min(current, target) / target) * width);
  return '▓'.repeat(filled) + '░'.repeat(width - filled);
};
```

### 1.3 Enhanced Block Kit Structure
```typescript
// New report layout
const buildExecutiveSummaryBlocks = (data: ReportData): SlackBlock[] => [
  // Header with date and overall health
  {
    type: 'header',
    text: {
      type: 'plain_text',
      text: '📊 PT Biz SMS - Executive Summary | Mar 23',
      emoji: true,
    },
  },
  
  // Status row: Overall health + trend
  {
    type: 'section',
    fields: [
      { type: 'mrkdwn', text: '*Health:* 🟢 On Track' },
      { type: 'mrkdwn', text: '*Trend:* 📈 Best week in 30 days' },
    ],
  },
  
  // Goal comparison grid
  {
    type: 'section',
    text: {
      type: 'mrkdwn',
      text: `
*DAILY GOALS*
├─ Bookings  ▓▓▓▓▓▓▓▓▓▓ 3/3  🟢 *100%*
├─ Reply %  ▓▓▓▓▓▓▓░░░ 9.2%  🟡 *92%* 
└─ Opt-Outs  ▓▓▓░░░░░░░ 2     🟢 *66% of max*
      `,
    },
  },
  
  // Divider + Action buttons
  { type: 'divider' },
  // ... action buttons
];
```

---

## Phase 2: Trend Intelligence

### 2.1 Trend Calculation
```typescript
// sms-insights/services/trend-engine.ts
interface TrendData {
  direction: 'up' | 'down' | 'stable';
  changeAbsolute: number;
  changePercent: number;
  sparkline: string;  // e.g., "▄▅▆▇█▇▆▅"
}

const calculateTrend = (
  current: number,
  history: number[],
  window: number = 7
): TrendData => {
  const recent = history.slice(-window);
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  
  const direction = current > avg * 1.1 ? 'up' 
                  : current < avg * 0.9 ? 'down' 
                  : 'stable';
  
  const changePercent = avg > 0 
    ? ((current - avg) / avg) * 100 
    : 0;
  
  return {
    direction,
    changeAbsolute: current - avg,
    changePercent,
    sparkline: buildSparkline(recent),
  };
};
```

### 2.2 Trend-Enhanced Report Block
```typescript
{
  type: 'section',
  fields: [
    {
      type: 'mrkdwn',
      text: `
*Bookings Today*
*3*  🚀

*vs. Daily Goal:* 100%
*vs. 7-day avg:* +50% ↑
*Sparkline:* ▄▅▆▇█▇▆▅
      `,
    },
  ],
}
```

---

## Phase 3: Anomaly Detection & Alerts

### 3.1 Anomaly Rules Engine
```typescript
// sms-insights/services/anomaly-detector.ts
interface Anomaly {
  type: 'warning' | 'critical' | 'opportunity';
  metric: string;
  message: string;
  recommendedAction?: string;
}

const anomalyRules: AnomalyRule[] = [
  {
    check: (data) => data.bookings < data.goals.bookings.target * 0.5,
    type: 'critical',
    message: 'Bookings at 50% of daily goal',
    action: 'Review active sequences and outreach volume',
  },
  {
    check: (data) => data.optOutRate > data.goals.optOutRate.target * 1.5,
    type: 'warning',
    message: 'Opt-out rate elevated',
    action: 'Review message copy and targeting',
  },
  {
    check: (data) => data.replyRate > 15 && data.bookings < 2,
    type: 'opportunity',
    message: 'High engagement, low conversion',
    action: 'Focus on booking conversations',
  },
];
```

### 3.2 Alert Section in Report
```typescript
// Append anomalies to report
const buildAlertBlocks = (anomalies: Anomaly[]): SlackBlock[] => {
  if (anomalies.length === 0) return [];
  
  return [
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*⚠️ Attention Required (${anomalies.length})*`,
      },
    },
    ...anomalies.map((a) => ({
      type: 'section' as const,
      text: {
        type: 'mrkdwn' as const,
        text: `${a.type === 'critical' ? '🔴' : '🟡'} *${a.message}*\n_→ ${a.action}_`,
      },
    })),
  ];
};
```

---

## Phase 4: Rich Interactive Elements

### 4.1 Drill-Down via Message Threads
```
Main Report (in channel)
  └─ 📊 View Sequence Breakdown (thread)
  └─ 👥 View Rep Performance (thread)
  └─ 📈 View 30-Day Trend (opens modal)
```

### 4.2 Modal Deep Dives
```typescript
// Interactive modal for drill-down
app.view('drilldown_modal', async ({ ack, view }) => {
  const selected = view.state.values.metric.selected_option.value;
  // Build detailed modal based on selection
});
```

### 4.3 Contextual Quick Actions
```typescript
// Action buttons with context-aware options
const buildContextualActions = (data: ReportData): Block[] => [
  {
    type: 'actions',
    elements: [
      {
        type: 'button',
        text: { type: 'plain_text', text: '🎯 Drill Down', emoji: true },
        action_id: 'drill_down',
        value: JSON.stringify({ defaultMetric: data.worstPerforming }),
      },
      {
        type: 'button',
        text: { type: 'plain_text', text: '📋 Export PDF', emoji: true },
        action_id: 'export_report',
      },
      {
        type: 'overflow',
        options: [
          { text: 'Share to #leadership', value: 'share_leadership' },
          { text: 'Schedule Recap', value: 'schedule_recap' },
        ],
      },
    ],
  },
];
```

---

## Phase 5: Scheduled Intelligence Reports

### 5.1 Report Cadence
| Report | Time | Audience | Content |
|--------|------|----------|---------|
| Morning Pulse | 7:00 AM CT | Setters | Yesterday + Today's targets |
| Midday Check | 12:00 PM CT | Managers | Progress vs goals |
| EOD Summary | 6:00 PM CT | All | Full daily report |
| Weekly Deep | Monday 8 AM | Leadership | Trend analysis + recommendations |

### 5.2 Smart Scheduling
```typescript
// Don't spam if nothing noteworthy
const shouldSendReport = (data: ReportData): boolean => {
  const hasAnomalies = detectAnomalies(data).length > 0;
  const isSignificantChange = Math.abs(data.trend) > 20;
  const isEndOfPeriod = isEndOfDay() || isEndOfWeek();
  
  return hasAnomalies || isSignificantChange || isEndOfPeriod;
};
```

---

## Technical Implementation Plan

### File Structure Changes
```
sms-insights/services/
├── goal-engine.ts           # NEW: Goal definitions & progress
├── trend-engine.ts          # NEW: Trend calculation & sparklines
├── anomaly-detector.ts      # NEW: Anomaly rules engine
├── report-pipeline.ts      # NEW: Orchestrates data → blocks
├── report-poster.ts        # UPDATE: Use new pipeline
├── executive-blocks.ts      # NEW: Block Kit builders
└── scoreboard-poster.ts     # UPDATE: Add goal comparison
```

### Key Types
```typescript
interface GoalConfig {
  target: number;
  unit: string;
  warnThreshold: number;  // 0.0 - 1.0
  max?: boolean;          // For "don't exceed" metrics
}

interface MetricSnapshot {
  name: string;
  value: number;
  unit: string;
  goal: GoalConfig;
  progress: number;        // 0-100+
  status: 'on_track' | 'warning' | 'critical';
  trend?: TrendData;
}

interface ExecutiveReport {
  date: string;
  overallStatus: 'green' | 'yellow' | 'red';
  metrics: MetricSnapshot[];
  anomalies: Anomaly[];
  topPerformers: string[];
  recommendedActions: string[];
  generatedAt: Date;
}
```

---

## Migration Path

### Week 1: Foundation
- [ ] Extract goals to configurable structure
- [ ] Build goal-engine.ts with progress calculation
- [ ] Update daily-report-summary.ts to include goal data
- [ ] Add progress bars to existing Block Kit

### Week 2: Intelligence
- [ ] Build trend-engine.ts with sparkline generation
- [ ] Add anomaly-detector.ts with initial rules
- [ ] Create executive-blocks.ts for new layouts
- [ ] Wire up report-pipeline.ts orchestration

### Week 3: Polish
- [ ] Implement contextual action buttons
- [ ] Add drill-down modal handlers
- [ ] Build smart scheduling logic
- [ ] Test with real data

### Week 4: Deploy
- [ ] A/B test new vs old format
- [ ] Gather feedback
- [ ] Iterate on messaging

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Report open rate | > 80% |
| Action taken from report | > 30% |
| Time to decision | < 5 min |
| Leadership satisfaction | > 4/5 |

---

## Example Output

### Before (Current)
```
📊 Daily SMS Performance Snapshot
Messages sent: 847
Replies received: 89 (10.5%)
Calls booked: 3
Opt-outs: 2
```

### After (New)
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 PT BIZ SMS | March 23, 2026
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Status: 🟢 ON TRACK   |   Trend: 📈 Best week in 30 days

DAILY GOALS ────────────────────────────
├─ 🚀 Bookings    ▓▓▓▓▓▓▓▓▓▓  3/3  100%  🟢
├─ 💬 Reply Rate  ▓▓▓▓▓▓▓▓░░  9.2%  92%  🟡
└─ ⚠️ Opt-Outs    ▓▓▓░░░░░░░  2     66%  🟢

SEQUENCE PERFORMANCE ────────────────────
├─ 🔥 Lead Magnet Pro    234 sent • 12.4% reply
├─ 📈 Free Consultation  189 sent • 11.2% reply  
└─ ⚡ Quick Consult      98 sent •  9.8% reply

⚠️ ATTENTION ────────────────────────────
🟡 Booking pace ahead of schedule
   → On track for 18 bookings this week

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
[Full Report] [Drill Down] [Share] [Export]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Block Kit limits (50 blocks) | Paginate or use app_home |
| API rate limits | Batch updates, smart scheduling |
| Information overload | Progressive disclosure |
| Performance regression | A/B testing, gradual rollout |
