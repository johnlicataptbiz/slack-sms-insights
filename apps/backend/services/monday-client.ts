import type { Logger } from "@slack/bolt";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const MONDAY_API_URL = "https://api.monday.com/v2";
const DEFAULT_TIMEOUT_MS = Number.parseInt(
  process.env.MONDAY_API_TIMEOUT_MS || "12000",
  10,
);
const DEFAULT_MAX_RETRIES = Number.parseInt(
  process.env.MONDAY_API_MAX_RETRIES || "2",
  10,
);
const DEFAULT_RETRY_BASE_MS = Number.parseInt(
  process.env.MONDAY_API_RETRY_BASE_MS || "500",
  10,
);

/**
 * How many hours must pass before we post another update to the same item.
 * Prevents update stacking noise on every sync cycle.
 * Set to 0 to disable update posts entirely (column-only mode).
 */
const UPDATE_COOLDOWN_HOURS = Number.parseInt(
  process.env.MONDAY_UPDATE_COOLDOWN_HOURS || "24",
  10,
);

/**
 * Maximum characters for structured text fields.
 * Raw SMS bodies longer than this are intelligently truncated.
 */
const MAX_TEXT_FIELD_LENGTH = 180;

/**
 * Maximum characters for long-text fields (summaries, notes).
 */
const MAX_LONG_TEXT_LENGTH = 500;

