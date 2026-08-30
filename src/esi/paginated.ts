import { esiFetch, EsiError } from './client';
import type { EsiFetchOptions } from './client';

/**
 * Outcome of a paginated fetch: the data plus the one bit a caller cannot
 * otherwise recover — is this list complete? Mirrors the `StatusResult` idiom
 * in `esi/cache.ts`.
 */
export interface TruncatableResult<T> {
  items: T[];
  /**
   * `items` is a partial list; callers must not present it as the whole thing.
   * Also set by the cursored (non X-Pages) wallet-transactions fetch.
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
   * then `truncated`. Off by default — a cap would *create* truncation rather
   * than report it.
   */
  maxPages?: number;
}

/**
 * Fetch every page of an X-Pages ESI list, strictly sequentially to stay
 * friendly to rate limits. `page`/`etag` are ignored — always fetched fresh.
 *
 * `truncated` is derived from pages collected vs. pages advertised, not from
 * which early-exit ran, so a mid-pagination 404, an empty body and the
 * `maxPages` cap all report identically.
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
      // A 404 after page 1 means the list shrank between the X-Pages count
      // and this request: end-of-data, keep what was collected. Anything else
      // throws — partial data over a good cache entry is worse than the entry.
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
