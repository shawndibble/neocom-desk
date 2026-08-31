import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { fetchAllPages, fetchAllPagesCapped } from './paginated';
import { configureEsi, ESI_BASE_URL } from './client';
import { rejectBadEsiHeaders } from './test-helpers';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

describe('fetchAllPages', () => {
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

    const items = await fetchAllPages<{ order_id: number }>('/markets/10000002/orders');

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

    const items = await fetchAllPages<string>('/markets/10000002/orders');

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

    const items = await fetchAllPages<{ item_id: number }>('/characters/123/assets', {
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

    const items = await fetchAllPages<string>('/markets/10000002/orders');

    expect(items).toEqual(['item-1a']);
  });

  it('still throws on a 404 for the first page', async () => {
    server.use(
      http.get(
        `${ESI_BASE_URL}/markets/10000002/orders`,
        () => new HttpResponse(null, { status: 404 })
      )
    );

    await expect(fetchAllPages<string>('/markets/10000002/orders')).rejects.toThrow();
  });
});

describe('fetchAllPagesCapped', () => {
  it('reports untruncated when every page fits under the cap', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/10000002/orders`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'));
        return HttpResponse.json([`item-${page}`], { headers: { 'X-Pages': '2' } });
      })
    );

    const result = await fetchAllPagesCapped<string>('/markets/10000002/orders', 5);

    expect(result).toEqual({ items: ['item-1', 'item-2'], truncated: false });
  });

  it('reports untruncated when the page count exactly equals the cap', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/10000002/orders`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'));
        return HttpResponse.json([`item-${page}`], { headers: { 'X-Pages': '3' } });
      })
    );

    const result = await fetchAllPagesCapped<string>('/markets/10000002/orders', 3);

    expect(result).toEqual({ items: ['item-1', 'item-2', 'item-3'], truncated: false });
  });

  it('stops at the cap and reports truncated when more pages exist', async () => {
    const pagesRequested: number[] = [];
    server.use(
      http.get(`${ESI_BASE_URL}/markets/10000002/orders`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'));
        pagesRequested.push(page);
        return HttpResponse.json([`item-${page}`], { headers: { 'X-Pages': '5' } });
      })
    );

    const result = await fetchAllPagesCapped<string>('/markets/10000002/orders', 2);

    expect(pagesRequested).toEqual([1, 2]);
    expect(result).toEqual({ items: ['item-1', 'item-2'], truncated: true });
  });

  it('treats a 404 on a later page as end-of-data, not as a truncation (BUG #7 parity)', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/10000002/orders`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page'));
        if (page >= 2) return new HttpResponse(null, { status: 404 });
        return HttpResponse.json([`item-${page}`], { headers: { 'X-Pages': '3' } });
      })
    );

    const result = await fetchAllPagesCapped<string>('/markets/10000002/orders', 10);

    expect(result).toEqual({ items: ['item-1'], truncated: false });
  });
});
