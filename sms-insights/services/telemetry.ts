import type { Logger } from '@slack/bolt';

type ContextValue = string | number | boolean | undefined | null;
type TelemetryContext = Record<string, ContextValue>;

type TimeOperationArgs<T> = {
  context?: TelemetryContext;
  fn: () => Promise<T>;
  logger?: Pick<Logger, 'debug' | 'warn'>;
  name: string;
};

const stringifyContext = (context: TelemetryContext): string => {
  const entries = Object.entries(context)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => left.localeCompare(right));

  if (entries.length === 0) {
    return '';
  }

  const payload = Object.fromEntries(entries);
  return ` ${JSON.stringify(payload)}`;
};

export const timeOperation = async <T>({ context = {}, fn, logger, name }: TimeOperationArgs<T>): Promise<T> => {
  const start = Date.now();

  try {
    const result = await fn();
    logger?.debug?.(
      `[telemetry] ${name}${stringifyContext({
        ...context,
        duration_ms: Date.now() - start,
        success: true,
      })}`,
    );
    return result;
  } catch (error) {
    logger?.warn?.(
      `[telemetry] ${name}${stringifyContext({
        ...context,
        duration_ms: Date.now() - start,
        success: false,
      })}`,
    );
    throw error;
  }
};
