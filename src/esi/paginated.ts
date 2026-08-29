import { esiFetch, EsiError } from './client';
import type { EsiFetchOptions } from './client';

/**
 * Fetch every page of a paginated ESI list endpoint (X-Pages), strictly
 * sequentially (concurrency 1) to stay friendly to ESI rate limits.
 * `page` and `etag` options are ignored — all pages are always fetched fresh.
 */
export async function fetchAllPages<T>(
  path: string,
  options: Omit<EsiFetchOptions, 'page' | 'etag'> = {}
): Promise<T[]> {
  const first = await esiFetch<T[]>(path, { ...options, page: 1 });
  const items: T[] = [...(first.data ?? [])];
  for (let page = 2; page <= first.pages; page += 1) {
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
  return items;
}
