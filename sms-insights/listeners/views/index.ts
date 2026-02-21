import type { App } from '@slack/bolt';
import { generateAiResponse } from '../../services/ai-response.js';

const register = (app: App) => {
  app.view('sample_shortcut_view_submit', async ({ ack, body, client, logger, view }) => {
    try {
      await ack();
      const prompt =
        // biome-ignore lint/suspicious/noExplicitAny: Slack view state is dynamic.
        ((view.state.values as any).prompt_block?.prompt_input?.value as string | undefined)?.trim() || '';

      if (!prompt) {
        await client.chat.postMessage({
          channel: body.user.id,
          text: 'Shortcut request ignored: no question was provided.',
        });
        return;
      }

      const answer = await generateAiResponse(prompt);
      await client.chat.postMessage({
        channel: body.user.id,
        text: answer,
      });
    } catch (error) {
      logger.error(error);
    }
  });
};

export default { register };
