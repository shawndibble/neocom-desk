/**
 * Walk one of ESI's cursor-paged lists (the 2026 routes: `?after=` instead of
 * `X-Pages`) forward to its end: each page's `cursor.after` asks for the next,
 * and the end answers an empty page (or no `after`). A page that fails throws,
 * so a caller caching the walk never stores half a list. A cursor that does
 * not move, or more than `maxPages` pages, stops the walk rather than looping.
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
    if (result.items.length === 0 || next === undefined || next === after) break;
    after = next;
  }
  return items;
}
