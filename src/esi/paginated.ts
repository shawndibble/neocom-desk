import { esiFetch } from './client';
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
    const result = await esiFetch<T[]>(path, { ...options, page });
    if (result.data) items.push(...result.data);
  }
  return items;
}
