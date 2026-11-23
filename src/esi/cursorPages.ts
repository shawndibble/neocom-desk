/**
 * Walk one of ESI's cursor-paged lists (the 2026 routes: `?after=` instead of
 * `X-Pages`) forward to its end: each page's `cursor.after` asks for the next,
 * and the end answers an empty page (or no `after`). A page that fails throws,
 * so a caller caching the walk never stores half a list; so does a cursor that
 * does not move, or a list longer than `maxPages` pages, rather than loop or
 * hand back a short list as whole.
 */
export interface CursorPage<T> {
  cursor?: { after?: string };
  items: readonly T[];
}

/** Bounds a bad cursor; no list the app walks comes near it. */
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
