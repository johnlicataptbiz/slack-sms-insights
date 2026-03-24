import { Trigger } from "deno-slack-api/types.ts";
import DailySmsReportWorkflow from "../workflows/daily_sms_report_workflow.ts";
import { buildScheduledReportTrigger } from "./shared/report-trigger-builder.ts";

const trigger: Trigger<typeof DailySmsReportWorkflow.definition> =
  buildScheduledReportTrigger({
    name: "Daily SMS Insights Report (4:00 PM CT)",
    description: "Requests the daily SMS checklist report from SMS Insights.",
    hour: 16,
  });

export default trigger;
