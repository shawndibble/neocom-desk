import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { fetchAllPagesStatus, PAGE_FETCH_CONCURRENCY } from './paginated';
import { configureEsi, ESI_BASE_URL } from './client';
import { rejectBadEsiHeaders } from './test-helpers';
import { onEsiActivity, type ActivityEvent } from './activityLog';

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

  it('fetches every page reported by X-Pages, a few at a time, reassembled in page order', async () => {
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

    expect([...pagesRequested].sort()).toEqual([1, 2, 3]);
    // Page 1 alone (it carries X-Pages), then 2 and 3 together.
    expect(pagesRequested[0]).toBe(1);
    expect(maxInFlight).toBe(2);
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
 * A short list must stay distinguishable from a complete one, or a truncated
 * view renders under a fresh DataAgeBadge as if it were whole.
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

  it('reports complete when the page count exactly equals the cap', async () => {
    server.use(pagedHandler(3));

    const result = await fetchAllPagesStatus<string>('/markets/10000002/orders', { maxPages: 3 });

    expect(result.truncated).toBe(false);
    expect(result.items).toEqual(['item-1', 'item-2', 'item-3']);
  });
});

/**
 * A multi-page read must log once, not once per page — otherwise a single
 * large asset/journal load could crowd the bounded activity buffer with
 * near-identical rows (issue #32).
 */
describe('fetchAllPagesStatus — activity log (issue #32)', () => {
  it('emits exactly one success event for a multi-page read', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/10000002/orders`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page')) || 1;
        return HttpResponse.json([`item-${page}`], { headers: { 'X-Pages': '3' } });
      })
    );
    const events: ActivityEvent[] = [];
    const unsubscribe = onEsiActivity((event) => events.push(event));

    await fetchAllPagesStatus<string>('/markets/10000002/orders', {
      endpointId: 'getMarketOrders',
    });

    expect(events).toEqual([
      {
        endpointId: 'getMarketOrders',
        characterId: undefined,
        timestamp: expect.any(Number),
        outcome: 'success',
      },
    ]);
    unsubscribe();
  });

  it('emits exactly one error event when a later page fails (not a 404 end-of-data)', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/markets/10000002/orders`, ({ request }) => {
        const page = Number(new URL(request.url).searchParams.get('page')) || 1;
        if (page === 2) return new HttpResponse(null, { status: 500 });
        return HttpResponse.json([`item-${page}`], { headers: { 'X-Pages': '3' } });
      })
    );
    const events: ActivityEvent[] = [];
    const unsubscribe = onEsiActivity((event) => events.push(event));

    await expect(
      fetchAllPagesStatus<string>('/markets/10000002/orders', { endpointId: 'getMarketOrders' })
    ).rejects.toThrow();

    expect(events).toEqual([
      {
        endpointId: 'getMarketOrders',
        characterId: undefined,
        timestamp: expect.any(Number),
        outcome: 'error',
      },
    ]);
    unsubscribe();
  });
});

/**
 * Pages 2..N run a few at a time rather than one after another — a 20-page
 * asset walk was 20 serial round trips. The sequential contract still holds:
 * items in page order, a 404 after page 1 ends the data, anything else throws.
 */
