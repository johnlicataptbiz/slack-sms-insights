const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const DEFAULT_BUSINESS_TIME_ZONE = 'America/Chicago';

export type RunDayInput = {
  report_date?: string;
  timestamp: string;
};

export const dayKeyInTimeZone = (isoTimestamp: string, timeZone: string): string | null => {
  const instant = new Date(isoTimestamp);
  if (!Number.isFinite(instant.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  if (!year || !month || !day) return null;
  return `${year}-${month}-${day}`;
};

export const resolveRunBusinessDay = (run: RunDayInput, timeZone = DEFAULT_BUSINESS_TIME_ZONE): string | null => {
  const reportDay = (run.report_date || '').trim();
  if (ISO_DAY_PATTERN.test(reportDay)) return reportDay;
  return dayKeyInTimeZone(run.timestamp, timeZone);
};
