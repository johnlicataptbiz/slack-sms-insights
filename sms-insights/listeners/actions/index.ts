import type { App } from '@slack/bolt';

const register = (app: App) => {
  // Acknowledge the HubSpot button click (URL buttons still fire actions)
  app.action('hubspot_open_contact', async ({ ack }) => {
    await ack();
  });
};

export default { register };
