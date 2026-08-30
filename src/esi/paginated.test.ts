import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { fetchAllPagesStatus } from './paginated';
import { configureEsi, ESI_BASE_URL } from './client';
import { rejectBadEsiHeaders } from './test-helpers';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

describe('fetchAllPagesStatus', () => {
  it('returns a single page when X-Pages is absent', async () => {
    let requests = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/markets/10000002/orders`, ({ request }) => {
        const bad = rejectBadEsiHeaders(request);
        if (bad) return bad;
        requests += 1;
        return HttpResponse.json([{ order_id: 1 }]);
      })
    );

    const { items } = await fetchAllPagesStatus<{ order_id: number }>('/markets/10000002/orders');

    expect(items).toEqual([{ order_id: 1 }]);
    expect(requests).toBe(1);
  });

  it('fetches every page reported by X-Pages, in order, one at a time', async () => {
    const pagesRequested: number[] = [];
    let inFlight = 0;
    let maxInFlight = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/markets/10000002/orders`, async ({ request }) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        const page = Number(new URL(request.url).searchParams.get('page'));
        pagesRequested.push(page);
        await delay(10);
        inFlight -= 1;
        return HttpResponse.json([`item-${page}a`, `item-${page}b`], {
          headers: { 'X-Pages': '3' },
        });
      })
    );

    const { items } = await fetchAllPagesStatus<string>('/markets/10000002/orders');

    expect(pagesRequested).toEqual([1, 2, 3]);
    expect(maxInFlight).toBe(1);
    expect(items).toEqual(['item-1a', 'item-1b', 'item-2a', 'item-2b', 'item-3a', 'item-3b']);
  });

  it('passes auth and query options through to every page', async () => {
    configureEsi({ getToken: vi.fn(async (id: number) => `token-${id}`) });
    const authHeaders: Array<string | null> = [];
    server.use(
      http.get(`${ESI_BASE_URL}/characters/123/assets`, ({ request }) => {
        authHeaders.push(request.headers.get('authorization'));
        return HttpResponse.json([{ item_id: authHeaders.length }], {
          headers: { 'X-Pages': '2' },
        });
      })
    );

    const { items } = await fetchAllPagesStatus<{ item_id: number }>('/characters/123/assets', {
      characterId: 123,
    });

    expect(items).toHaveLength(2);
    expect(authHeaders).toEqual(['Bearer token-123', 'Bearer token-123']);
  });

  it('treats a 404 on a page after the first as end-of-data, keeping pages already fetched (BUG #7)', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/10000002/orders`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'));
        if (page >= 2) return new HttpResponse(null, { status: 404 });
        return HttpResponse.json([`item-${page}a`], { headers: { 'X-Pages': '3' } });
      })
    );

    const { items } = await fetchAllPagesStatus<string>('/markets/10000002/orders');

    expect(items).toEqual(['item-1a']);
  });

  it('still throws on a 404 for the first page', async () => {
    server.use(
      http.get(
        `${ESI_BASE_URL}/markets/10000002/orders`,
        () => new HttpResponse(null, { status: 404 })
      )
    );

    await expect(fetchAllPagesStatus<string>('/markets/10000002/orders')).rejects.toThrow();
  });
});

/**
 * D4: a short list used to be indistinguishable from a complete one, so a
 * truncated view rendered under a fresh DataAgeBadge as if it were whole.
 */
describe('fetchAllPagesStatus', () => {
  function pagedHandler(totalPages: number, failFrom?: number) {
    return http.get(`${ESI_BASE_URL}/markets/10000002/orders`, ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get('page'));
      if (failFrom !== undefined && page >= failFrom)
        return new HttpResponse(null, { status: 404 });
      return HttpResponse.json([`item-${page}`], { headers: { 'X-Pages': String(totalPages) } });
    });
  }

  it('reports a single-page result as complete', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/10000002/orders`, () => HttpResponse.json(['only-item']))
    );

    const result = await fetchAllPagesStatus<string>('/markets/10000002/orders');

    expect(result).toEqual({
      items: ['only-item'],
      truncated: false,
      pagesFetched: 1,
      pagesReported: 1,
    });
  });

  it('reports a fully fetched multi-page result as complete', async () => {
    server.use(pagedHandler(3));

    const result = await fetchAllPagesStatus<string>('/markets/10000002/orders');

    expect(result).toEqual({
      items: ['item-1', 'item-2', 'item-3'],
      truncated: false,
      pagesFetched: 3,
      pagesReported: 3,
    });
  });

  it('reports truncated when the page cap stops the fetch short', async () => {
    server.use(pagedHandler(4));

    const result = await fetchAllPagesStatus<string>('/markets/10000002/orders', { maxPages: 2 });

    expect(result).toEqual({
      items: ['item-1', 'item-2'],
      truncated: true,
      pagesFetched: 2,
      pagesReported: 4,
    });
  });

  it('reports truncated but keeps the pages it got when a later page fails', async () => {
    server.use(pagedHandler(3, 3));

    const result = await fetchAllPagesStatus<string>('/markets/10000002/orders');

    expect(result).toEqual({
      items: ['item-1', 'item-2'],
      truncated: true,
      pagesFetched: 2,
      pagesReported: 3,
    });
  });

  it('reports complete when the cap is never reached', async () => {
    server.use(pagedHandler(2));

    const result = await fetchAllPagesStatus<string>('/markets/10000002/orders', { maxPages: 5 });

    expect(result.truncated).toBe(false);
    expect(result.items).toEqual(['item-1', 'item-2']);
  });
});
