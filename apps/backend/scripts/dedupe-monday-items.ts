import 'dotenv/config';

type MondayColumn = { id: string; title: string; type: string };
type MondayItem = {
  id: string;
  name: string;
  updated_at: string;
  column_values: Array<{ id: string; text: string | null; value: string | null }>;
};

const MONDAY_API_TOKEN = (process.env.MONDAY_API_TOKEN || '').trim();
if (!MONDAY_API_TOKEN) {
  throw new Error('MONDAY_API_TOKEN is required');
}

const boardId = (process.env.MONDAY_BOARD_ID || process.argv[2] || '').trim();
if (!boardId) {
  throw new Error('Provide board id via MONDAY_BOARD_ID or first arg');
}

if (boardId === '5077164868') {
  throw new Error('Safety stop: board 5077164868 is protected and cannot be modified by this script.');
}

const apply = process.argv.includes('--apply');

const mondayRequest = async <T>(query: string, variables: Record<string, unknown>) => {
  const res = await fetch('https://api.monday.com/v2', {
    method: 'POST',
    headers: {
      Authorization: MONDAY_API_TOKEN,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });
  const payload = (await res.json()) as { data?: T; errors?: Array<{ message?: string }> };
  if (!res.ok || payload.errors?.length || !payload.data) {
    throw new Error(payload.errors?.map((e) => e.message).filter(Boolean).join('; ') || `Monday API failed (${res.status})`);
  }
  return payload.data;
};

const normalize = (v: string | null | undefined) => (v || '').trim().toLowerCase();

const main = async () => {
  const columnsData = await mondayRequest<{ boards: Array<{ columns: MondayColumn[] }> }>(
    `query($id:[ID!]){boards(ids:$id){columns{id title type}}}`,
    { id: [boardId] },
  );
  const columns = columnsData.boards?.[0]?.columns || [];
  const callDateColumn = columns.find((c) => /call\s*date|date/i.test(c.title));
  const setterColumn = columns.find((c) => /set\s*by|setter|owner|people/i.test(c.title));

  let cursor: string | null = null;
  const items: MondayItem[] = [];
  do {
    const query: string = cursor
      ? `query($cursor:String!){next_items_page(cursor:$cursor,limit:500){cursor items{id name updated_at column_values{id text value}}}}`
      : `query($id:[ID!]){boards(ids:$id){items_page(limit:500){cursor items{id name updated_at column_values{id text value}}}}}`;
    const data: {
      boards?: Array<{ items_page?: { cursor: string | null; items: MondayItem[] } }>;
      next_items_page?: { cursor: string | null; items: MondayItem[] };
    } = await mondayRequest(query, cursor ? { cursor } : { id: [boardId] });
    const page: { cursor: string | null; items: MondayItem[] } | undefined = cursor
      ? data.next_items_page
      : data.boards?.[0]?.items_page;
    const batch = page?.items || [];
    items.push(...batch);
    cursor = page?.cursor || null;
  } while (cursor);

  const groups = new Map<string, MondayItem[]>();
  for (const item of items) {
    const byId = new Map(item.column_values.map((v) => [v.id, v]));
    const dateVal = callDateColumn ? byId.get(callDateColumn.id)?.text || '' : '';
    const setterVal = setterColumn ? byId.get(setterColumn.id)?.text || '' : '';
    const key = `${normalize(item.name)}|${normalize(dateVal)}|${normalize(setterVal)}`;
    const arr = groups.get(key) || [];
    arr.push(item);
    groups.set(key, arr);
  }

  const duplicates: Array<{ keep: MondayItem; remove: MondayItem[]; key: string }> = [];
  for (const [key, arr] of groups.entries()) {
    if (arr.length < 2) continue;
    arr.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
    duplicates.push({ key, keep: arr[0], remove: arr.slice(1) });
  }

  const toArchive = duplicates.flatMap((d) => d.remove);
  console.log(`Board ${boardId}: found ${duplicates.length} duplicate groups; ${toArchive.length} duplicate items.`);

  if (!apply) {
    for (const d of duplicates.slice(0, 25)) {
      console.log(`KEEP ${d.keep.id} | REMOVE ${d.remove.map((r) => r.id).join(', ')} | KEY ${d.key}`);
    }
    console.log('Dry run only. Re-run with --apply to archive duplicate items.');
    return;
  }

  let archived = 0;
  for (const item of toArchive) {
    await mondayRequest<{ archive_item: { id: string } }>(
      `mutation($itemId:ID!){archive_item(item_id:$itemId){id}}`,
      { itemId: item.id },
    );
    archived += 1;
  }
  console.log(`Archived ${archived} duplicate items on board ${boardId}.`);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
