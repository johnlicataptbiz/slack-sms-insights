import type { App } from '@slack/bolt';
import { sampleMessageCallback } from './sample-message.js';

const register = (app: App) => {
  app.message(sampleMessageCallback);
};

export default { register };
