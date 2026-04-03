import "dotenv/config";
import { closeDatabase, initDatabase } from "../services/db.js";
import {
  insertSmsEvent,
  type NewSmsEvent,
} from "../services/sms-event-store.js";

type JsonRecord = Record<string, unknown>;

const DEFAULT_BASE_URL = "https://app.aloware.com";
const DEFAULT_PATH = "/api/v1/webhook/sms-gateway/messages";
const DEFAULT_PAGE_SIZE = 100;
const DEFAULT_MAX_PAGES = 200;

const getEnv = (name: string): string => (process.env[name] || "").trim();

const parseIntOr = (value: string, fallback: number): number => {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const asRecord = (value: unknown): JsonRecord | null => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as JsonRecord;
};

const asString = (value: unknown): string | null => {
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
};

const pickString = (obj: JsonRecord | null, keys: string[]): string | null => {
  if (!obj) return null;
  for (const key of keys) {
    const value = asString(obj[key]);
    if (value) return value;
  }
  return null;
};

const parseDate = (value: unknown): Date => {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  const raw = asString(value);
  if (!raw) return new Date();
  const parsed = new Date(raw);
  if (Number.isFinite(parsed.getTime())) return parsed;
  const asNumber = Number.parseFloat(raw);
  if (Number.isFinite(asNumber)) {
    const ts = asNumber > 10_000_000_000 ? asNumber : asNumber * 1000;
    const numericDate = new Date(ts);
    if (Number.isFinite(numericDate.getTime())) return numericDate;
  }
  return new Date();
};

const inferDirection = (record: JsonRecord): NewSmsEvent["direction"] => {
  const raw = (
    pickString(record, ["direction", "message_direction", "type"]) || ""
  ).toLowerCase();
  if (raw.includes("inbound") || raw === "in" || raw === "received")
    return "inbound";
  if (raw.includes("outbound") || raw === "out" || raw === "sent")
    return "outbound";

  const fromPhone = pickString(record, ["from", "from_phone", "from_number"]);
  const toPhone = pickString(record, ["to", "to_phone", "to_number"]);
  if (fromPhone && toPhone) return "inbound";
  return "unknown";
};

const normalizeEvent = (
  record: JsonRecord,
  page: number,
  index: number,
): NewSmsEvent => {
  const direction = inferDirection(record);
  const id =
    pickString(record, ["id", "message_id", "sid", "uuid"]) ||
    `aloware-${page}-${index}-${Date.now()}`;

  const contact = asRecord(record.contact);
  const user = asRecord(record.user);
  const line = asRecord(record.line);
  const sequence = asRecord(record.sequence);

  const fromPhone = pickString(record, ["from", "from_phone", "from_number"]);
  const toPhone = pickString(record, ["to", "to_phone", "to_number"]);
  const contactPhone =
    pickString(record, ["contact_phone", "phone_number"]) ||
    pickString(contact, ["phone", "phone_number"]) ||
    (direction === "inbound" ? fromPhone : toPhone) ||
    fromPhone ||
    toPhone;

  const firstName =
    pickString(record, ["contact_first_name"]) ||
    pickString(contact, ["first_name"]);
  const lastName =
    pickString(record, ["contact_last_name"]) ||
    pickString(contact, ["last_name"]);
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();

  return {
    slackTeamId: "aloware-api",
    slackChannelId: "aloware-api-backfill",
    slackMessageTs: id,
    eventTs: parseDate(
      record.created_at ?? record.sent_at ?? record.timestamp ?? record.date,
    ),
    direction,
    contactId:
      pickString(record, ["contact_id"]) || pickString(contact, ["id"]) || null,
    contactPhone: contactPhone || null,
    contactName: pickString(record, ["contact_name"]) || fullName || null,
    alowareUser:
      pickString(record, ["user_email", "agent_email"]) ||
      pickString(user, ["email"]) ||
      pickString(record, ["user_id", "agent_id"]) ||
      pickString(user, ["id"]) ||
      null,
    body: pickString(record, ["body", "message", "text"]) || "",
    line:
      pickString(record, ["line_phone_number", "line_id"]) ||
      pickString(line, ["phone_number", "id"]) ||
      null,
    sequence:
      pickString(record, ["sequence_id", "sequence"]) ||
      pickString(sequence, ["id", "name"]) ||
      null,
    raw: record,
  };
};

const extractRows = (payload: unknown): JsonRecord[] => {
  if (Array.isArray(payload)) {
    return payload
      .map((item) => asRecord(item))
      .filter((item): item is JsonRecord => item !== null);
  }

  const root = asRecord(payload);
  if (!root) return [];

  const listCandidates = [root.data, root.messages, root.results, root.items];
  for (const candidate of listCandidates) {
    if (!Array.isArray(candidate)) continue;
    return candidate
      .map((item) => asRecord(item))
      .filter((item): item is JsonRecord => item !== null);
  }

  return [];
};

