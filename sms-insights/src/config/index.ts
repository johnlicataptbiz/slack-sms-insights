import { z } from 'zod';

const configSchema = z.object({
  // Server configuration
  port: z.number().int().positive().default(3000),
  nodeEnv: z.enum(['development', 'production', 'test']).default('development'),
  host: z.string().default('0.0.0.0'),

  // Database configuration
  databaseUrl: z.string().url(),

  // Slack configuration
  slackBotToken: z.string().optional(),
  slackAppToken: z.string().optional(),
  slackSigningSecret: z.string().min(1),

  // Security configuration
  dashboardPassword: z.string().optional(),
  allowDummyAuthToken: z.boolean().default(false),
  streamTokenSecret: z.string().optional(),

  // Logging configuration
  logLevel: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Feature flags
  serveFrontendFromDisk: z.boolean().default(false),

  // External service URLs
  alowareApiUrl: z.string().url().optional(),
  mondayApiUrl: z.string().url().optional(),
  hubspotApiUrl: z.string().url().optional(),
});

export type Config = z.infer<typeof configSchema>;

function loadConfig(): Config {
  const config = {
    port: parseInt(process.env.PORT || '3000', 10),
    nodeEnv: (process.env.NODE_ENV || 'development') as 'development' | 'production' | 'test',
    host: process.env.HOST || '0.0.0.0',

    databaseUrl: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL || '',

    slackBotToken: process.env.SLACK_BOT_TOKEN,
    slackAppToken: process.env.SLACK_APP_TOKEN,
    slackSigningSecret: process.env.SLACK_SIGNING_SECRET || 'dummy-secret',

    dashboardPassword: process.env.DASHBOARD_PASSWORD,
    allowDummyAuthToken: (process.env.ALLOW_DUMMY_AUTH_TOKEN || '').toLowerCase() === 'true',
    streamTokenSecret: process.env.STREAM_TOKEN_SECRET,

    logLevel: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',

    serveFrontendFromDisk: (process.env.SERVE_FRONTEND_FROM_DISK || '').toLowerCase() === 'true',

    alowareApiUrl: process.env.ALOWARE_API_URL,
    mondayApiUrl: process.env.MONDAY_API_URL,
    hubspotApiUrl: process.env.HUBSPOT_API_URL,
  };

  return configSchema.parse(config);
}

export const config = loadConfig();

// Environment helpers
export const isProduction = (): boolean => config.nodeEnv === 'production';
export const isDevelopment = (): boolean => config.nodeEnv === 'development';
export const isTest = (): boolean => config.nodeEnv === 'test';

// Validation helpers
export function validateProductionConfig(): void {
  if (isProduction()) {
    if (!config.databaseUrl) {
      throw new Error('DATABASE_URL is required in production');
    }
    if (!config.dashboardPassword) {
      throw new Error('DASHBOARD_PASSWORD is required in production');
    }
    if (config.allowDummyAuthToken) {
      throw new Error('ALLOW_DUMMY_AUTH_TOKEN cannot be enabled in production');
    }
  }
}