import { esiFetch, EsiError, attachEndpointId, recordEsiActivity, outcomeForError } from './client';
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
 * Pages 2..N in flight at once. Small on purpose: this is one read, and a
 * dozen of them run side by side on a busy boot. Each page still takes (and
 * returns) its own `esi/budget.ts` permit inside `esiFetch`, so no permit is
 * held across the walk and the app-wide ceiling cannot deadlock on it.
 */
export const PAGE_FETCH_CONCURRENCY = 4;

/**
 * Fetch every page of an X-Pages ESI list. Page 1 goes alone (it carries the
 * page count); pages 2..N then run `PAGE_FETCH_CONCURRENCY` at a time and are
 * reassembled in page order. `page`/`etag` are ignored — always fetched fresh.
 *
 * Same outcome as a strictly sequential walk: a 404 after page 1 means the
 * list shrank between the X-Pages count and that request, so it ends the data
 * — pages *after* it are discarded even if they answered, and no new page is
 * dispatched once one is seen. Any other failure on a page the sequential walk
 * would have reached (one before the first 404) throws, after the pages
 * already in flight settle.
 *
 * `truncated` is derived from pages collected vs. pages advertised, not from
 * which early-exit ran, so a mid-pagination 404, an empty body and the
 * `maxPages` cap all report identically.
 *
 * Logs one activity entry for the whole read, not one per page: `endpointId`
 * is withheld from the per-page `esiFetch` calls and recorded once here
 * instead, so a 25-page asset list doesn't crowd 25 near-identical rows into
 * the bounded activity buffer.
 */
export async function fetchAllPagesStatus<T>(
  path: string,
  options: FetchAllPagesOptions = {}
): Promise<PaginatedResult<T>> {
  const { maxPages, endpointId, characterId, ...rest } = options;
  const fetchOptions = { ...rest, characterId };
  try {
    const first = await esiFetch<T[]>(path, { ...fetchOptions, page: 1 });
    const items: T[] = [...(first.data ?? [])];
    let pagesFetched = first.data ? 1 : 0;
    const lastPage = maxPages === undefined ? first.pages : Math.min(first.pages, maxPages);
    for (const data of await fetchRemainingPages<T>(path, fetchOptions, lastPage)) {
      if (data) {
        items.push(...data);
        pagesFetched += 1;
      }
    }
    recordEsiActivity(endpointId, characterId, 'success');
    return {
      items,
      truncated: pagesFetched < first.pages,
      pagesFetched,
      pagesReported: first.pages,
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    recordEsiActivity(endpointId, characterId, outcomeForError(err));
    attachEndpointId(err, endpointId);
    throw err;
  }
}

type PageOutcome<T> = { ok: true; data: T[] | null } | { ok: false; error: unknown };

/**
 * Pages 2..`lastPage`, in page order, cut at the first 404. Workers never
 * reject: each page's outcome is recorded, so a failure cannot leave sibling
 * requests running unobserved behind an early throw.
 */
async function fetchRemainingPages<T>(
  path: string,
  fetchOptions: Omit<EsiFetchOptions, 'page' | 'etag'>,
  lastPage: number
): Promise<Array<T[] | null>> {
  const outcomes = new Map<number, PageOutcome<T>>();
  let next = 2;
  let stopped = false;

  async function worker(): Promise<void> {
    while (!stopped && next <= lastPage) {
      const page = next;
      next += 1;
      try {
        const result = await esiFetch<T[]>(path, { ...fetchOptions, page });
        outcomes.set(page, { ok: true, data: result.data });
      } catch (error) {
        outcomes.set(page, { ok: false, error });
        // A 404 ends the data and anything else will throw: either way no
        // later page can be used, so stop dispatching them.
        stopped = true;
      }
    }
  }
  const workers = Math.min(PAGE_FETCH_CONCURRENCY, Math.max(0, lastPage - 1));
  await Promise.all(Array.from({ length: workers }, () => worker()));

  const pages: Array<T[] | null> = [];
  for (let page = 2; page <= lastPage; page += 1) {
    const outcome = outcomes.get(page);
    // Never dispatched: an earlier page stopped the walk, and the loop below
    // has already returned or thrown on it.
    if (!outcome) break;
    if (!outcome.ok) {
      // A 404 after page 1 means the list shrank between the X-Pages count
      // and this request: end-of-data, keep what was collected. Anything else
      // throws — partial data over a good cache entry is worse than the entry.
      if (outcome.error instanceof EsiError && outcome.error.status === 404) break;
      throw outcome.error;
    }
    pages.push(outcome.data);
  }
  return pages;
}
