import type { Logger } from '@slack/bolt';

type SkipReason = 'unknown_direction' | 'missing_contact' | 'missing_channel_or_ts';

type SkipSample = {
  at: string;
  reason: SkipReason;
  channelId: string | null;
  textPreview: string;
  attachmentTitle: string | null;
};

type MonitorState = {
  startedAt: string;
  totalSeen: number;
  ingested: number;
  skipped: Record<SkipReason, number>;
  recentSamples: SkipSample[];
  totalSkipped: number;
  lastWarningAtMs: number;
  lastWarningTotalSkipped: number;
};

const MAX_SAMPLES = 8;
const WARNING_INTERVAL_MS = 5 * 60 * 1000;
const WARNING_SKIP_STEP = 20;

const state: MonitorState = {
  startedAt: new Date().toISOString(),
  totalSeen: 0,
  ingested: 0,
  skipped: {
    unknown_direction: 0,
    missing_contact: 0,
    missing_channel_or_ts: 0,
  },
  recentSamples: [],
  totalSkipped: 0,
  lastWarningAtMs: 0,
  lastWarningTotalSkipped: 0,
};

const previewText = (value: string | undefined): string => {
  const normalized = (value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  return normalized.length > 220 ? `${normalized.slice(0, 217)}...` : normalized;
};

export const recordAlowareIngestSeen = (): void => {
  state.totalSeen += 1;
};

export const recordAlowareIngestSuccess = (): void => {
  state.ingested += 1;
};

export const recordAlowareIngestSkip = (params: {
  reason: SkipReason;
  channelId?: string;
  text?: string;
  attachmentTitle?: string;
}): void => {
  state.skipped[params.reason] += 1;
  state.totalSkipped += 1;

  const sample: SkipSample = {
    at: new Date().toISOString(),
    reason: params.reason,
    channelId: params.channelId || null,
    textPreview: previewText(params.text),
    attachmentTitle: params.attachmentTitle || null,
  };
  state.recentSamples = [sample, ...state.recentSamples].slice(0, MAX_SAMPLES);
};

export const maybeLogAlowareIngestWarnings = (
  logger?: Pick<Logger, 'warn' | 'info'>,
): void => {
  if (!logger) return;
  if (state.totalSkipped === 0) return;

  const now = Date.now();
  const byStep = state.totalSkipped - state.lastWarningTotalSkipped >= WARNING_SKIP_STEP;
  const byTime = now - state.lastWarningAtMs >= WARNING_INTERVAL_MS;
  if (!byStep && !byTime) return;

  const seen = state.totalSeen;
  const skipRatePct = seen > 0 ? Number(((state.totalSkipped / seen) * 100).toFixed(2)) : 0;

  logger.warn('Aloware ingest skip activity detected', {
    service: 'aloware_ingest_monitor',
    totals: {
      seen,
      ingested: state.ingested,
      skipped: state.totalSkipped,
      skipRatePct,
    },
    byReason: state.skipped,
    recentSamples: state.recentSamples,
  });

  state.lastWarningAtMs = now;
  state.lastWarningTotalSkipped = state.totalSkipped;
};

export const getAlowareIngestHealthSnapshot = () => {
  const seen = state.totalSeen;
  const skipRatePct = seen > 0 ? Number(((state.totalSkipped / seen) * 100).toFixed(2)) : 0;
  return {
    startedAt: state.startedAt,
    totals: {
      seen,
      ingested: state.ingested,
      skipped: state.totalSkipped,
      skipRatePct,
    },
    byReason: { ...state.skipped },
    recentSamples: [...state.recentSamples],
  };
};
