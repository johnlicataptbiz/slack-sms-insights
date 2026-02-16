import type { Logger } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import {
  getSummaryCanvasId,
  getSummaryCanvasTitle,
  getInsightsBoardKey,
  getLatestInsightKey,
  updateInsightsDashboard,
} from "./summary-canvas.js";
import {
  getReportCanvasId,
  getManagedCanvasKey,
  getManagedSectionHeading,
  LEGACY_MAIN_SECTION_MARKERS,
  upsertManagedSection as upsertReportManagedSection,
} from "./canvas-log.js";

/**
 * Audit and repair the structure of the AI SMS Insights canvases.
 * Ensures managed headers and dashboard sections exist and are correctly placed.
 */
export const auditCanvasStructure = async ({
  client,
  logger,
  channelId,
  timezone = "America/Chicago",
}: {
  client: WebClient;
  logger: Logger;
  channelId: string;
  timezone?: string;
}): Promise<{ summaryCanvasOk: boolean; reportCanvasOk: boolean }> => {
  logger.info("Starting Canvas Governance Audit...");

  let summaryCanvasOk = true;
  let reportCanvasOk = true;

  try {
    // 1. Audit Summary Canvas
    const summaryCanvasId = getSummaryCanvasId();
    if (summaryCanvasId) {
      logger.info(`Auditing Summary Canvas: ${summaryCanvasId}`);
      // updateInsightsDashboard already has logic to upsert managed sections.
      // Calling it ensures the dashboard structure is alive and current.
      await updateInsightsDashboard({
        client,
        canvasId: summaryCanvasId,
        channelId,
        logger,
        timezone,
      });
    } else {
      logger.warn("Summary Canvas ID not configured, skipping audit.");
      summaryCanvasOk = false;
    }

    // 2. Audit Daily Report Canvas
    const reportCanvasId = getReportCanvasId();
    if (reportCanvasId) {
      logger.info(`Auditing Report Canvas: ${reportCanvasId}`);
      // Ensuring the dashboard section is present.
      // We don't have a simple 'refresh' for the report without data,
      // but we can ensure the section exists.
      await upsertReportManagedSection({
        client,
        canvasId: reportCanvasId,
        managedKey: getManagedCanvasKey(),
        heading: getManagedSectionHeading(),
        legacyContainsText: LEGACY_MAIN_SECTION_MARKERS,
        markdown:
          "> [!NOTE]\n> Dashboard structure verified by Governance Audit.",
        logger,
      });
    } else {
      logger.warn("Report Canvas ID not configured, skipping audit.");
      reportCanvasOk = false;
    }
  } catch (error) {
    logger.error("Canvas Audit failed:");
    logger.error(error);
    summaryCanvasOk = false;
    reportCanvasOk = false;
  }

  return { summaryCanvasOk, reportCanvasOk };
};

/**
 * Generate a Weekly Insight Digest by aggregating the best highlights from the last 7 days.
 */
export const generateWeeklyDigest = async ({
  client,
  logger,
  channelId,
  timezone = "America/Chicago",
}: {
  client: WebClient;
  logger: Logger;
  channelId: string;
  timezone?: string;
}): Promise<string> => {
  // Logic to fetch last 7 days of summaries and pick the 'best' ones
  // or simply summarize the summaries.
  return "# Weekly SMS Insights Digest\nComing soon...";
};
