import type { App } from '@slack/bolt';
import { sampleActionCallback } from './sample-action.js';

const register = (app: App) => {
  app.action('sample_action_id', sampleActionCallback);
  // Acknowledge the HubSpot button click (URL buttons still fire actions)
  app.action('hubspot_open_contact', async ({ ack }) => {
    await ack();
  });
};

export default { register };
