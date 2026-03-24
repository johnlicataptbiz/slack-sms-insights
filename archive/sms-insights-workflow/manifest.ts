import { Manifest } from "deno-slack-sdk/mod.ts";
import DailySmsReportWorkflow from "./workflows/daily_sms_report_workflow.ts";
import ConversationalAiWorkflow from "./workflows/conversational-ai-workflow.ts";
import ProactiveAlertsWorkflow from "./workflows/proactive-alerts-workflow.ts";

/**
 * The app manifest contains the app's configuration. This
 * file defines attributes like app name and description.
 * https://api.slack.com/automation/manifest
 */
export default Manifest({
  name: "sms-insights-scheduler",
  description:
    "SMS Insights Command Center - Analytics, AI Assistant, and Proactive Alerts",
  icon: "assets/default_new_app_icon.png",
  workflows: [DailySmsReportWorkflow, ConversationalAiWorkflow, ProactiveAlertsWorkflow],
  outgoingDomains: [],
  botScopes: ["commands", "chat:write", "chat:write.public", "reactions:read", "channels:history", "groups:history"],
});
