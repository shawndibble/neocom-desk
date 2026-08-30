import { esiFetch, EsiError } from './client';
import type { EsiFetchOptions } from './client';

/**
 * Outcome of a paginated fetch. Mirrors the `StatusResult` idiom in
 * `esi/cache.ts`: the data plus the one bit the caller can't otherwise
 * recover — here "is this list complete?".
 */
export interface TruncatableResult<T> {
  items: T[];
  /**
   * D4: the fetch came up short, so `items` is a partial list. Callers must
   * not present it as the whole thing. Also used by the cursored (non
   * X-Pages) wallet-transactions fetch in `endpoints.ts`.
   */
  truncated: boolean;
}

export interface PaginatedResult<T> extends TruncatableResult<T> {
  /** Pages whose data actually made it into `items`. */
  pagesFetched: number;
  /** Pages the first response advertised via X-Pages (1 when unpaginated). */
  pagesReported: number;
}

export interface FetchAllPagesOptions extends Omit<EsiFetchOptions, 'page' | 'etag'> {
  /**
   * Stop after this many pages even if X-Pages reports more; the result is
   * then `truncated`. Off by default — no endpoint caps itself today, and
   * adding a cap would *create* truncation rather than report it.
   */
  maxPages?: number;
}

/**
 * Fetch every page of a paginated ESI list endpoint (X-Pages), strictly
 * sequentially (concurrency 1) to stay friendly to ESI rate limits.
 * `page` and `etag` options are ignored — all pages are always fetched fresh.
 *
 * D4: `truncated` is derived from pages actually collected vs. pages
 * advertised, not from which early-exit path ran, so every way of coming up
 * short reports the same way: a mid-pagination 404, a page that returned no
 * body, or the optional `maxPages` cap.
 */
export async function fetchAllPagesStatus<T>(
  path: string,
  options: FetchAllPagesOptions = {}
): Promise<PaginatedResult<T>> {
  const { maxPages, ...fetchOptions } = options;
  const first = await esiFetch<T[]>(path, { ...fetchOptions, page: 1 });
  const items: T[] = [...(first.data ?? [])];
  let pagesFetched = first.data ? 1 : 0;
  const lastPage = maxPages === undefined ? first.pages : Math.min(first.pages, maxPages);
  for (let page = 2; page <= lastPage; page += 1) {
    try {
      const result = await esiFetch<T[]>(path, { ...fetchOptions, page });
      if (result.data) {
        items.push(...result.data);
        pagesFetched += 1;
      }
    } catch (err) {
      // BUG #7: a 404 on a page after the first (data changed/shrank between
      // the X-Pages count and this request, e.g. items were deleted) means
      // "no more data here" — treat it as end-of-data and keep whatever was
      // already collected, rather than discarding every page fetched so far.
      // Any other error still throws: partial data written over a good cache
      // entry would be worse than falling back to that entry.
      if (err instanceof EsiError && err.status === 404) break;
      throw err;
    }
  }
  return {
    items,
    truncated: pagesFetched < first.pages,
    pagesFetched,
    pagesReported: first.pages,
  };
}

/**
 * Items only, for callers that don't surface completeness. Compatible entry
 * point kept for the same reason `loadWithCache` sits next to
 * `loadWithCacheStatus`.
 */
export async function fetchAllPages<T>(
  path: string,
  options: FetchAllPagesOptions = {}
): Promise<T[]> {
  return (await fetchAllPagesStatus<T>(path, options)).items;
}
