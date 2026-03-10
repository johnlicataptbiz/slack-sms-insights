import type { Logger } from '@slack/bolt';

const MONDAY_API_URL = 'https://api.monday.com/v2';
const DEFAULT_TIMEOUT_MS = Number.parseInt(process.env.MONDAY_API_TIMEOUT_MS || '12000', 10);
const DEFAULT_MAX_RETRIES = Number.parseInt(process.env.MONDAY_API_MAX_RETRIES || '2', 10);
const DEFAULT_RETRY_BASE_MS = Number.parseInt(process.env.MONDAY_API_RETRY_BASE_MS || '500', 10);

const sleep = async (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
            .join('; ') || `Monday API request failed with status ${response.status}`;
        throw new Error(errMsg);
      }

      if (!payload.data) throw new Error('Monday API returned empty data payload');
      return payload.data;
    } catch (error) {
      attempt += 1;
      const canRetry = attempt <= DEFAULT_MAX_RETRIES;
      logger?.warn?.('Monday API request failed', { attempt, canRetry, error: String(error) });
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
  const data = await requestGraphQl<{ boards?: Array<{ columns?: MondayBoardColumn[] }> }>(
    query,
    { boardId: [boardId] },
    logger,
  );
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
  await requestGraphQl(updateMutation, { itemId, body: payload.summaryMarkdown }, logger);

  return { itemId, action };
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
  const hasColumnValues = Boolean(payload.columnValues && Object.keys(payload.columnValues).length > 0);
  const encodedColumnValues = hasColumnValues ? JSON.stringify(payload.columnValues) : null;

  let itemId = payload.existingItemId || null;
  let action: 'created' | 'updated' = payload.existingItemId ? 'updated' : 'created';

  if (!itemId) {
    const createMutation = `
      mutation CreateBookedCallItem($boardId: ID!, $itemName: String!, $columnValues: JSON) {
        create_item(board_id: $boardId, item_name: $itemName, column_values: $columnValues) {
          id
        }
      }
    `;

    try {
      const createData = await requestGraphQl<{ create_item?: { id?: string } }>(
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
      logger?.warn?.('Booked call create_item with column values failed; retrying without columns', error);
      const createData = await requestGraphQl<{ create_item?: { id?: string } }>(
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
  } else {
    const renameMutation = `
      mutation RenameBookedCallItem($itemId: ID!, $itemName: String!) {
        change_simple_column_value(item_id: $itemId, column_id: "name", value: $itemName) {
          id
        }
      }
    `;
    try {
      await requestGraphQl(
        renameMutation,
        {
          itemId,
          itemName: payload.itemName,
        },
        logger,
      );
      action = 'updated';
    } catch (error) {
      logger?.warn?.('Booked call item rename failed; continuing with update body/columns', error);
    }
  }

  if (itemId && hasColumnValues) {
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
      logger?.warn?.('Booked call column update failed; item update will still be posted', error);
    }
  }

  const updateMutation = `
    mutation AddBookedCallUpdate($itemId: ID!, $body: String!) {
      create_update(item_id: $itemId, body: $body) {
        id
      }
    }
  `;
  await requestGraphQl(updateMutation, { itemId, body: payload.updateMarkdown }, logger);

  return { itemId, action };
};
