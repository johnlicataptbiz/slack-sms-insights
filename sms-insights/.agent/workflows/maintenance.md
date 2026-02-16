---
description: Procedures for maintaining the Slack Canvas dashboard and AI summaries
---

# SMS Insights Canvas Maintenance

This workflow ensures the Slack Canvas dashboards (Daily Reports and AI Summaries) remain organized and functional.

## 1. Routine Health Check

// turbo

1. Run the layout verification script:
   `npx ts-node scripts/test_user_sequences.ts`
   _Verify that the console output shows correct markdown table structures._

## 2. Adding New Assistant Identities

1. Open `services/summary-canvas.ts`.
2. Locate the `getAssistantIdentities` function.
3. Add a new entry with the `userId` and `label`.
4. Deploy the changes. The dashboard will update on the next summary.

## 3. Manual Deep Clean

1. If the canvas is cluttered, clear all text in the Slack Canvas UI.
2. Trigger an update by typing `generate daily report` in the insights channel (this triggers the 4:00 PM snapshot logic).
3. The system will recreate all headers and tables automatically.

## 4. Troubleshooting Sync Issues

1. Check the Railway/Vercel logs for "Managed canvas lookup failed".
2. Ensure the `ALOWARE_REPORT_CANVAS_ID` and `ALOWARE_SUMMARY_CANVAS_ID` are correctly set in the environment.
3. Verify that the app still has `canvases:write` and `canvases:read` scopes.
