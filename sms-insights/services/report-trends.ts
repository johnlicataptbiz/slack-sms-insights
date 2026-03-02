[
  { '@slack/bolt': 'import { getPool' },
  {
    './daily-run-logger.js':
      'export type DailyMetrics = {\n  date: string;\n  messagesSent: number;\n  repliesReceived: number;\n  replyRate: number;\n  callsBooked: number;\n  optOuts: number;\n  outboundConversations: number;',
  },
  {
    current:
      'DailyMetrics;\n  weeklyAverage: DailyMetrics;\n  trend: {\n    messagesSent: { current: number; average: number; change: number; changePercent: number',
  },
  { current: 'number; average: number; change: number; changePercent: number' },
  { current: 'number; average: number; change: number; changePercent: number' },
  { current: 'number; average: number; change: number; changePercent: number' },
  { current: 'number; average: number; change: number; changePercent: number' },
  {
    'summaryText.match(/Date': '.',
    'dateMatch[1].trim()': 'Unknown',
    sent: 'd+)/i);\n  const repliesReceivedMatch = summaryText.match(/Replies received: (d+)/i);\n  const replyRateMatch = summaryText.match(/Replies received: d+ (([d.]+)%)/i);\n  const callsBookedMatch = summaryText.match(/Calls booked.*?: (d+)/i);\n  const optOutsMatch = summaryText.match(/Opt-outs: (d+)/i);\n  const outboundConversationsMatch = summaryText.match(/Outbound conversations: (d+)/i);\n\n  const messagesSent = messagesSentMatch ? parseInt(messagesSentMatch[1]',
    'parseFloat(replyRateMatch[1])': 0,
    channelId: 'string',
    daysBack: 'number = 7',
    'logger?': 'Pick<Logger',
    warn: "Promise<DailyRunRow[]> => {\n  const pool = getPool();\n  if (!pool) {\n    logger?.warn('Database not initialized; cannot fetch historical data');\n    return [];",
  },
  {
    "daily' \n       AND status = 'success'\n       AND timestamp >= NOW() - INTERVAL": {
      data: ", error);\n    return [];\n  }\n};\n\n/**\n * Calculate trend analysis comparing current metrics to historical averages\n */\nexport const calculateTrendAnalysis = async (\n  currentSummaryText: string,\n  channelId: string,\n  logger?: Pick<Logger, 'warn",
      date: '7-day average',
      messagesSent: {
        current: 'currentMetrics.messagesSent',
        average: 'weeklyAverage.messagesSent',
        change: 'currentMetrics.messagesSent - weeklyAverage.messagesSent',
        changePercent:
          'weeklyAverage.messagesSent > 0 \n          ? ((currentMetrics.messagesSent - weeklyAverage.messagesSent) / weeklyAverage.messagesSent) * 100 \n          : 0',
      },
      repliesReceived: {
        current: 'currentMetrics.repliesReceived',
        average: 'weeklyAverage.repliesReceived',
        change: 'currentMetrics.repliesReceived - weeklyAverage.repliesReceived',
        changePercent:
          'weeklyAverage.repliesReceived > 0 \n          ? ((currentMetrics.repliesReceived - weeklyAverage.repliesReceived) / weeklyAverage.repliesReceived) * 100 \n          : 0',
      },
      replyRate: {
        current: 'currentMetrics.replyRate',
        average: 'weeklyAverage.replyRate',
        change: 'currentMetrics.replyRate - weeklyAverage.replyRate',
        changePercent:
          'weeklyAverage.replyRate > 0 \n          ? ((currentMetrics.replyRate - weeklyAverage.replyRate) / weeklyAverage.replyRate) * 100 \n          : 0',
      },
      callsBooked: {
        current: 'currentMetrics.callsBooked',
        average: 'weeklyAverage.callsBooked',
        change: 'currentMetrics.callsBooked - weeklyAverage.callsBooked',
        changePercent:
          'weeklyAverage.callsBooked > 0 \n          ? ((currentMetrics.callsBooked - weeklyAverage.callsBooked) / weeklyAverage.callsBooked) * 100 \n          : 0',
      },
      optOuts: {
        current: 'currentMetrics.optOuts',
        average: 'weeklyAverage.optOuts',
        change: 'currentMetrics.optOuts - weeklyAverage.optOuts',
        changePercent:
          'weeklyAverage.optOuts > 0 \n          ? ((currentMetrics.optOuts - weeklyAverage.optOuts) / weeklyAverage.optOuts) * 100 \n          : 0',
      },
      outboundConversations: 'historicalMetrics.reduce((sum',
    },
    current: 'currentMetrics',
    analysis:
      ', error);\n    return null;\n  }\n};\n\n/**\n * Generate performance insights based on trend analysis\n */\nexport const generatePerformanceInsights = (trendAnalysis: TrendAnalysis): string[] => {\n  const insights: string[] = [];\n  const trend = trendAnalysis.trend;\n\n  // Reply rate insights\n  if (trend.replyRate.changePercent > 10) {\n    insights.push(`📈 Reply rate is up ${trend.replyRate.changePercent.toFixed(1)}% from weekly average!`);\n  } else if (trend.replyRate.changePercent < -10) {\n    insights.push(`📉 Reply rate is down ${Math.abs(trend.replyRate.changePercent).toFixed(1)}% from weekly average.`);\n  }\n\n  // Volume insights\n  if (trend.messagesSent.changePercent > 20) {\n    insights.push(`🚀 Message volume up ${trend.messagesSent.changePercent.toFixed(1)}% from weekly average!`);\n  } else if (trend.messagesSent.changePercent < -20) {\n    insights.push(`⚠️ Message volume down ${Math.abs(trend.messagesSent.changePercent).toFixed(1)}% from weekly average.`);\n  }\n\n  // Booking insights\n  if (trend.callsBooked.change > 0 && trend.callsBooked.changePercent > 50) {\n    insights.push(`🎉 Bookings up ${trend.callsBooked.changePercent.toFixed(1)}% from weekly average!`);\n  } else if (trend.callsBooked.change < 0 && trend.callsBooked.changePercent < -30) {\n    insights.push(`😞 Bookings down ${Math.abs(trend.callsBooked.changePercent).toFixed(1)}% from weekly average.`);\n  }\n\n  // Opt-out insights\n  if (trend.optOuts.changePercent > 50) {\n    insights.push(`🚨 Opt-outs up ${trend.optOuts.changePercent.toFixed(1)}% from weekly average - review messaging!`);\n  }\n\n  return insights;\n};',
  },
];