const sleep = async (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const getMondayToken = (): string => {
  const token = (process.env.MONDAY_API_TOKEN || "").trim();
  if (!token) {
    throw new Error("MONDAY_API_TOKEN is not configured");
  }
  return token;
};

type MondayGraphQlResponse<T> = {
  data?: T;
  errors?: Array<{ message?: string }>;
};

const requestGraphQl = async <T>(
  query: string,
  variables: Record<string, unknown>,
  logger?: Pick<Logger, "info" | "debug" | "warn" | "error">,
): Promise<T> => {
  const token = getMondayToken();
  let attempt = 0;

  while (true) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(MONDAY_API_URL, {
        method: "POST",
        headers: {
          Authorization: token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      const payload = (await response.json()) as MondayGraphQlResponse<T>;
      if (!response.ok || payload.errors?.length) {
        const errMsg =
          payload.errors
            ?.map((err) => err.message)
            .filter(Boolean)
            .join("; ") ||
          `Monday API request failed with status ${response.status}`;
        throw new Error(errMsg);
      }

      if (!payload.data)
        throw new Error("Monday API returned empty data payload");
      return payload.data;
    } catch (error) {
      attempt += 1;
      const canRetry = attempt <= DEFAULT_MAX_RETRIES;
      logger?.warn?.("Monday API request failed", {
        attempt,
        canRetry,
        error: String(error),
      });
      if (!canRetry) {
        logger?.error?.("Monday API request exhausted retries", error);
        throw error;
      }
      const delay = DEFAULT_RETRY_BASE_MS * 2 ** (attempt - 1);
      await sleep(delay);
    } finally {
      clearTimeout(timeout);
    }
  }
};

export type MondayBoardColumn = {
  id: string;
  title: string;
  type: string;
};

export type MondayBoardItem = {
  id: string;
  name: string;
  updatedAt: string;
  columnValues: Array<{
    id: string;
    type: string;
    text: string | null;
    value: string | null;
  }>;
};

export type MondayItemsPage = {
  items: MondayBoardItem[];
  nextCursor: string | null;
};

export const queryBoardColumns = async (
  boardId: string,
  logger?: Pick<Logger, "info" | "debug" | "warn" | "error">,
): Promise<MondayBoardColumn[]> => {
  const query = `
    query QueryBoardColumns($boardId: [ID!]) {
      boards(ids: $boardId) {
        id
        columns {
          id
          title
          type
        }
      }
    }
  `;
  const data = await requestGraphQl<{
    boards?: Array<{ columns?: MondayBoardColumn[] }>;
  }>(query, { boardId: [boardId] }, logger);
  return data.boards?.[0]?.columns || [];
};

export const queryBoardItems = async (
  boardId: string,
  updatedSinceCursor?: string | null,
  logger?: Pick<Logger, "info" | "debug" | "warn" | "error">,
): Promise<MondayItemsPage> => {
  const hasCursor = Boolean(updatedSinceCursor);
  const pageProjection = `
    cursor
    items {
      id
      name
      updated_at
      column_values {
        id
        type
        text
        value
      }
    }
  `;
  const query = hasCursor
    ? `
      query QueryBoardItemsWithCursor($cursor: String!, $limit: Int!) {
        next_items_page(cursor: $cursor, limit: $limit) {
          ${pageProjection}
        }
      }
    `
    : `
      query QueryBoardItemsFirstPage($boardId: [ID!], $limit: Int!) {
        boards(ids: $boardId) {
          items_page(limit: $limit) {
            ${pageProjection}
          }
        }
      }
    `;

  const variables: Record<string, unknown> = hasCursor
    ? {
        cursor: updatedSinceCursor,
        limit: 100,
      }
    : {
        boardId: [boardId],
        limit: 100,
      };

  const data = await requestGraphQl<{
    boards?: Array<{
      items_page?: {
        cursor?: string | null;
        items?: Array<{
          id: string;
          name: string;
          updated_at: string;
          column_values?: Array<{
            id: string;
            type: string;
            text: string | null;
            value: string | null;
          }>;
        }>;
      };
    }>;
    next_items_page?: {
      cursor?: string | null;
      items?: Array<{
        id: string;
        name: string;
        updated_at: string;
        column_values?: Array<{
          id: string;
          type: string;
          text: string | null;
          value: string | null;
        }>;
      }>;
    };
  }>(query, variables, logger);

  const page = hasCursor ? data.next_items_page : data.boards?.[0]?.items_page;
  const items = (page?.items || []).map((item) => ({
    id: item.id,
    name: item.name,
    updatedAt: item.updated_at,
    columnValues: item.column_values || [],
  }));

  return {
    items,
    nextCursor: page?.cursor || null,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Text Utilities: Structured truncation and formatting
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Truncate raw text to a maximum length while preserving readability.
 * Cuts at the last complete sentence boundary when possible.
 */
export const truncateText = (
  text: string,
  maxLength: number = MAX_TEXT_FIELD_LENGTH,
): string => {
  if (text.length <= maxLength) return text;
  // Try to cut at sentence boundary
  const sub = text.slice(0, maxLength - 3);
  const lastSentence = Math.max(
    sub.lastIndexOf(". "),
    sub.lastIndexOf("! "),
    sub.lastIndexOf("? "),
  );
  if (lastSentence > maxLength * 0.5) {
    return sub.slice(0, lastSentence + 1) + "...";
  }
  // Fallback: cut at word boundary
  const lastSpace = sub.lastIndexOf(" ");
  if (lastSpace > maxLength * 0.5) {
    return sub.slice(0, lastSpace) + "...";
  }
  return sub + "...";
};

/**
 * Truncate long text fields (summaries, notes) with structural formatting.
 * Preserves bullet points and line breaks where possible.
 */
export const truncateLongText = (
  text: string,
  maxLength: number = MAX_LONG_TEXT_LENGTH,
): string => {
  if (text.length <= maxLength) return text;
  return truncateText(text, maxLength);
};

/**
 * Extract the first actionable sentence from a longer text.
 * Used to convert raw message bodies into meaningful snippets.
 */
export const extractFirstSentence = (
  text: string,
  maxLength: number = MAX_TEXT_FIELD_LENGTH,
): string => {
  const trimmed = text.trim();
  if (trimmed.length <= maxLength) return trimmed;

  // Find end of first sentence
  let end = -1;
  for (let i = 0; i < trimmed.length; i++) {
    if (".!?".includes(trimmed[i])) {
      const next = trimmed[i + 1];
      if (next === " " || next === undefined) {
        end = i + 1;
        break;
      }
    }
  }
  if (end > 0 && end <= maxLength - 3) {
    return trimmed.slice(0, end).trim();
  }
  return truncateText(trimmed, maxLength);
};

// ─────────────────────────────────────────────────────────────────────────────
// Update Staleness Detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query the most recent update on a Monday item to check staleness.
 * Returns true if the latest update is older than the cooldown period.
 */
export const shouldPostUpdate = async (
  itemId: string,
  logger?: Pick<Logger, "info" | "debug" | "warn" | "error">,
): Promise<boolean> => {
  if (UPDATE_COOLDOWN_HOURS <= 0) {
    return false; // Updates disabled, use column-only mode
  }

  const query = `
    query ItemLastUpdate($itemId: ID!) {
      items(ids: [$itemId]) {
        updates {
          id
          created_at
        }
      }
    }
  `;

  try {
    const data = await requestGraphQl<{
      items?: Array<{ updates?: Array<{ id: string; created_at: string }> }>;
    }>(query, { itemId }, logger);

    const updates = data.items?.[0]?.updates || [];
    if (updates.length === 0) {
      return true; // No updates yet, safe to post
    }

    // Sort by created_at descending and check the most recent
    const latest = updates.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];

    const hoursSinceUpdate =
      (Date.now() - new Date(latest.created_at).getTime()) / (1000 * 60 * 60);
    return hoursSinceUpdate >= UPDATE_COOLDOWN_HOURS;
  } catch {
    // If we can't check, default to allowing the update (safe default)
    return true;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Upsert Functions: Phase 1 Optimized
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Upsert a weekly summary item with structured column updates.
 *
 * Phase 1 change: Replaces raw create_update() dumps with column-only updates
 * when structured data is available. Posts a human-readable update only when:
 * - The item is newly created, OR
 * - The last update exceeds the UPDATE_COOLDOWN_HOURS threshold
 */
export const upsertWeeklySummaryItem = async (
  boardId: string,
  weekKey: string,
  payload: {
    title: string;
    summaryMarkdown: string;
    columnValues?: Record<string, unknown>;
    existingItemId?: string | null;
  },
  logger?: Pick<Logger, "info" | "debug" | "warn" | "error">,
): Promise<{
  itemId: string;
  action: "created" | "updated";
  updatePosted: boolean;
}> => {
  const itemName = payload.title || `PTBizSMS Weekly Summary - ${weekKey}`;
  let itemId = payload.existingItemId || null;
  let action: "created" | "updated" = "updated";
  let updatePosted = false;

  if (!itemId) {
    const createMutation = `
      mutation CreateWeeklySummaryItem($boardId: ID!, $itemName: String!) {
        create_item(board_id: $boardId, item_name: $itemName) {
          id
        }
      }
    `;
    const createData = await requestGraphQl<{ create_item?: { id?: string } }>(
      createMutation,
      { boardId, itemName },
      logger,
    );
    itemId = createData.create_item?.id || null;
    if (!itemId) throw new Error("Failed to create monday weekly summary item");
    action = "created";
  }

  const columnValues = payload.columnValues || null;
  if (itemId && columnValues && Object.keys(columnValues).length > 0) {
    const patchColumnsMutation = `
      mutation PatchWeeklySummaryColumns($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
        change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
          id
        }
      }
    `;
    await requestGraphQl(
      patchColumnsMutation,
      {
        boardId,
        itemId,
        columnValues: JSON.stringify(columnValues),
      },
      logger,
    );
  }

  // Decide whether to post a human-readable update
  const isCreateAndUpdate = action === "created";
  const shouldPost =
    isCreateAndUpdate || (await shouldPostUpdate(itemId, logger));

  if (itemId && shouldPost && payload.summaryMarkdown) {
    const truncatedSummary = truncateLongText(
      payload.summaryMarkdown,
      MAX_LONG_TEXT_LENGTH,
    );
    const updateMutation = `
      mutation AddWeeklySummaryUpdate($itemId: ID!, $body: String!) {
        create_update(item_id: $itemId, body: $body) {
          id
        }
      }
    `;
    await requestGraphQl(
      updateMutation,
      { itemId, body: truncatedSummary },
      logger,
    );
    updatePosted = true;
    logger?.debug?.("Posted weekly summary update", { itemId, weekKey });
  }

  return { itemId, action, updatePosted };
};

/**
 * Search for an existing item on a board whose name contains the given search string.
 * Returns the item ID if found, or null if no match exists.
 *
 * Used by upsertBookedCallItem to avoid creating duplicate items when
 * existingItemId is not provided. Searches board items by name substring,
 * returning the first match found.
 *
 * @param boardId - The Monday.com board ID to search
 * @param nameSubstring - The string to match within item names (case-insensitive)
 * @param logger - Optional logger for debug output
 * @returns The item ID if a match is found, otherwise null
 */
const findExistingItemByBoardAndName = async (
  boardId: string,
  nameSubstring: string,
  logger?: Pick<Logger, "info" | "debug" | "warn" | "error">,
): Promise<string | null> => {
  const searchQuery = `
    query FindItemByBoardAndName($boardId: ID!, $searchTerm: String!) {
      boards(ids: [$boardId]) {
        items(limit: 100) {
          id
          name
        }
      }
    }
  `;

  try {
    const data = await requestGraphQl<{
      boards?: Array<{
        items?: Array<{ id: string; name: string }>;
      }>;
    }>(searchQuery, { boardId }, logger);

    const items = data.boards?.[0]?.items || [];
    const searchLower = nameSubstring.toLowerCase();

    // First pass: exact case-insensitive match
    for (const item of items) {
      if (item.name.toLowerCase() === searchLower) {
        return item.id;
      }
    }

    // Second pass: substring match (dedup: contact name match)
    for (const item of items) {
      if (item.name.toLowerCase().includes(searchLower)) {
        return item.id;
      }
    }
  } catch {
    logger?.warn?.(
      "Failed to search for existing Monday item; proceeding with create",
      {
        boardId,
        searchTerm: nameSubstring,
      },
    );
  }

  return null;
};

/**
 * Extract the contact name portion from a Monday item name.
 * Item names follow the format "Contact Name - ..." or just "Contact Name".
 * Returns the contact name or the full item name if no separator found.
 */
const extractContactNameFromItemName = (itemName: string): string => {
  const separatorIndex = itemName.indexOf(" - ");
  if (separatorIndex > 0) {
    return itemName.substring(0, separatorIndex).trim();
  }
  const bulletIndex = itemName.indexOf(" • ");
  if (bulletIndex > 0) {
    return itemName.substring(0, bulletIndex).trim();
  }
  return itemName.trim();
};

/**
 * Upsert a booked call / generic item with structured column updates.
 *
 * Phase 1 changes:
 * 1. Replaces unconditional create_update() dump with staleness-aware posting
 * 2. Column updates take priority over text updates
 * 3. Text truncation applied before storing in update body
 */
export const upsertBookedCallItem = async (
  boardId: string,
  payload: {
    itemName: string;
    updateMarkdown: string;
    columnValues?: Record<string, unknown>;
    existingItemId?: string | null;
  },
  logger?: Pick<Logger, "info" | "debug" | "warn" | "error">,
): Promise<{
  itemId: string;
  action: "created" | "updated";
  updatePosted: boolean;
}> => {
  const hasColumnValues = Boolean(
    payload.columnValues && Object.keys(payload.columnValues).length > 0,
  );
  const encodedColumnValues = hasColumnValues
    ? JSON.stringify(payload.columnValues)
    : null;

  let itemId = payload.existingItemId || null;
  let action: "created" | "updated" = payload.existingItemId
    ? "updated"
    : "created";
  let updatePosted = false;

  // DEDUP FIX: Before creating a new item, search for an existing one with the same contact name.
  // This prevents duplicate entries when existingItemId is not provided (e.g., backfill scripts).
  if (!itemId) {
    const contactName = extractContactNameFromItemName(payload.itemName);
    if (
      contactName &&
      contactName !== "Unknown Contact" &&
      contactName.length > 2
    ) {
      const foundItemId = await findExistingItemByBoardAndName(
        boardId,
        contactName,
        logger,
      );
      if (foundItemId) {
        itemId = foundItemId;
        action = "updated";
        logger?.info?.(
          "Found existing Monday item by name match; will update instead of creating duplicate",
          {
            boardId,
            contactName,
            itemId,
          },
        );
      }
    }
  }

  if (!itemId) {
    const createMutation = `
      mutation CreateBookedCallItem($boardId: ID!, $itemName: String!, $columnValues: JSON) {
        create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
          id
        }
      }
    `;

    try {
      const createData = await requestGraphQl<{
        create_item?: { id?: string };
      }>(
        createMutation,
        {
          boardId,
          itemName: payload.itemName,
          columnValues: encodedColumnValues,
        },
        logger,
      );
      itemId = createData.create_item?.id || null;
    } catch (error) {
      if (!hasColumnValues) throw error;
      logger?.warn?.(
        "Booked call create_item with column values failed; retrying without columns",
        error,
      );
      const createData = await requestGraphQl<{
        create_item?: { id?: string };
      }>(
        createMutation,
        {
          boardId,
          itemName: payload.itemName,
          columnValues: null,
        },
        logger,
      );
      itemId = createData.create_item?.id || null;
    }

    if (!itemId) throw new Error("Failed to create monday booked call item");
    action = "created";
  } else {
    // board_id is required by Monday API v2 for change_simple_column_value
    const renameMutation = `
      mutation RenameBookedCallItem($boardId: ID!, $itemId: ID!, $itemName: String!) {
        change_simple_column_value(board_id: $boardId, item_id: $itemId, column_id: "name", value: $itemName) {
          id
        }
      }
    `;
    try {
      await requestGraphQl(
        renameMutation,
        {
          boardId,
          itemId,
          itemName: payload.itemName,
        },
        logger,
      );
      action = "updated";
    } catch (error) {
      logger?.warn?.(
        "Booked call item rename failed; continuing with update body/columns",
        error,
      );
    }
  }

  let columnUpdateFailed = false;

  // Skip column update if we just created the item with columnValues already embedded.
  const alreadyAppliedColumns = action === "created" && hasColumnValues;
  if (itemId && hasColumnValues && !alreadyAppliedColumns) {
    const patchColumnsMutation = `
      mutation PatchBookedCallColumns($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
        change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) {
          id
        }
      }
    `;

    try {
      await requestGraphQl(
        patchColumnsMutation,
        {
          boardId,
          itemId,
          columnValues: encodedColumnValues,
        },
        logger,
      );
      action = "updated";
    } catch (error) {
      columnUpdateFailed = true;
      logger?.warn?.(
        "Booked call column update failed; item update will still be posted",
        error,
      );
    }
  }

  // Phase 1: Structured update with staleness check
  // Only post an update if:
  // - Item was just created (action === 'created'), OR
  // - The last update exceeds the cooldown period
  const shouldPost =
    action === "created" || (await shouldPostUpdate(itemId, logger));

  if (itemId && shouldPost) {
    let body = payload.updateMarkdown || "";

    // Apply truncation to prevent noise
    if (body.length > MAX_LONG_TEXT_LENGTH) {
      body = truncateLongText(body, MAX_LONG_TEXT_LENGTH);
    }

    // If column update failed, prepend warning
    if (columnUpdateFailed) {
      body = `${body}\n\n> Warning: monday column values could not be fully updated on this writeback attempt.`;
    }

    // Skip empty updates
    const trimmedBody = body.trim();
    if (trimmedBody.length > 0) {
      const updateMutation = `
        mutation AddBookedCallUpdate($itemId: ID!, $body: String!) {
          create_update(item_id: $itemId, body: $body) {
            id
          }
        }
      `;
      await requestGraphQl(
        updateMutation,
        { itemId, body: trimmedBody },
        logger,
      );
      updatePosted = true;
      logger?.debug?.("Posted item update", {
        itemId,
        bodyLength: trimmedBody.length,
      });
    }
  } else if (itemId && !shouldPost && action === "updated") {
    logger?.debug?.("Skipped update due to cooldown period", { itemId });
  }

  return { itemId, action, updatePosted };
};
