export interface CursorPage<T> {
  cursor?: { after?: string };
  items: readonly T[];
}

const DEFAULT_MAX_PAGES = 20;

export async function walkCursorPages<T>(
  readPage: (after: string | undefined) => Promise<CursorPage<T>>,
  maxPages = DEFAULT_MAX_PAGES
): Promise<T[]> {
  const items: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page += 1) {
    const result = await readPage(after);
    items.push(...result.items);
    const next = result.cursor?.after;
    if (result.items.length === 0 || next === undefined) return items;
    if (next === after) throw new Error('ESI cursor did not move');
    after = next;
  }
  throw new Error(`ESI cursor list ran past ${maxPages} pages`);
}
