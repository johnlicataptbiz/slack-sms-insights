import type { App } from '@slack/bolt';
import { appHomeOpenedCallback } from './app-home-opened.js';
import { appMentionCallback } from './app-mention.js';

const register = (app: App) => {
  app.event('app_mention', appMentionCallback);
  app.event('app_home_opened', appHomeOpenedCallback);
};

export default { register };
