import { esiFetch, EsiError } from './client';
import type { EsiFetchOptions } from './client';
import type { Capped } from '@/lib/cap';

/**
 * Fetch every page of a paginated ESI list endpoint (X-Pages), strictly
 * sequentially (concurrency 1) to stay friendly to ESI rate limits.
 * `page` and `etag` options are ignored — all pages are always fetched fresh.
 */
export async function fetchAllPages<T>(
  path: string,
  options: Omit<EsiFetchOptions, 'page' | 'etag'> = {}
): Promise<T[]> {
  return (await fetchPages<T>(path, options, Infinity)).items;
}

/**
 * Like `fetchAllPages`, but stops after `maxPages` and reports whether more
 * pages existed — for endpoints where a character's data can grow large
 * enough that fetching all of it isn't worth the ESI round trips.
 */
export async function fetchAllPagesCapped<T>(
  path: string,
  maxPages: number,
  options: Omit<EsiFetchOptions, 'page' | 'etag'> = {}
): Promise<Capped<T>> {
  return fetchPages<T>(path, options, maxPages);
}

async function fetchPages<T>(
  path: string,
  options: Omit<EsiFetchOptions, 'page' | 'etag'>,
  maxPages: number
): Promise<Capped<T>> {
  const first = await esiFetch<T[]>(path, { ...options, page: 1 });
  const items: T[] = [...(first.data ?? [])];
  const lastPage = Math.min(first.pages, maxPages);
  for (let page = 2; page <= lastPage; page += 1) {
    try {
      const result = await esiFetch<T[]>(path, { ...options, page });
      if (result.data) items.push(...result.data);
    } catch (err) {
      // BUG #7: a 404 on a page after the first (data changed/shrank between
      // the X-Pages count and this request, e.g. items were deleted) means
      // "no more data here" — treat it as end-of-data and keep whatever was
      // already collected, rather than discarding every page fetched so far.
      if (err instanceof EsiError && err.status === 404) break;
      throw err;
    }
  }
  return { items, truncated: first.pages > lastPage };
}
