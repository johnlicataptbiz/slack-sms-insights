import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

/**
 * Conversational AI Function
 * Processes natural language queries about SMS analytics and returns insights
 * Leverages backend API to fetch and analyze performance data
 */
export const ConversationalAiFunctionDefinition = DefineFunction({
  callback_id: "conversational_ai_function",
  title: "SMS Insights AI Assistant",
  description: "Query SMS analytics using natural language",
  source_file: "functions/conversational-ai-function.ts",
  input_parameters: {
    properties: {
      user_id: {
        type: Schema.slack.types.user_id,
        description: "User making the query",
      },
      query: {
        type: Schema.types.string,
        description: "Natural language question about SMS metrics",
      },
      time_range: {
        type: Schema.types.string,
        description: "Time range: '7d', '30d', '90d', or 'today'",
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
        description: "Channel to post results to",
      },
    },
    required: ["user_id", "query", "channel_id"],
  },
  output_parameters: {
    properties: {
      response: {
        type: Schema.types.string,
        description: "AI-generated response with analytics insights",
      },
      query_type: {
        type: Schema.types.string,
        description: "Type of query: performance, workload, conversion, sla, or general",
      },
      success: {
        type: Schema.types.boolean,
        description: "Whether the query was processed successfully",
      },
    },
    required: ["response", "success"],
  },
});

interface AnalyticsQueryParams {
  from?: string;
  to?: string;
  range?: string;
  tz?: string;
  breakdown?: string;
}

interface QueryIntent {
  type: "performance" | "workload" | "conversion" | "sla" | "general";
  endpoint: string;
  params: AnalyticsQueryParams;
}

const classifyQuery = (query: string): QueryIntent => {
  const lowerQuery = query.toLowerCase();

  // Detect performance/KPI queries
  if (
    lowerQuery.includes("conversion") ||
    lowerQuery.includes("booked") ||
    lowerQuery.includes("close rate") ||
    lowerQuery.includes("win rate")
  ) {
    return {
      type: "conversion",
      endpoint: "/api/v2/reports/sales-metrics",
      params: { range: "30d" },
    };
  }

  // Detect workload/resource queries
  if (
    lowerQuery.includes("workload") ||
    lowerQuery.includes("capacity") ||
    lowerQuery.includes("volume") ||
    lowerQuery.includes("conversations")
  ) {
    return {
      type: "workload",
      endpoint: "/api/v2/reports/metrics",
      params: { range: "30d" },
    };
  }

  // Detect SLA/response time queries
  if (
    lowerQuery.includes("response time") ||
    lowerQuery.includes("sla") ||
    lowerQuery.includes("delayed") ||
    lowerQuery.includes("latency") ||
    lowerQuery.includes("first response")
  ) {
    return {
      type: "sla",
      endpoint: "/api/v2/reports/metrics",
      params: { range: "30d" },
    };
  }

  // Detect team performance queries
  if (
    lowerQuery.includes("team") ||
    lowerQuery.includes("rep") ||
    lowerQuery.includes("individual") ||
    lowerQuery.includes("by person")
  ) {
    return {
      type: "performance",
      endpoint: "/api/v2/reports/sales-metrics",
      params: { range: "30d", breakdown: "by_rep" },
    };
  }

  return {
    type: "general",
    endpoint: "/api/v2/reports/metrics",
    params: { range: "30d" },
  };
};

const formatAnalyticsResponse = (
  queryType: string,
  data: Record<string, unknown>,
): string => {
  const now = new Date().toLocaleString();

  switch (queryType) {
    case "conversion":
      return formatConversionMetrics(data, now);
    case "workload":
      return formatWorkloadMetrics(data, now);
    case "sla":
      return formatSlaMetrics(data, now);
    case "performance":
      return formatPerformanceMetrics(data, now);
    default:
      return formatGeneralMetrics(data, now);
  }
};

const formatConversionMetrics = (data: Record<string, unknown>, now: string): string => {
  const summary = data.data as Record<string, unknown> || {};
  const bookedCalls = summary.bookedCallsSummary as Record<string, unknown> || {};
  const attribution = summary.attributionSummary as Record<string, unknown> || {};

  return (
    `📊 *Conversion Metrics Report* (as of ${now})\n\n` +
    `*Booked Calls:*\n` +
    `  • Total: ${bookedCalls.total || 0}\n` +
    `  • By Rep: Jack ${bookedCalls.jack || 0}, Brandon ${bookedCalls.brandon || 0}\n` +
    `  • Self-booked: ${bookedCalls.selfBooked || 0}\n\n` +
    `*Attribution Status:*\n` +
    `  • Total Calls to Process: ${attribution.unattributedCalls || 0}\n` +
    `  • Open Review Items: ${attribution.openReviewItems || 0}\n` +
    `  • Lagging Behind: ${attribution.isLagging ? "⚠️ Yes" : "✅ No"}\n\n` +
    `_Use conversational queries like "Show me conversion trends" for deeper analysis._`
  );
};

