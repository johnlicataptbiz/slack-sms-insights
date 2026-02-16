import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";

const DailySmsReportWorkflow = DefineWorkflow({
  callback_id: "daily_sms_report_workflow",
  title: "Daily SMS Insights Report Request",
  description: "Requests daily SMS report in #alowaresmsupdates.",
  input_parameters: {
    properties: {
      channel_id: {
        type: Schema.slack.types.channel_id,
      },
      prompt: {
        type: Schema.types.string,
      },
    },
    required: ["channel_id", "prompt"],
  },
});

DailySmsReportWorkflow.addStep(Schema.slack.functions.SendMessage, {
  channel_id: DailySmsReportWorkflow.inputs.channel_id,
  message: DailySmsReportWorkflow.inputs.prompt,
});

export default DailySmsReportWorkflow;
