export class ConfigService {
  static get mondayApiKey(): string {
    return process.env.MONDAY_API_KEY || '';
  }

  static get slackBotToken(): string {
    return process.env.SLACK_BOT_TOKEN || '';
  }

  static get hubspotApiKey(): string {
    return process.env.HUBSPOT_API_KEY || '';
  }

  static get databaseUrl(): string {
    return process.env.DATABASE_URL || '';
  }

  // Add other configs as needed
}