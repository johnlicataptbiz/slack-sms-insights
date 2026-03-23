import { DefineWorkflow, Schema } from "deno-slack-sdk/mod.ts";
import { ConversationalAiFunctionDefinition } from "../functions/conversational-ai-function.ts";

const ConversationalAiWorkflow = DefineWorkflow({
  callback_id: "conversational_ai_workflow",
  title: "Conversational SMS Analytics Query",
  description: "Process natural language questions about SMS analytics",
  input_parameters: {
    properties: {
      user_id: {
        type: Schema.slack.types.user_id,
      },
      query: {
        type: Schema.types.string,
      },
      channel_id: {
        type: Schema.slack.types.channel_id,
      },
      time_range: {
        type: Schema.types.string,
      },
    },
    required: ["user_id", "query", "channel_id"],
  },
});

const aiResult = ConversationalAiWorkflow.addStep(ConversationalAiFunctionDefinition, {
  user_id: ConversationalAiWorkflow.inputs.user_id,
  query: ConversationalAiWorkflow.inputs.query,
  channel_id: ConversationalAiWorkflow.inputs.channel_id,
  time_range: ConversationalAiWorkflow.inputs.time_range || "30d",
});

ConversationalAiWorkflow.addStep(Schema.slack.functions.SendMessage, {
  channel_id: ConversationalAiWorkflow.inputs.channel_id,
  message: aiResult.outputs.response,
});

export default ConversationalAiWorkflow;