const formatWorkloadMetrics = (data: Record<string, unknown>, now: string): string => {
  const summary = data.data as Record<string, unknown> || {};
  const overview = summary.overview as Record<string, unknown> || {};

  return (
    `📈 *Team Workload Report* (as of ${now})\n\n` +
    `*Current Status:*\n` +
    `  • Open Work Items: ${overview.openWorkItems || 0}\n` +
    `  • Overdue Items: ${overview.overdueWorkItems || 0} ⚠️\n` +
    `  • Total Conversations Handled: ${overview.totalConversations || 0}\n\n` +
    `_Ask for "team capacity" or "by rep breakdown" for detailed workload distribution._`
  );
};

const formatSlaMetrics = (data: Record<string, unknown>, now: string): string => {
  const summary = data.data as Record<string, unknown> || {};
  const pipelineVelocity = summary.pipelineVelocity as Record<string, unknown>|| {};

  return (
    `⏱️ *SLA & Response Time Report* (as of ${now})\n\n` +
    `*Response Performance:*\n` +
    `  • Avg First Response: ${pipelineVelocity.avgFirstResponseMinutes || "N/A"} min\n` +
    `  • Avg Time to Qualified: ${pipelineVelocity.avgTimeToQualifiedMinutes || "N/A"} min\n` +
    `  • Avg Time to Close: ${pipelineVelocity.avgTimeToCloseWonMinutes || "N/A"} min\n\n` +
    `_Query "SLA compliance" or "response bottlenecks" for detailed analysis._`
  );
};

const formatPerformanceMetrics = (data: Record<string, unknown>, now: string): string => {
  const summary = data.data as Record<string, unknown> || {};
  const reps = (summary.reps as Record<string, unknown>[] | undefined) || [];

  let repStats = "*By Representative:*\n";
  reps.slice(0, 5).forEach((rep: Record<string, unknown>) => {
    repStats += `  • ${rep.repName || "Unknown"}: ${rep.conversationsHandled || 0} handled, ${rep.openWorkItems || 0} open\n`;
  });

  return (
    `👥 *Team Performance Report* (as of ${now})\n\n` +
    repStats +
    `\n_Ask for "top performers" or "workload balance" for deeper insights._`
  );
};

const formatGeneralMetrics = (data: Record<string, unknown>, now: string): string => {
  const meta = data.meta as Record<string, unknown> | undefined || {};
  return (
    `📱 *SMS Insights Report* (as of ${now})\n\n` +
    `*Available Data:*\n` +
    `  • Time Zone: ${meta.timeZone || "UTC"}\n` +
    `  • Time Range: Last 30 days\n\n` +
    `Try asking about:\n` +
    `  • "Show my conversion metrics"\n` +
    `  • "What's the team workload?"\n` +
    `  • "Are we meeting SLA targets?"\n` +
    `  • "Breakdown by representative"`
  );
};

export default SlackFunction(
  ConversationalAiFunctionDefinition,
  async ({ inputs, token, client }) => {
    try {
      const { query, channel_id, time_range = "30d" } = inputs;

      // Classify the query intent
      const intent = classifyQuery(query);

      // Call backend API (mocked URL pattern - adjust to match your environment)
      const backendUrl = Deno.env.get("SMS_INSIGHTS_API_URL") ||
        "http://localhost:3000";
      let response: Response;

      try {
        response = await fetch(
          `${backendUrl}${intent.endpoint}?range=${time_range}`,
          {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${token}`,
              "Content-Type": "application/json",
            },
          },
        );
      } catch (error) {
        // Fallback for local testing
        console.error("API call failed:", error);
        return {
          outputs: {
            response:
              `I'm unable to connect to the analytics backend right now. Try again in a moment.\n\n` +
              `Error: ${error instanceof Error ? error.message : String(error)}`,
            query_type: intent.type,
            success: false,
          },
        };
      }

      if (!response.ok) {
        throw new Error(
          `API returned ${response.status}: ${response.statusText}`,
        );
      }

      const analyticsData = await response.json() as Record<string, unknown>;

      // Format response based on query type
      const formattedResponse = formatAnalyticsResponse(intent.type, analyticsData);

      return {
        outputs: {
          response: formattedResponse,
          query_type: intent.type,
          success: true,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        outputs: {
          response: `I encountered an error processing your query: ${errorMsg}`,
          query_type: "general",
          success: false,
        },
      };
    }
  },
);
