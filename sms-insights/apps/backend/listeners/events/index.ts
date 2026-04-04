import type { App } from '@slack/bolt';
import { appHomeOpenedCallback } from './app-home-opened.js';
import { appMentionCallback } from './app-mention.js';
import { registerReactionListeners } from './reactions.js';

const register = (app: App) => {
  app.event('app_mention', appMentionCallback);
  app.event('app_home_opened', appHomeOpenedCallback);

  registerReactionListeners(app);
};

export default { register };