describe('fetchAllPagesStatus — parallel page walk', () => {
  /** Answers each page after `delayFor(page)` ms, recording concurrency. */
  function slowPagedHandler(
    totalPages: number,
    delayFor: (page: number) => number,
    statusFor: (page: number) => number = () => 200
  ) {
    const state = { inFlight: 0, maxInFlight: 0, requested: [] as number[] };
    const handler = http.get(`${ESI_BASE_URL}/markets/10000002/orders`, async ({ request }) => {
      const page = Number(new URL(request.url).searchParams.get('page'));
      state.requested.push(page);
      state.inFlight += 1;
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight);
      await delay(delayFor(page));
      state.inFlight -= 1;
      const status = statusFor(page);
      if (status !== 200) return new HttpResponse(null, { status });
      return HttpResponse.json([`item-${page}`], { headers: { 'X-Pages': String(totalPages) } });
    });
    return { handler, state };
  }

  it('caps pages in flight at PAGE_FETCH_CONCURRENCY and keeps page order when later pages answer first', async () => {
    // Earlier pages answer slowest, so arrival order is the reverse of page order.
    const { handler, state } = slowPagedHandler(10, (page) => (page === 1 ? 0 : 60 - page * 5));
    server.use(handler);

    const result = await fetchAllPagesStatus<string>('/markets/10000002/orders');

    expect(result.items).toEqual(Array.from({ length: 10 }, (_, i) => `item-${i + 1}`));
    expect(result).toMatchObject({ truncated: false, pagesFetched: 10, pagesReported: 10 });
    expect(state.maxInFlight).toBeGreaterThan(1);
    expect(state.maxInFlight).toBeLessThanOrEqual(PAGE_FETCH_CONCURRENCY);
  });

  it('keeps only the pages before the first 404, even when a later page answered', async () => {
    // Page 3 404s at once while 2, 4 and 5 are still in flight; 4 and 5 then
    // answer 200 and must be discarded.
    const { handler, state } = slowPagedHandler(
      8,
      (page) => (page === 1 || page === 3 ? 0 : 30),
      (page) => (page === 3 ? 404 : 200)
    );
    server.use(handler);

    const result = await fetchAllPagesStatus<string>('/markets/10000002/orders');

    expect(result).toEqual({
      items: ['item-1', 'item-2'],
      truncated: true,
      pagesFetched: 2,
      pagesReported: 8,
    });
    expect(state.requested).toContain(4);
    // Nothing is dispatched once the 404 is known.
    expect(Math.max(...state.requested)).toBe(5);
  });

  it('throws a non-404 failure on a later page, after its siblings settle', async () => {
    const { handler, state } = slowPagedHandler(
      6,
      (page) => (page === 2 ? 0 : 30),
      (page) => (page === 2 ? 400 : 200)
    );
    server.use(handler);

    await expect(fetchAllPagesStatus<string>('/markets/10000002/orders')).rejects.toMatchObject({
      status: 400,
    });
    expect(state.inFlight).toBe(0);
    expect(state.requested).not.toContain(6);
  });

  it('ends at a 404 that comes before a failing page, as the sequential walk would', async () => {
    const { handler } = slowPagedHandler(
      5,
      (page) => (page === 2 ? 30 : 0),
      (page) => (page === 2 ? 404 : page === 3 ? 400 : 200)
    );
    server.use(handler);

    const result = await fetchAllPagesStatus<string>('/markets/10000002/orders');

    expect(result).toMatchObject({ items: ['item-1'], truncated: true, pagesFetched: 1 });
  });

  it('an abort mid-walk rejects with the AbortError once the in-flight pages settle', async () => {
    const controller = new AbortController();
    const { handler, state } = slowPagedHandler(12, (page) => (page === 1 ? 0 : 200));
    server.use(handler);

    const walk = fetchAllPagesStatus<string>('/markets/10000002/orders', {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(state.requested.length).toBeGreaterThan(1));
    controller.abort();

    await expect(walk).rejects.toMatchObject({ name: 'AbortError' });
    // Nothing is dispatched after the abort; the pages already sent were the
    // first batch only. (A stray rejection would fail the run as unhandled.)
    expect(Math.max(...state.requested)).toBeLessThanOrEqual(1 + PAGE_FETCH_CONCURRENCY);
  });

  it('never requests past maxPages', async () => {
    const { handler, state } = slowPagedHandler(20, () => 5);
    server.use(handler);

    const result = await fetchAllPagesStatus<string>('/markets/10000002/orders', { maxPages: 6 });

    expect([...state.requested].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result).toMatchObject({ truncated: true, pagesFetched: 6, pagesReported: 20 });
    expect(result.items).toEqual(['item-1', 'item-2', 'item-3', 'item-4', 'item-5', 'item-6']);
  });
});
