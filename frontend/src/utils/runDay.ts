const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const ISO_DAY_PREFIX_PATTERN = /^\d{4}-\d{2}-\d{2}(?:T.*)?$/;
const DEFAULT_BUSINESS_DAY_START_HOUR = 4;

export const DEFAULT_BUSINESS_TIME_ZONE = 'America/Chicago';

export type RunDayInput = {
  report_date?: string;
  timestamp: string;
};

type TimeZoneParts = {
  year: string;
  month: string;
  day: string;
  hour: number;
};

const clampHour = (value: number): number => {
  if (!Number.isFinite(value)) return DEFAULT_BUSINESS_DAY_START_HOUR;
  return Math.min(23, Math.max(0, Math.trunc(value)));
};

const getTimeZoneParts = (input: Date | string, timeZone: string): TimeZoneParts | null => {
  const instant = input instanceof Date ? input : new Date(input);
  if (!Number.isFinite(instant.getTime())) return null;

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  const day = parts.find((p) => p.type === 'day')?.value;
  const hourText = parts.find((p) => p.type === 'hour')?.value;
  const hour = Number.parseInt(hourText || '', 10);
  if (!year || !month || !day || Number.isNaN(hour)) return null;

  return { year, month, day, hour };
};

const shiftIsoDay = (day: string, deltaDays: number): string => {
  const [year, month, date] = day.split('-').map((value) => Number.parseInt(value, 10));
  const shifted = new Date(Date.UTC(year, month - 1, date + deltaDays, 0, 0, 0, 0));
  const yyyy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(shifted.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export type BusinessDayContext = {
  day: string;
  isCarryOver: boolean;
  startHour: number;
  timeZone: string;
};

export const dayKeyInTimeZone = (input: Date | string, timeZone: string): string | null => {
  const parts = getTimeZoneParts(input, timeZone);
  if (!parts) return null;
  return `${parts.year}-${parts.month}-${parts.day}`;
};

export const resolveCurrentBusinessDay = (params?: {
  now?: Date;
  timeZone?: string;
  startHour?: number;
}): BusinessDayContext | null => {
  const now = params?.now || new Date();
  if (!Number.isFinite(now.getTime())) return null;

  const timeZone = params?.timeZone || DEFAULT_BUSINESS_TIME_ZONE;
  const startHour = clampHour(params?.startHour ?? DEFAULT_BUSINESS_DAY_START_HOUR);
  const parts = getTimeZoneParts(now, timeZone);
  if (!parts) return null;

  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const isCarryOver = parts.hour < startHour;
  const day = isCarryOver ? shiftIsoDay(today, -1) : today;

  return { day, isCarryOver, startHour, timeZone };
};

export const resolveRunBusinessDay = (run: RunDayInput, timeZone = DEFAULT_BUSINESS_TIME_ZONE): string | null => {
  const reportDay = (run.report_date || '').trim();
  if (ISO_DAY_PATTERN.test(reportDay)) return reportDay;
  if (ISO_DAY_PREFIX_PATTERN.test(reportDay)) return reportDay.slice(0, 10);
  return dayKeyInTimeZone(run.timestamp, timeZone);
};
