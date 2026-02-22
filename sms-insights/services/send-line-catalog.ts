export type SendLineOption = {
  lineId: number | null;
  fromNumber: string | null;
  label: string;
  key: string;
};

const normalizePhone = (value: string): string | null => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
};

const buildKey = (lineId: number | null, fromNumber: string | null): string => {
  if (lineId != null) return `line:${lineId}`;
  if (fromNumber) return `from:${fromNumber}`;
  return 'unknown';
};

const parseRawEntry = (entry: unknown, index: number): SendLineOption | null => {
  if (!entry || typeof entry !== 'object') return null;
  const record = entry as Record<string, unknown>;

  const rawLineId = record.lineId ?? record.id ?? record.line_id;
  const lineId =
    typeof rawLineId === 'number'
      ? Math.trunc(rawLineId)
      : typeof rawLineId === 'string' && rawLineId.trim().length > 0
        ? Number.parseInt(rawLineId.trim(), 10)
        : NaN;

  const normalizedLineId = Number.isFinite(lineId) ? lineId : null;

  const rawFrom =
    typeof record.fromNumber === 'string'
      ? record.fromNumber
      : typeof record.from === 'string'
        ? record.from
        : typeof record.phone === 'string'
          ? record.phone
          : '';
  const fromNumber = normalizePhone(rawFrom);

  if (normalizedLineId == null && !fromNumber) {
    return null;
  }

  const label =
    typeof record.label === 'string' && record.label.trim().length > 0
      ? record.label.trim()
      : normalizedLineId != null
        ? `Line ${normalizedLineId}`
        : `Line ${index + 1}`;

  return {
    lineId: normalizedLineId,
    fromNumber,
    label,
    key: buildKey(normalizedLineId, fromNumber),
  };
};

export const listSendLineOptions = (): SendLineOption[] => {
  const raw = (process.env.ALOWARE_SEND_LINES_JSON || '').trim();
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    const options = parsed
      .map((entry, index) => parseRawEntry(entry, index))
      .filter((entry): entry is SendLineOption => Boolean(entry));

    const deduped = new Map<string, SendLineOption>();
    for (const option of options) {
      deduped.set(option.key, option);
    }

    return [...deduped.values()];
  } catch {
    return [];
  }
};

export const findSendLineOption = (params: { lineId?: number | null; fromNumber?: string | null }): SendLineOption | null => {
  const options = listSendLineOptions();
  if (options.length === 0) return null;

  const normalizedFrom = params.fromNumber ? normalizePhone(params.fromNumber) : null;
  for (const option of options) {
    if (params.lineId != null && option.lineId === params.lineId) return option;
    if (normalizedFrom && option.fromNumber === normalizedFrom) return option;
  }

  return null;
};
