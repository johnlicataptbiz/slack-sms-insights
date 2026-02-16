import { Trigger } from "deno-slack-api/types.ts";
import DailySmsReportWorkflow from "../workflows/daily_sms_report_workflow.ts";
import { buildWebhookReportTrigger } from "./shared/report-trigger-builder.ts";

const trigger: Trigger<typeof DailySmsReportWorkflow.definition> =
  buildWebhookReportTrigger({
    name: "Temp Verify Channel Reply",
    description: "Temporary trigger to verify daily report request posting.",
  });

export default trigger;
