import type { App } from '@slack/bolt';

const register = (app: App) => {
  app.shortcut('sample_shortcut_id', async ({ ack, client, logger, shortcut }) => {
    try {
      await ack();
      await client.views.open({
        trigger_id: shortcut.trigger_id,
        view: {
          type: 'modal',
          callback_id: 'sample_shortcut_view_submit',
          title: {
            type: 'plain_text',
            text: 'Ask SMS Insights',
          },
          submit: {
            type: 'plain_text',
            text: 'Run',
          },
          close: {
            type: 'plain_text',
            text: 'Cancel',
          },
          blocks: [
            {
              type: 'input',
              block_id: 'prompt_block',
              label: {
                type: 'plain_text',
                text: 'Question',
              },
              element: {
                type: 'plain_text_input',
                action_id: 'prompt_input',
                multiline: true,
                placeholder: {
                  type: 'plain_text',
                  text: 'Ask for a report summary or analysis',
                },
              },
            },
          ],
        },
      });
    } catch (error) {
      logger.error(error);
    }
  });
};

export default { register };
