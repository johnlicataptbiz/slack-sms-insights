import { Trigger } from "deno-slack-sdk/types.ts";
import { TriggerContextData, TriggerTypes } from "deno-slack-sdk/mod.ts";
import ProactiveAlertsWorkflow from "../workflows/proactive-alerts-workflow.ts";

const proactiveAlertsTrigger: Trigger<typeof ProactiveAlertsWorkflow.definition> = {
  type: TriggerTypes.Scheduled,
  name: "Proactive SMS Analytics Alerts",
  description: "Daily alert monitor for SMS insights metrics",
  workflow: `#/workflows/${ProactiveAlertsWorkflow.definition.callback_id}`,
  inputs: {
    channel_id: {
      value: "{{ data.channel_id }}",
    },
    webhook_url: {
      value: "{{ data.webhook_url }}",
    },
  },
  schedule: {
    start_time: new Date(Date.now() + 60000),
    frequency: {
      repeats_every: 1,
      unit: "days",
      repeats_every_minute: 0,
    },
  },
};

export default proactiveAlertsTrigger;
