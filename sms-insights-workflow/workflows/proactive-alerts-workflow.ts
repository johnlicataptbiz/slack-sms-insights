import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { AlertMonitorFunctionDefinition } from "../functions/alert-monitor-function.ts";

const ProactiveAlertsWorkflow = DefineWorkflow({
  callback_id: "proactive_alerts_workflow",
  title: "Proactive SMS Analytics Alerts",
  description: "Continuously monitor metrics and send alerts for anomalies",
  input_parameters: {
    properties: {
      channel_id: {
        type: Schema.slack.types.channel_id,
      },
      webhook_url: {
        type: Schema.types.string,
      },
    },
    required: ["channel_id", "webhook_url"],
  },
});

// Check workload (overdue items)
const workloadAlert = ProactiveAlertsWorkflow.addStep(AlertMonitorFunctionDefinition, {
  check_type: "workload",
  threshold_percent: 5,
  webhook_url: ProactiveAlertsWorkflow.inputs.webhook_url,
});

// Check SLA compliance (response time)
const slaAlert = ProactiveAlertsWorkflow.addStep(AlertMonitorFunctionDefinition, {
  check_type: "sla",
  threshold_percent: 120,
  webhook_url: ProactiveAlertsWorkflow.inputs.webhook_url,
});

// Check conversion metrics
const conversionAlert = ProactiveAlertsWorkflow.addStep(AlertMonitorFunctionDefinition, {
  check_type: "conversion",
  threshold_percent: 5,
  webhook_url: ProactiveAlertsWorkflow.inputs.webhook_url,
});

// Check system health (attribution backlog)
const healthAlert = ProactiveAlertsWorkflow.addStep(AlertMonitorFunctionDefinition, {
  check_type: "health",
  threshold_percent: 20,
  webhook_url: ProactiveAlertsWorkflow.inputs.webhook_url,
});

// Format summary message from all checks
const alertsSummary = `📊 *SMS Insights Daily Alert Summary*\n\n` +
  `*Workload Status:* ${workloadAlert.outputs.alert_message}\n` +
  `*SLA Status:* ${slaAlert.outputs.alert_message}\n` +
  `*Conversion Status:* ${conversionAlert.outputs.alert_message}\n` +
  `*System Health:* ${healthAlert.outputs.alert_message}\n\n` +
  `_Latest check: <!date^${Math.floor(Date.now() / 1000)}^{date_pretty} at {time}|Just now|>_`;

// Only send message if any alert was triggered, or send summary anyway
ProactiveAlertsWorkflow.addStep(Schema.slack.functions.SendMessage, {
  channel_id: ProactiveAlertsWorkflow.inputs.channel_id,
  message: alertsSummary,
});

export default ProactiveAlertsWorkflow;
