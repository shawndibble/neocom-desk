import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type { TypeMap } from '@/sde/types';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';

const TYPES: TypeMap = {
  '34': { name: 'Tritanium', groupID: 18, volume: 0.01 },
};

vi.mock('@/sde/loadSde', () => ({
  loadTypes: vi.fn(async () => TYPES),
}));

const { loadTypeName, loadTypeNames } = await import('./typeNames');

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await db.esiCache.clear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

describe('loadTypeName', () => {
  it('returns the SDE name for a known typeID', async () => {
    expect(await loadTypeName(34)).toBe('Tritanium');
  });

  it('falls back to "Type #id" when the id is unresolvable everywhere', async () => {
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, () => new HttpResponse(null, { status: 404 }))
    );
    server.use(
      http.get(
        `${ESI_BASE_URL}/universe/types/99999`,
        () => new HttpResponse(null, { status: 404 })
      )
    );

    expect(await loadTypeName(99999)).toBe('Type #99999');
  });
});

describe('loadTypeNames', () => {
  it('resolves SDE-known ids locally, without hitting ESI', async () => {
    let called = false;
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, () => {
        called = true;
        return HttpResponse.json([]);
      })
    );

    const names = await loadTypeNames([34]);

    expect(names.get(34)).toBe('Tritanium');
    expect(called).toBe(false);
  });

  it('batches every SDE-missing id into a single POST /universe/names call', async () => {
    let calls = 0;
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, async ({ request }) => {
        calls += 1;
        const ids = (await request.json()) as number[];
        return HttpResponse.json(
          ids.map((id) => ({ id, name: `Widget ${id}`, category: 'inventory_type' as const }))
        );
      })
    );

    const names = await loadTypeNames([34, 100, 200]);

    expect(calls).toBe(1);
    expect(names.get(34)).toBe('Tritanium');
    expect(names.get(100)).toBe('Widget 100');
    expect(names.get(200)).toBe('Widget 200');
  });

  it('caches resolved names under the global sentinel so they persist offline', async () => {
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, () =>
        HttpResponse.json([{ id: 100, name: 'Widget 100', category: 'inventory_type' as const }])
      )
    );

    await loadTypeNames([100]);
    expect((await db.esiCache.get([0, 'type:100']))?.value).toBe('Widget 100');

    server.use(http.post(`${ESI_BASE_URL}/universe/names`, () => HttpResponse.error()));
    const names = await loadTypeNames([100]);
    expect(names.get(100)).toBe('Widget 100');
  });

  it('splits more than 1000 missing ids across multiple batched requests', async () => {
    const ids = Array.from({ length: 1500 }, (_, i) => 1000 + i);
    let calls = 0;
    let maxBatchSize = 0;
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, async ({ request }) => {
        calls += 1;
        const batch = (await request.json()) as number[];
        maxBatchSize = Math.max(maxBatchSize, batch.length);
        return HttpResponse.json(
          batch.map((id) => ({ id, name: `Widget ${id}`, category: 'inventory_type' as const }))
        );
      })
    );

    const names = await loadTypeNames(ids);

    expect(calls).toBe(2);
    expect(maxBatchSize).toBeLessThanOrEqual(1000);
    expect(names.get(1000)).toBe('Widget 1000');
    expect(names.get(2499)).toBe('Widget 2499');
  });

  it('falls back to per-id GET /universe/types/{id} when the batch 404s', async () => {
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, () => new HttpResponse(null, { status: 404 })),
      http.get(`${ESI_BASE_URL}/universe/types/100`, () =>
        HttpResponse.json({
          type_id: 100,
          name: 'Widget 100',
          description: '',
          group_id: 1,
          published: true,
        })
      ),
      http.get(
        `${ESI_BASE_URL}/universe/types/999999`,
        () => new HttpResponse(null, { status: 404 })
      )
    );

    const names = await loadTypeNames([100, 999999]);

    expect(names.get(100)).toBe('Widget 100');
    expect(names.get(999999)).toBe('Type #999999');
  });

  it('does not fan out per-id when the batch is rate-limited (429)', async () => {
    // The opposite of the 404 case: a 429 is not "this batch is unresolvable",
    // it is ESI telling us to send less. Answering one throttled request with
    // up to 1000 per-id ones spends the same globally-counted error budget the
    // throttle is already protecting, so a throttled chunk keeps whatever
    // names are cached and leaves the rest on their placeholder.
    //
    // Two ids on purpose: 200 has no cached row at all, which is what makes
    // `resolveViaEsi` await the network half rather than returning 100's
    // lapsed row and refreshing it in an un-awaited background call. A
    // cached-only ask would let this assertion run before the fan-out it is
    // trying to rule out had a chance to fire — and 200 is also the id that
    // discriminates, since it reads `Widget 200` under the old fan-out.
    await db.esiCache.put({ characterId: 0, key: 'type:100', value: 'Widget 100', fetchedAt: 1 });
    let typeRequests = 0;
    server.use(
      http.post(
        `${ESI_BASE_URL}/universe/names`,
        // retry-after: 0 so esiFetch's one blind retry doesn't idle the test.
        () => new HttpResponse(null, { status: 429, headers: { 'retry-after': '0' } })
      ),
      http.get(`${ESI_BASE_URL}/universe/types/:id`, ({ params }) => {
        typeRequests += 1;
        const id = Number(params.id);
        return HttpResponse.json({
          type_id: id,
          name: `Widget ${id}`,
          description: '',
          group_id: 1,
          published: true,
        });
      })
    );

    const names = await loadTypeNames([100, 200]);

    expect(typeRequests).toBe(0);
    expect(names.get(100)).toBe('Widget 100');
    expect(names.get(200)).toBe('Type #200');
  });

  it('does not fan out per-id when the batch trips the error limit (420) — issue #655', async () => {
    // 420 is the status the reported outage actually produced, and the one the
    // old code amplified: the user's console showed GET /universe/types/21039
    // twice, both 420, fired *by* this fallback in response to a 420 batch.
    // An id with no cached name is left on its "Type #id" placeholder rather
    // than chased with a request that cannot succeed and would deepen the
    // outage for every other surface in the app.
    let typeRequests = 0;
    server.use(
      http.post(
        `${ESI_BASE_URL}/universe/names`,
        // 420 takes the other branch of esiFetch's retryWaitMs (the error-limit
        // reset header rather than Retry-After); 0 keeps the retry instant.
        () => new HttpResponse(null, { status: 420, headers: { 'x-esi-error-limit-reset': '0' } })
      ),
      http.get(`${ESI_BASE_URL}/universe/types/:id`, ({ params }) => {
        typeRequests += 1;
        const id = Number(params.id);
        return HttpResponse.json({
          type_id: id,
          name: `Widget ${id}`,
          description: '',
          group_id: 1,
          published: true,
        });
      })
    );

    const names = await loadTypeNames([21039, 100]);

    expect(typeRequests).toBe(0);
    expect(names.get(21039)).toBe('Type #21039');
    expect(names.get(100)).toBe('Type #100');
  });

  it('still falls straight to cache on a genuine network failure, not the per-id fallback', async () => {
    // A true offline/network error (not an ESI status response) means the
    // per-id fallback would fail identically — no point firing it.
    await db.esiCache.put({ characterId: 0, key: 'type:100', value: 'Widget 100', fetchedAt: 1 });
    let typeRequests = 0;
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, () => HttpResponse.error()),
      http.get(`${ESI_BASE_URL}/universe/types/100`, () => {
        typeRequests += 1;
        return HttpResponse.json({
          type_id: 100,
          name: 'Widget 100',
          description: '',
          group_id: 1,
          published: true,
        });
      })
    );

    const names = await loadTypeNames([100]);

    expect(names.get(100)).toBe('Widget 100');
    expect(typeRequests).toBe(0);
  });

  it('bounds concurrent per-id fallback lookups instead of firing them all at once (BUG #6)', async () => {
    const ids = Array.from({ length: 30 }, (_, i) => 5000 + i);
    let inFlight = 0;
    let maxInFlight = 0;
    const pending: Array<() => void> = [];

    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, () => new HttpResponse(null, { status: 404 })),
      http.get(`${ESI_BASE_URL}/universe/types/:id`, async ({ params }) => {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await new Promise<void>((resolve) => pending.push(resolve));
        inFlight -= 1;
        const id = Number(params.id);
        return HttpResponse.json({
          type_id: id,
          name: `Widget ${id}`,
          description: '',
          group_id: 1,
          published: true,
        });
      })
    );

    const namesPromise = loadTypeNames(ids);

    // Drain the deferred requests in waves: release whatever has arrived so
    // far, then give the event loop a turn for the next wave to be
    // dispatched. A concurrency-limited implementation never has more than
    // its cap in flight at once; an unbounded one would show up here as a
    // single wave of `ids.length` requests all arriving before any resolve.
    let released = 0;
    for (let guard = 0; guard < 200 && released < ids.length; guard += 1) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      const wave = pending.splice(0, pending.length);
      released += wave.length;
      wave.forEach((resolve) => resolve());
    }

    const names = await namesPromise;

    expect(released).toBe(ids.length);
    expect(names.get(5000)).toBe('Widget 5000');
    expect(names.get(5029)).toBe('Widget 5029');
    expect(maxInFlight).toBeLessThanOrEqual(10);
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it('serves an already-cached name without any request', async () => {
    // Cache-first, not cache-as-fallback: a type name never changes, so a
    // page that resolved it once must not go back to ESI for it on every
    // later render.
    let called = false;
    await db.esiCache.put({
      characterId: 0,
      key: 'type:100',
      value: 'Widget 100',
      fetchedAt: Date.now(),
    });
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, () => {
        called = true;
        return HttpResponse.json([]);
      })
    );

    const names = await loadTypeNames([100]);

    expect(names.get(100)).toBe('Widget 100');
    expect(called).toBe(false);
  });

  it('asks only for the SDE-missing ids it has no cached name for', async () => {
    let asked: number[] = [];
    await db.esiCache.put({
      characterId: 0,
      key: 'type:100',
      value: 'Widget 100',
      fetchedAt: Date.now(),
    });
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, async ({ request }) => {
        asked = (await request.json()) as number[];
        return HttpResponse.json([{ id: 101, name: 'Widget 101', category: 'inventory_type' }]);
      })
    );

    const names = await loadTypeNames([100, 101]);

    expect(asked).toEqual([101]);
    expect(names.get(100)).toBe('Widget 100');
    expect(names.get(101)).toBe('Widget 101');
  });

  it('returns a lapsed cached name at once and refreshes it behind the caller', async () => {
    // CCP does rename items (tiericide renamed hundreds), so a `type:` row
    // gets the same `STALE_AFTER.static` window every other static key has —
    // it just never makes the caller wait for it.
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    await db.esiCache.put({ characterId: 0, key: 'type:100', value: 'Old Name', fetchedAt: 1 });
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, async () => {
        await held;
        return HttpResponse.json([{ id: 100, name: 'New Name', category: 'inventory_type' }]);
      })
    );

    expect((await loadTypeNames([100])).get(100)).toBe('Old Name');

    release();
    await vi.waitFor(async () =>
      expect((await db.esiCache.get([0, 'type:100']))?.value).toBe('New Name')
    );
  });

  it('falls back to cached names when ESI is unreachable (offline)', async () => {
    await db.esiCache.put({ characterId: 0, key: 'type:100', value: 'Widget 100', fetchedAt: 1 });
    server.use(http.post(`${ESI_BASE_URL}/universe/names`, () => HttpResponse.error()));

    const names = await loadTypeNames([100]);

    expect(names.get(100)).toBe('Widget 100');
  });

  it('falls back to "Type #id" for ids with neither a live nor cached name', async () => {
    server.use(http.post(`${ESI_BASE_URL}/universe/names`, () => HttpResponse.error()));

    const names = await loadTypeNames([34, 99999]);

    expect(names.get(34)).toBe('Tritanium');
    expect(names.get(99999)).toBe('Type #99999');
  });
});
