const DEFAULT_BUSINESS_TIMEZONE = 'America/Chicago';
const ISO_DAY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export type SupportedRange = 'today' | '7d' | '30d' | '90d' | '180d' | '365d';
export type ResolvedMetricsRange =
  | {
      mode: 'day';
      day: string;
      from: Date;
      to: Date;
      timeZone: string;
    }
  | {
      mode: 'range';
      range: SupportedRange;
      from: Date;
      to: Date;
      timeZone: string;
    }
  | {
      mode: 'from-to';
      from: Date;
      to: Date;
      timeZone: string;
    };

const assertFiniteDate = (value: Date, label: string): void => {
  if (!Number.isFinite(value.getTime())) {
    throw new Error(`Invalid ${label}`);
  }
};

const parseIsoDay = (day: string): { year: number; month: number; date: number } => {
  if (!ISO_DAY_PATTERN.test(day)) {
    throw new Error('Invalid day format, expected YYYY-MM-DD');
  }
  const [y, m, d] = day.split('-').map((v) => Number.parseInt(v, 10));
  return { year: y, month: m, date: d };
};

const getTimeZoneOffsetMs = (instant: Date, timeZone: string): number => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);

  const offsetPart = parts.find((p) => p.type === 'timeZoneName')?.value || '';
  const match = offsetPart.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
  if (!match) {
    throw new Error(`Could not parse timezone offset for ${timeZone}`);
  }

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number.parseInt(match[2], 10);
  const minutes = Number.parseInt(match[3] || '0', 10);
  return sign * ((hours * 60 + minutes) * 60 * 1000);
};

const zonedDateTimeToUtc = (
  year: number,
  month: number,
  date: number,
  hours: number,
  minutes: number,
  seconds: number,
  milliseconds: number,
  timeZone: string,
): Date => {
  const utcGuess = Date.UTC(year, month - 1, date, hours, minutes, seconds, milliseconds);
  const offset0 = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let utc = utcGuess - offset0;
  const offset1 = getTimeZoneOffsetMs(new Date(utc), timeZone);
  if (offset1 !== offset0) {
    utc = utcGuess - offset1;
  }
  return new Date(utc);
};

const formatUtcIsoDay = (instant: Date): string => {
  const yyyy = instant.getUTCFullYear();
  const mm = String(instant.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(instant.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

const shiftIsoDay = (day: string, deltaDays: number): string => {
  const { year, month, date } = parseIsoDay(day);
  const shifted = new Date(Date.UTC(year, month - 1, date + deltaDays, 0, 0, 0, 0));
  return formatUtcIsoDay(shifted);
};

export const resolveTimeZone = (input: string | null | undefined): string => {
  const candidate = (input || '').trim();
  if (!candidate) return DEFAULT_BUSINESS_TIMEZONE;

  try {
    // Throws RangeError for unknown zones.
    new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
    return candidate;
  } catch {
    throw new Error(`Invalid timezone: ${candidate}`);
  }
};

export const dayKeyInTimeZone = (input: Date | string, timeZone: string): string | null => {
  const instant = input instanceof Date ? input : new Date(input);
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

export const resolveBusinessDayRange = (
  day: string,
  timeZone: string,
): { day: string; from: Date; to: Date; timeZone: string } => {
  const parsed = parseIsoDay(day);
  const from = zonedDateTimeToUtc(parsed.year, parsed.month, parsed.date, 0, 0, 0, 0, timeZone);
  const to = zonedDateTimeToUtc(parsed.year, parsed.month, parsed.date, 23, 59, 59, 999, timeZone);
  return { day, from, to, timeZone };
};

export const resolveMetricsRange = (params: {
  from?: string | null;
  to?: string | null;
  day?: string | null;
  range?: string | null;
  tz?: string | null;
  now?: Date;
}): ResolvedMetricsRange => {
  const now = params.now || new Date();
  assertFiniteDate(now, 'now');
  const timeZone = resolveTimeZone(params.tz);

  const day = (params.day || '').trim();
  if (day) {
    const resolved = resolveBusinessDayRange(day, timeZone);
    return { mode: 'day', ...resolved };
  }

  const range = (params.range || '').trim() as SupportedRange | '';
  if (range) {
    if (range !== 'today' && range !== '7d' && range !== '30d' && range !== '90d' && range !== '180d' && range !== '365d') {
      throw new Error('Invalid range. Expected one of: today, 7d, 30d, 90d, 180d, 365d');
    }

    const today = dayKeyInTimeZone(now, timeZone);
    if (!today) throw new Error('Failed to resolve current day for timezone');

    const startDay =
      range === 'today'
        ? today
        : range === '7d'
          ? shiftIsoDay(today, -6)
          : range === '30d'
            ? shiftIsoDay(today, -29)
            : range === '90d'
              ? shiftIsoDay(today, -89)
              : range === '180d'
                ? shiftIsoDay(today, -179)
                : shiftIsoDay(today, -364);
    const from = resolveBusinessDayRange(startDay, timeZone).from;
    const to = now;
    return { mode: 'range', range, from, to, timeZone };
  }

  const fromStr = (params.from || '').trim();
  const toStr = (params.to || '').trim();
  if (!fromStr || !toStr) {
    throw new Error('Missing range selector. Provide day, range, or from/to');
  }

  const from = new Date(fromStr);
  const to = new Date(toStr);
  assertFiniteDate(from, 'from');
  assertFiniteDate(to, 'to');
  if (from.getTime() > to.getTime()) {
    throw new Error('Invalid range: from must be <= to');
  }

  return { mode: 'from-to', from, to, timeZone };
};

export const businessDayForTimestamp = (isoTimestamp: string, timeZone: string): string | null => {
  return dayKeyInTimeZone(isoTimestamp, timeZone);
};

export { DEFAULT_BUSINESS_TIMEZONE };
