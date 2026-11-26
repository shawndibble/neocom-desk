import { esiFetch, EsiError, attachEndpointId, recordEsiActivity, outcomeForError } from './client';
import type { EsiFetchOptions } from './client';
import { currentEsiLane } from './lane';

export interface TruncatableResult<T> {
  items: T[];
  truncated: boolean;
}

export interface PaginatedResult<T> extends TruncatableResult<T> {
  pagesFetched: number;
  pagesReported: number;
  pageResponses?: PageResponse<T>[];
  expires?: string | null;
}

export interface PageResponse<T> {
  items: T[] | null;
  etag: string | null;
  notModified: boolean;
}

export interface FetchAllPagesOptions extends Omit<EsiFetchOptions, 'page' | 'etag'> {
  maxPages?: number;
  pageEtags?: ReadonlyArray<string | undefined>;
}

export const PAGE_FETCH_CONCURRENCY = 4;

export async function fetchAllPagesStatus<T>(
  path: string,
  options: FetchAllPagesOptions = {}
): Promise<PaginatedResult<T>> {
  const { maxPages, endpointId, characterId, pageEtags, ...rest } = options;
  const fetchOptions = { ...rest, characterId, lane: rest.lane ?? currentEsiLane() };
  const fetchPage = (page: number): Promise<PageResponse<T>> =>
    esiFetch<T[]>(path, { ...fetchOptions, page, etag: pageEtags?.[page - 1] }).then((result) => ({
      items: result.data,
      etag: result.etag,
      notModified: result.notModified,
    }));
  try {
    let first = await esiFetch<T[]>(path, { ...fetchOptions, page: 1, etag: pageEtags?.[0] });
    if (first.notModified && first.pages === 1 && (pageEtags?.length ?? 0) > 1) {
      first = await esiFetch<T[]>(path, { ...fetchOptions, page: 1 });
    }
    const responses: PageResponse<T>[] = [
      { items: first.data, etag: first.etag, notModified: first.notModified },
    ];
    const lastPage = maxPages === undefined ? first.pages : Math.min(first.pages, maxPages);
    responses.push(...(await fetchRemainingPages<T>(fetchPage, lastPage)));
    const items: T[] = [];
    let pagesFetched = 0;
    for (const response of responses) {
      if (!response.items && !response.notModified) continue;
      items.push(...(response.items ?? []));
      pagesFetched += 1;
    }
    recordEsiActivity(endpointId, characterId, 'success');
    return {
      items,
      truncated: pagesFetched < first.pages,
      pagesFetched,
      pagesReported: first.pages,
      ...(first.expires ? { expires: first.expires } : {}),
      ...(pageEtags ? { pageResponses: responses } : {}),
    };
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') throw err;
    recordEsiActivity(endpointId, characterId, outcomeForError(err));
    attachEndpointId(err, endpointId);
    throw err;
  }
}

type PageOutcome<T> = { ok: true; response: PageResponse<T> } | { ok: false; error: unknown };

async function fetchRemainingPages<T>(
  fetchPage: (page: number) => Promise<PageResponse<T>>,
  lastPage: number
): Promise<PageResponse<T>[]> {
  const outcomes = new Map<number, PageOutcome<T>>();
  let next = 2;
  let stopped = false;

  async function worker(): Promise<void> {
    while (!stopped && next <= lastPage) {
      const page = next;
      next += 1;
      try {
        outcomes.set(page, { ok: true, response: await fetchPage(page) });
      } catch (error) {
        outcomes.set(page, { ok: false, error });
        stopped = true;
      }
    }
  }
  const workers = Math.min(PAGE_FETCH_CONCURRENCY, Math.max(0, lastPage - 1));
  await Promise.all(Array.from({ length: workers }, () => worker()));

  const pages: PageResponse<T>[] = [];
  for (let page = 2; page <= lastPage; page += 1) {
    const outcome = outcomes.get(page);
    if (!outcome) break;
    if (!outcome.ok) {
      if (outcome.error instanceof EsiError && outcome.error.status === 404) break;
      throw outcome.error;
    }
    pages.push(outcome.response);
  }
  return pages;
}