const hasNextPage = (
  payload: unknown,
  currentPage: number,
  rowsLength: number,
  pageSize: number,
): boolean => {
  const root = asRecord(payload);
  if (!root) return rowsLength >= pageSize;

  const meta =
    asRecord(root.meta) || asRecord(root.pagination) || asRecord(root.paging);
  const nextPageRaw = pickString(meta, ["next_page", "nextPage", "next"]);
  if (nextPageRaw) {
    const parsed = Number.parseInt(nextPageRaw, 10);
    if (Number.isFinite(parsed)) return parsed > currentPage;
    return true;
  }

  const hasMoreRaw = meta?.has_more;
  if (typeof hasMoreRaw === "boolean") return hasMoreRaw;

  const totalPagesRaw = pickString(meta, ["total_pages", "totalPages"]);
  if (totalPagesRaw) {
    const totalPages = Number.parseInt(totalPagesRaw, 10);
    if (Number.isFinite(totalPages)) return currentPage < totalPages;
  }

  return rowsLength >= pageSize;
};

const fetchPage = async (input: {
  baseUrl: string;
  path: string;
  method: "GET" | "POST";
  token: string;
  page: number;
  pageSize: number;
  from?: string;
  to?: string;
}): Promise<unknown> => {
  const parsePayload = (text: string): unknown => {
    if (text.trim().length === 0) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  };

  const endpoint = `${input.baseUrl}${input.path}`;
  const headers = {
    Accept: "application/json",
    "Content-Type": "application/json",
  };

  if (input.method === "GET") {
    const url = new URL(endpoint);
    url.searchParams.set("api_token", input.token);
    url.searchParams.set("page", String(input.page));
    url.searchParams.set("per_page", String(input.pageSize));
    if (input.from) url.searchParams.set("from", input.from);
    if (input.to) url.searchParams.set("to", input.to);

    const res = await fetch(url.toString(), { method: "GET", headers });
    const text = await res.text();
    const payload = parsePayload(text);
    if (!res.ok)
      throw new Error(
        `Aloware GET failed (${res.status}): ${JSON.stringify(payload)}`,
      );
    if (typeof payload === "string") {
      throw new Error(`Aloware GET returned non-JSON payload (${res.status})`);
    }
    return payload;
  }

  const body: JsonRecord = {
    api_token: input.token,
    page: input.page,
    per_page: input.pageSize,
  };
  if (input.from) body.from = input.from;
  if (input.to) body.to = input.to;

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const payload = parsePayload(text);
  if (!res.ok)
    throw new Error(
      `Aloware POST failed (${res.status}): ${JSON.stringify(payload)}`,
    );
  if (typeof payload === "string") {
    throw new Error(`Aloware POST returned non-JSON payload (${res.status})`);
  }
  return payload;
};

const run = async (): Promise<void> => {
  const token =
    getEnv("ALOWARE_API_TOKEN") ||
    getEnv("ALOWARE_WEBHOOK_API_TOKEN") ||
    getEnv("ALOWARE_FORM_API_TOKEN");
  if (!token) {
    throw new Error(
      "ALOWARE_API_TOKEN (or ALOWARE_WEBHOOK_API_TOKEN / ALOWARE_FORM_API_TOKEN) is required",
    );
  }

  const baseUrl = (getEnv("ALOWARE_BASE_URL") || DEFAULT_BASE_URL).replace(
    /\/$/,
    "",
  );
  const path = getEnv("ALOWARE_SMS_BACKFILL_PATH") || DEFAULT_PATH;
  const method = (
    getEnv("ALOWARE_SMS_BACKFILL_METHOD").toUpperCase() === "POST"
      ? "POST"
      : "GET"
  ) as "GET" | "POST";
  const pageSize = parseIntOr(
    getEnv("ALOWARE_SMS_BACKFILL_PAGE_SIZE"),
    DEFAULT_PAGE_SIZE,
  );
  const maxPages = parseIntOr(
    getEnv("ALOWARE_SMS_BACKFILL_MAX_PAGES"),
    DEFAULT_MAX_PAGES,
  );
  const from = getEnv("ALOWARE_SMS_BACKFILL_FROM") || undefined;
  const to = getEnv("ALOWARE_SMS_BACKFILL_TO") || undefined;

  console.log("Starting Aloware API SMS backfill...");
  console.log(`Endpoint: ${baseUrl}${path}`);
  console.log(
    `Method: ${method}, pageSize: ${pageSize}, maxPages: ${maxPages}`,
  );
  if (from || to) {
    console.log(`Range: ${from || "(open)"} -> ${to || "(open)"}`);
  }

  await initDatabase(console);

  let page = 1;
  let pagesFetched = 0;
  let eventsSeen = 0;
  let eventsStored = 0;

  try {
    while (page <= maxPages) {
      const payload = await fetchPage({
        baseUrl,
        path,
        method,
        token,
        page,
        pageSize,
        from,
        to,
      });

      const rows = extractRows(payload);
      pagesFetched += 1;
      console.log(`Page ${page}: received ${rows.length} records`);

      for (let index = 0; index < rows.length; index += 1) {
        const row = rows[index];
        const event = normalizeEvent(row, page, index);
        eventsSeen += 1;
        const stored = await insertSmsEvent(event, console);
        if (stored) eventsStored += 1;
      }

      if (!hasNextPage(payload, page, rows.length, pageSize)) {
        break;
      }

      page += 1;
    }

    console.log("Aloware API SMS backfill complete");
    console.log(
      JSON.stringify(
        {
          pagesFetched,
          eventsSeen,
          eventsStored,
          endpoint: `${baseUrl}${path}`,
          method,
        },
        null,
        2,
      ),
    );
  } finally {
    await closeDatabase();
  }
};

run().catch((error) => {
  console.error(
    "backfill-aloware-api-sms failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exit(1);
});
