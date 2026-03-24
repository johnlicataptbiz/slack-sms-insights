const DEFAULT_PRODUCTION_REPORT_CHANNEL_ID = "C09ULGH1BEC";
const SMS_INSIGHTS_BOT_USER_ID = "U0AEZGJA3BL";
const REPORT_TIMEZONE = "America/Chicago";
const CHANNEL_ID_PATTERN = /^[CGD][A-Z0-9]+$/;

const parseBoolean = (value: string | undefined): boolean => {
  return value?.trim().toLowerCase() === "true";
};

const getConfiguredChannelId = (): string => {
  return Deno.env.get("SMS_REPORT_CHANNEL_ID")?.trim() || "";
};

const getProductionChannelId = (): string => {
  return Deno.env.get("SMS_REPORT_PRODUCTION_CHANNEL_ID")?.trim() ||
    DEFAULT_PRODUCTION_REPORT_CHANNEL_ID;
};

const shouldUseProductionChannel = (): boolean => {
  return parseBoolean(Deno.env.get("SMS_REPORT_USE_PRODUCTION_CHANNEL"));
};

const resolveReportChannelId = (): string => {
  const configuredChannelId = getConfiguredChannelId();
  if (configuredChannelId.length > 0) {
    if (!CHANNEL_ID_PATTERN.test(configuredChannelId)) {
      throw new Error(
        `Invalid SMS_REPORT_CHANNEL_ID "${configuredChannelId}". Expected a Slack channel ID like C..., G..., or D...`,
      );
    }
    return configuredChannelId;
  }

  if (shouldUseProductionChannel()) {
    const productionChannelId = getProductionChannelId();
    if (!CHANNEL_ID_PATTERN.test(productionChannelId)) {
      throw new Error(
        `Invalid SMS_REPORT_PRODUCTION_CHANNEL_ID "${productionChannelId}". Expected a Slack channel ID like C..., G..., or D...`,
      );
    }
    return productionChannelId;
  }

  throw new Error(
    "SMS report channel is not configured. For local/dev testing, set SMS_REPORT_CHANNEL_ID to a non-production channel. To intentionally target production, set SMS_REPORT_USE_PRODUCTION_CHANNEL=true.",
  );
};

const REPORT_REQUEST_PROMPT = `<@${SMS_INSIGHTS_BOT_USER_ID}> daily report`;

export const getReportTriggerConfig = () => {
  return {
    channelId: resolveReportChannelId(),
    prompt: REPORT_REQUEST_PROMPT,
    timezone: REPORT_TIMEZONE,
  };
};
