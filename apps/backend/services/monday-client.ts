import type { Logger } from '@slack/bolt';

const MONDAY_API_URL = 'https://api.monday.com/v2';
const DEFAULT_TIMEOUT_MS = Number.parseInt(
  process.env.MONDAY_API_TIMEOUT_MS || '12000',
  10,
);
const DEFAULT_MAX_RETRIES = Number.parseInt(
  process.env.MONDAY_API_MAX_RETRIES || '2',
  10,
);
const DEFAULT_RETRY_BASE_MS = Number.parseInt(
  process.env.MONDAY_API_RETRY_BASE_MS || '500',
  10,
);

const sleep = async (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const getMondayToken = (): string => {
  const token = (process.env.MONDAY_API_TOKEN || '').trim();
  if (!token) {
    throw new Error('MONDAY_API_TOKEN is not configured');
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
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<T> => {
  const token = getMondayToken();
  let attempt = 0;

  while (true) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(MONDAY_API_URL, {
        method: 'POST',
        headers: {
          Authorization: token,
          'Content-Type': 'application/json',
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
            .join('; ') ||
          `Monday API request failed with status ${response.status}`;
        throw new Error(errMsg);
      }

      if (!payload.data)
        throw new Error('Monday API returned empty data payload');
      return payload.data;
    } catch (_error) {
      attempt += 1;
      const canRetry = attempt <= DEFAULT_MAX_RETRIES;
      logger?.warn?.('Monday API request failed', {
        attempt,
        canRetry,
        error: String(error),
      });
      if (!canRetry) {
        logger?.error?.('Monday API request exhausted retries', error);
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
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
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
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
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

export const upsertWeeklySummaryItem = async (
  boardId: string,
  weekKey: string,
  payload: {
    title: string;
    summaryMarkdown: string;
    columnValues?: Record<string, unknown>;
    existingItemId?: string | null;
  },
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<{ itemId: string; action: 'created' | 'updated' }> => {
  const itemName = payload.title || `PTBizSMS Weekly Summary - ${weekKey}`;
  let itemId = payload.existingItemId || null;
  let action: 'created' | 'updated' = 'updated';

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
    if (!itemId) throw new Error('Failed to create monday weekly summary item');
    action = 'created';
  }

  const updateMutation = `
    mutation AddWeeklySummaryUpdate($itemId: ID!, $body: String!) {
      create_update(item_id: $itemId, body: $body) {
        id
      }
    }
  `;
  await requestGraphQl(
    updateMutation,
    { itemId, body: payload.summaryMarkdown },
    logger,
  );

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

  return { itemId, action };
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
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
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
      'Failed to search for existing Monday item; proceeding with create',
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
  const separatorIndex = itemName.indexOf(' - ');
  if (separatorIndex > 0) {
    return itemName.substring(0, separatorIndex).trim();
  }
  const bulletIndex = itemName.indexOf(' • ');
  if (bulletIndex > 0) {
    return itemName.substring(0, bulletIndex).trim();
  }
  return itemName.trim();
};

export const upsertBookedCallItem = async (
  boardId: string,
  payload: {
    itemName: string;
    updateMarkdown: string;
    columnValues?: Record<string, unknown>;
    existingItemId?: string | null;
  },
  logger?: Pick<Logger, 'info' | 'debug' | 'warn' | 'error'>,
): Promise<{ itemId: string; action: 'created' | 'updated' }> => {
  const hasColumnValues = Boolean(
    payload.columnValues && Object.keys(payload.columnValues).length > 0,
  );
  const encodedColumnValues = hasColumnValues
    ? JSON.stringify(payload.columnValues)
    : null;

  let itemId = payload.existingItemId || null;
  let action: 'created' | 'updated' = payload.existingItemId
    ? 'updated'
    : 'created';

  // DEDUP FIX: Before creating a new item, search for an existing one with the same contact name.
  // This prevents duplicate entries when existingItemId is not provided (e.g., backfill scripts).
  if (!itemId) {
    const contactName = extractContactNameFromItemName(payload.itemName);
    if (
      contactName &&
      contactName !== 'Unknown Contact' &&
      contactName.length > 2
    ) {
      const foundItemId = await findExistingItemByBoardAndName(
        boardId,
        contactName,
        logger,
      );
      if (foundItemId) {
        itemId = foundItemId;
        action = 'updated';
        logger?.info?.(
          'Found existing Monday item by name match; will update instead of creating duplicate',
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
        'Booked call create_item with column values failed; retrying without columns',
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

    if (!itemId) throw new Error('Failed to create monday booked call item');
    action = 'created';
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
      action = 'updated';
    } catch (error) {
      logger?.warn?.(
        'Booked call item rename failed; continuing with update body/columns',
        error,
      );
    }
  }

  let columnUpdateFailed = false;

  // Skip column update if we just created the item with columnValues already embedded.
  const alreadyAppliedColumns = action === 'created' && hasColumnValues;
  if (itemId && hasColumnValues && !alreadyAppliedColumns) {
    // create_labels_if_missing: true auto-creates status labels that don't yet exist on the board,
    // preventing "invalid value" errors when new label values are introduced.
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
      action = 'updated';
    } catch (error) {
      columnUpdateFailed = true;
      logger?.warn?.(
        'Booked call column update failed; item update will still be posted',
        error,
      );
    }
  }

  const updateBodyPrefix = columnUpdateFailed
    ? `${payload.updateMarkdown}\n\n> Warning: monday column values could not be fully updated on this writeback attempt.`
    : payload.updateMarkdown;

  const updateMutation = `
    mutation AddBookedCallUpdate($itemId: ID!, $body: String!) {
      create_update(item_id: $itemId, body: $body) {
        id
      }
    }
  `;
  await requestGraphQl(
    updateMutation,
    { itemId, body: updateBodyPrefix },
    logger,
  );

  return { itemId, action };
};
