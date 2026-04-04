/**
 * Derek Autonomous Behavior Service
 *
 * Manages Derek's autonomous posting schedule with smart safeguards.
 * - Respects rate limits (30 min minimum, 5 posts/day max)
 * - Only posts when confidence threshold is met
 * - Refreshes user context periodically for real roasting
 */

import type { App } from "@slack/bolt";
import { logger } from "./logger.js";
import { postDerekComment } from "./bot-personality.js";
import { refreshTeamContext } from "./message-context.js";

const DEREK_ENABLED =
  (process.env.DEREK_AUTONOMOUS_ENABLED ?? "true").toLowerCase() === "true";
const DEREK_POST_INTERVAL_MINUTES = parseInt(
  process.env.DEREK_AUTONOMOUS_INTERVAL_MIN || "45",
  10,
);
const DEREK_CONTEXT_REFRESH_INTERVAL_HOURS = parseInt(
  process.env.DEREK_CONTEXT_REFRESH_HOURS || "1",
  10,
);

// Target channels where Derek posts autonomously
const DEREK_TARGET_CHANNELS = (
  process.env.DEREK_TARGET_CHANNELS || "C09ULGH1BEC"
).split(",");

// Track Derek's autonomous scheduler
let derekAutonomousIntervalId: ReturnType<typeof setInterval> | null = null;
let lastDerekContextRefresh = 0;

/**
 * Start Derek's autonomous posting schedule
 * Posts periodically with smart safeguards ensuring perfect timing
 */
export const startDerekAutonomous = async (app: App): Promise<void> => {
  if (!DEREK_ENABLED) {
    logger.app.debug("[derek] Autonomous mode disabled");
    return;
  }

  logger.app.info(
    `[derek] Autonomous mode started - posting every ${DEREK_POST_INTERVAL_MINUTES}min to ${DEREK_TARGET_CHANNELS.length} channel(s)`,
  );

  // Initial refresh of team context for roasting accuracy
  try {
    await refreshTeamContext(app, DEREK_TARGET_CHANNELS);
    lastDerekContextRefresh = Date.now();
    logger.app.debug("[derek] Initial context refresh completed");
  } catch (error) {
    logger.app.debug("[derek] Initial context refresh failed (non-fatal)");
  }

  // Set up periodic posting
  derekAutonomousIntervalId = setInterval(
    async () => {
      try {
        // Refresh context if needed (1 hour)
        const timeSinceRefresh = Date.now() - lastDerekContextRefresh;
        if (
          timeSinceRefresh >
          DEREK_CONTEXT_REFRESH_INTERVAL_HOURS * 60 * 60 * 1000
        ) {
          try {
            await refreshTeamContext(app, DEREK_TARGET_CHANNELS);
            lastDerekContextRefresh = Date.now();
            logger.app.debug("[derek] Context refresh completed");
          } catch (error) {
            logger.app.debug("[derek] Context refresh failed (non-fatal)");
          }
        }

        // Try to post to each target channel
        for (const channelId of DEREK_TARGET_CHANNELS) {
          const channelIdTrimmed = channelId.trim();
          if (!channelIdTrimmed) continue;

          try {
            const posted = await postDerekComment(app, channelIdTrimmed);
            if (posted) {
              logger.app.debug(
                `[derek] Autonomously posted to ${channelIdTrimmed}`,
              );
            } else {
              logger.app.debug(
                `[derek] Skipped post to ${channelIdTrimmed} (safeguards or low confidence)`,
              );
            }
          } catch (error) {
            logger.app.debug(`[derek] Failed to post to ${channelIdTrimmed}`);
          }
        }
      } catch (error) {
        logger.app.debug("[derek] Autonomous posting cycle failed (non-fatal)");
      }
    },
    DEREK_POST_INTERVAL_MINUTES * 60 * 1000,
  );
};

/**
 * Stop Derek's autonomous posting
 */
export const stopDerekAutonomous = (): void => {
  if (derekAutonomousIntervalId !== null) {
    clearInterval(derekAutonomousIntervalId);
    derekAutonomousIntervalId = null;
    logger.app.info("[derek] Autonomous mode stopped");
  }
};

export default {
  startDerekAutonomous,
  stopDerekAutonomous,
};
