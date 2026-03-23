import { DefineFunction, Schema, SlackFunction } from "deno-slack-sdk/mod.ts";

/**
 * Alert Monitor Function
 * Checks key metrics against configured thresholds and returns alert status
 */
export const AlertMonitorFunctionDefinition = DefineFunction({
  callback_id: "alert_monitor_function",
  title: "SMS Insights Alert Monitor",
  description: "Monitor key metrics and detect alert conditions",
  source_file: "functions/alert-monitor-function.ts",
  input_parameters: {
    properties: {
      check_type: {
        type: Schema.types.string,
        description: "Type of check: workload, sla, conversion, or health",
      },
      threshold_percent: {
        type: Schema.types.number,
        description: "Alert threshold as percentage (0-100)",
      },
      webhook_url: {
        type: Schema.types.string,
        description: "Backend webhook URL for metrics fetch",
      },
    },
    required: ["check_type", "webhook_url"],
  },
  output_parameters: {
    properties: {
      alert_triggered: {
        type: Schema.types.boolean,
        description: "Whether an alert condition was detected",
      },
      metric_value: {
        type: Schema.types.number,
        description: "Current metric value",
      },
      alert_message: {
        type: Schema.types.string,
        description: "Human-readable alert message",
      },
      severity: {
        type: Schema.types.string,
        description: "Alert severity: critical, warning, or info",
      },
    },
    required: ["alert_triggered", "alert_message"],
  },
});

export default SlackFunction(
  AlertMonitorFunctionDefinition,
  async ({ inputs }) => {
    const { check_type, threshold_percent, webhook_url } = inputs as Record<
      string,
      unknown
    >;

    try {
      // Fetch current metrics from backend
      const response = await fetch(
        `${webhook_url}/api/v2/reports/metrics?range=1d`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        },
      );

      if (!response.ok) {
        throw new Error(`Backend returned ${response.status}`);
      }

      const data = (await response.json()) as Record<string, unknown>;

      // Evaluate based on check type
      let metricValue = 0;
      let alertTriggered = false;
      let severity = "info";
      let alertMessage = "";

      const summary = data.data as Record<string, unknown> | undefined || {};

      switch (check_type) {
        case "workload": {
          const overview = summary.overview as Record<
            string,
            unknown
          > | undefined || {};
          metricValue = overview.overdueWorkItems as number | 0;
          alertTriggered = metricValue > (threshold_percent || 5);
          severity = alertTriggered ? "critical" : "info";
          alertMessage = alertTriggered
            ? `⚠️ ALERT: ${metricValue} overdue work items! Team needs immediate attention.`
            : `✅ Workload healthy: ${metricValue} overdue items (threshold: ${threshold_percent})`;
          break;
        }
        case "sla": {
          const pipeline = summary.pipelineVelocity as Record<
            string,
            unknown
          > | undefined || {};
          metricValue = (pipeline.avgFirstResponseMinutes as number | 0) ||
            0;
          const slaMinutes = threshold_percent || 120;
          alertTriggered = metricValue > slaMinutes;
          severity = alertTriggered ? "warning" : "info";
          alertMessage = alertTriggered
            ? `⏱️ SLA BREACH: Avg response time is ${metricValue} min (SLA: ${slaMinutes} min)`
            : `✅ SLA compliant: Avg response ${metricValue} min (SLA: ${slaMinutes} min)`;
          break;
        }
        case "conversion": {
          const booked = summary.bookedCallsSummary as Record<
            string,
            unknown
          > | undefined || {};
          const total = booked.total as number | 0;
          metricValue = total;
          alertTriggered = metricValue < (threshold_percent || 5);
          severity = alertTriggered ? "warning" : "info";
          alertMessage = alertTriggered
            ? `📉 CONVERSION ALERT: Only ${metricValue} booked calls today`
            : `✅ Conversion healthy: ${metricValue} booked calls`;
          break;
        }
        case "health": {
          const attribution = summary.attributionSummary as Record<
            string,
            unknown
          > | undefined || {};
          metricValue = attribution.unresolvedAttributions as number | 0;
          alertTriggered = metricValue > (threshold_percent || 20);
          severity = alertTriggered ? "warning" : "info";
          alertMessage = alertTriggered
            ? `🔧 SYSTEM ALERT: ${metricValue} unresolved attributions pending`
            : `✅ System healthy: ${metricValue} items pending`;
          break;
        }
        default:
          alertMessage = "Unknown check type";
      }

      return {
        outputs: {
          alert_triggered: alertTriggered,
          metric_value: metricValue,
          alert_message: alertMessage,
          severity,
        },
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      return {
        outputs: {
          alert_triggered: false,
          metric_value: 0,
          alert_message: `❌ Monitor check failed: ${errorMsg}`,
          severity: "critical",
        },
      };
    }
  },
);
