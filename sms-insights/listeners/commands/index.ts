import type { App } from '@slack/bolt';
import { sampleCommandCallback } from './sample-command.js';

const register = (app: App) => {
  app.command('/ask', sampleCommandCallback);
};

export default { register };
