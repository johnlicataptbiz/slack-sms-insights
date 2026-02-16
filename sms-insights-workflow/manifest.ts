import { Manifest } from "deno-slack-sdk/mod.ts";
import DailySmsReportWorkflow from "./workflows/daily_sms_report_workflow.ts";

/**
 * The app manifest contains the app's configuration. This
 * file defines attributes like app name and description.
 * https://api.slack.com/automation/manifest
 */
export default Manifest({
  name: "sms-insights-scheduler",
  description:
    "Schedules a daily request for SMS Insights analytics in #alowaresmsupdates",
  icon: "assets/default_new_app_icon.png",
  workflows: [DailySmsReportWorkflow],
  outgoingDomains: [],
  botScopes: ["commands", "chat:write", "chat:write.public"],
});
