import { type Request, type Response, Router } from 'express';

/**
 * Slack Workflow Alert Router
 * Bridges cron-scheduler alerts to Slack Workflow triggers
 * Enables bi-directional communication: cron → workflows → Slack
 */

interface AlertWebhookPayload {
  checkType: 'workload' | 'sla' | 'conversion' | 'health' | 'inbox' | 'attribution';
  alertTriggered: boolean;
  metricValue: number;
  alertMessage: string;
  severity: 'critical' | 'warning' | 'info';
  timestamp: string;
  channelId?: string;
  workflowId?: string;
}

const alertRouter = Router();

/**
 * POST /api/alerts/webhook
 * Receives alert data from cron-scheduler and triggers Slack workflows
 */
alertRouter.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  try {
    const payload = req.body as AlertWebhookPayload;

    if (!payload.checkType) {
      res.status(400).json({ error: 'Missing checkType' });
      return;
    }

    // Route to appropriate workflow based on alert type
    switch (payload.checkType) {
      case 'workload':
      case 'sla':
      case 'conversion':
      case 'health':
        // Trigger Proactive Alerts Workflow from sms-insights-workflow
        await triggerProactiveAlertsWorkflow(payload);
        break;

      case 'inbox':
        // Trigger Inbox Watch workflow
        await triggerInboxWatchWorkflow(payload);
        break;

      case 'attribution':
        // Trigger Attribution Health workflow
        await triggerAttributionHealthWorkflow(payload);
        break;

      default:
        res.status(400).json({ error: `Unknown checkType: ${payload.checkType}` });
        return;
    }

    res.json({
      success: true,
      message: `Alert webhook processed: ${payload.checkType}`,
      severity: payload.severity,
    });
  } catch (error) {
    console.error('[alerts] webhook error:', error);
    res.status(500).json({
      error: 'Failed to process alert webhook',
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

/**
 * GET /api/alerts/status
 * Get current alert status snapshot for Command Center dashboard
 */
alertRouter.get('/status', async (_req: Request, res: Response): Promise<void> => {
  try {
    const status = {
      timestamp: new Date().toISOString(),
      alerts: {
        inbox: {
          lastAlertAt: getLastInboxAlertTime(),
          isHealthy: isInboxHealthy(),
          openCount: getInboxOpenCount(),
        },
        attribution: {
          lastAlertAt: getLastAttributionAlertTime(),
          isHealthy: isAttributionHealthy(),
          lagHours: getAttributionLagHours(),
        },
      },
    };
    res.json(status);
  } catch (error) {
    console.error('[alerts] status endpoint error:', error);
    res.status(500).json({ error: 'Failed to fetch alert status' });
  }
});

/**
 * POST /api/alerts/inbox
 * Receive inbox backlog alert data from cron
 */
alertRouter.post('/inbox', async (req: Request, res: Response): Promise<void> => {
  try {
    const { critical, stale, unassigned, needsReply } = req.body as Record<string, number>;

    const payload: AlertWebhookPayload = {
      checkType: 'inbox',
      alertTriggered: critical > 0 || stale > 0 || unassigned > 0,
      metricValue: needsReply || 0,
      alertMessage: formatInboxAlertMessage({
        critical,
        stale,
        unassigned,
        needsReply,
      }),
      severity: critical > 0 ? 'critical' : stale > 0 ? 'warning' : 'info',
      timestamp: new Date().toISOString(),
      channelId: process.env.INBOX_ALERT_CHANNEL_ID,
    };

    await triggerInboxWatchWorkflow(payload);

    res.json({
      success: true,
      message: 'Inbox alert triggered',
      payload,
    });
  } catch (error) {
    console.error('[alerts] inbox endpoint error:', error);
    res.status(500).json({ error: 'Failed to process inbox alert' });
  }
});

/**
 * POST /api/alerts/attribution
 * Receive attribution lag alert data from cron
 */
alertRouter.post('/attribution', async (req: Request, res: Response): Promise<void> => {
  try {
    const { lagHours, maxBookedCallsTs, maxAttributionTs } = req.body as Record<string, unknown>;

    const payload: AlertWebhookPayload = {
      checkType: 'attribution',
      alertTriggered: (lagHours as number) > 24,
      metricValue: (lagHours as number) || 0,
      alertMessage: `Attribution lag: ${lagHours}h (booked_calls: ${maxBookedCallsTs}, attribution: ${maxAttributionTs})`,
      severity: (lagHours as number) > 24 ? 'warning' : 'info',
      timestamp: new Date().toISOString(),
      channelId: process.env.ATTRIBUTION_ALERT_CHANNEL_ID,
    };

    await triggerAttributionHealthWorkflow(payload);

    res.json({
      success: true,
      message: 'Attribution alert triggered',
      payload,
    });
  } catch (error) {
    console.error('[alerts] attribution endpoint error:', error);
    res.status(500).json({ error: 'Failed to process attribution alert' });
  }
});

// ──── Workflow Trigger Helpers ────────────────────────────────────────────

async function triggerProactiveAlertsWorkflow(payload: AlertWebhookPayload): Promise<void> {
  // In production, this would call the Slack Workflow API
  // For now, log the trigger
  console.log('[alerts] Triggering Proactive Alerts workflow:', {
    checkType: payload.checkType,
    severity: payload.severity,
    triggered: payload.alertTriggered,
  });

  // TODO: Call Slack Workflows API
  // const client = new slack.WebClient(process.env.SLACK_BOT_TOKEN);
  // await client.workflows.triggers.list(...);
}

async function triggerInboxWatchWorkflow(payload: AlertWebhookPayload): Promise<void> {
  console.log('[alerts] Triggering Inbox Watch workflow:', {
    severity: payload.severity,
    message: payload.alertMessage,
  });
}

async function triggerAttributionHealthWorkflow(payload: AlertWebhookPayload): Promise<void> {
  console.log('[alerts] Triggering Attribution Health workflow:', {
    severity: payload.severity,
    lagHours: payload.metricValue,
  });
}

// ──── Status Helpers ──────────────────────────────────────────────────────

function getLastInboxAlertTime(): string | null {
  // TODO: Store in cache or database
  return null;
}

function isInboxHealthy(): boolean {
  // TODO: Check current inbox metrics
  return true;
}

function getInboxOpenCount(): number {
  // TODO: Query database
  return 0;
}

function getLastAttributionAlertTime(): string | null {
  // TODO: Store in cache or database
  return null;
}

function isAttributionHealthy(): boolean {
  // TODO: Check attribution lag
  return true;
}

function getAttributionLagHours(): number {
  // TODO: Calculate from database
  return 0;
}

function formatInboxAlertMessage(counts: Record<string, number>): string {
  return (
    `Inbox backlog: critical=${counts.critical}, stale=${counts.stale}, ` +
    `unassigned=${counts.unassigned}, needsReply=${counts.needsReply}`
  );
}

export default alertRouter;
