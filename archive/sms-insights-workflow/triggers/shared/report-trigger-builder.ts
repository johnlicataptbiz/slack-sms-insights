import { Trigger } from "deno-slack-api/types.ts";
import DailySmsReportWorkflow from "../../workflows/daily_sms_report_workflow.ts";
import { getReportTriggerConfig } from "./report-config.ts";

type ScheduledTriggerArgs = {
  description: string;
  hour: number;
  name: string;
};

type WebhookTriggerArgs = {
  description: string;
  name: string;
};

const buildStartTime = (hour: number): Date => {
  const startTime = new Date();
  startTime.setHours(hour, 0, 0, 0);
  if (startTime.getTime() <= Date.now()) {
    startTime.setDate(startTime.getDate() + 1);
  }
  return startTime;
};

const buildWorkflowInputs = () => {
  const reportConfig = getReportTriggerConfig();

  return {
    channel_id: {
      value: reportConfig.channelId,
    },
    prompt: {
      value: reportConfig.prompt,
    },
  };
};

export const buildScheduledReportTrigger = ({
  description,
  hour,
  name,
}: ScheduledTriggerArgs): Trigger<typeof DailySmsReportWorkflow.definition> => {
  const reportConfig = getReportTriggerConfig();
  const startTime = buildStartTime(hour);

  return {
    type: "scheduled",
    name,
    description,
    workflow: `#/workflows/${DailySmsReportWorkflow.definition.callback_id}`,
    schedule: {
      start_time: startTime.toISOString(),
      timezone: reportConfig.timezone,
      frequency: {
        type: "hourly",
        repeats_every: 24,
      },
    },
    inputs: buildWorkflowInputs(),
  };
};

export const buildWebhookReportTrigger = ({
  description,
  name,
}: WebhookTriggerArgs): Trigger<typeof DailySmsReportWorkflow.definition> => {
  return {
    type: "webhook",
    name,
    description,
    workflow: `#/workflows/${DailySmsReportWorkflow.definition.callback_id}`,
    inputs: buildWorkflowInputs(),
  };
};
