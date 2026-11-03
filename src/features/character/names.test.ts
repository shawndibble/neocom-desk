import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { clearRefusedNameIds, resolveCategories, resolveNames } from './names';
import { deferred } from '@/test/deferred';

const server = mswServer();

beforeEach(async () => {
  clearRefusedNameIds();
  await db.esiCache.clear();
});

describe('resolveNames', () => {
  it('POSTs unique ids and caches each resolved name under the global sentinel', async () => {
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, () =>
        HttpResponse.json([
          { id: 1, name: 'Alice', category: 'character' },
          { id: 2, name: 'Bob', category: 'character' },
        ])
      )
    );

    const names = await resolveNames([1, 2, 1]);

    expect(names.get(1)).toBe('Alice');
    expect(names.get(2)).toBe('Bob');
    expect((await db.esiCache.get([0, 'name:1']))?.value).toBe('Alice');
  });

  it('falls back to cached names offline', async () => {
    await db.esiCache.put({ characterId: 0, key: 'name:1', value: 'Alice', fetchedAt: 1 });
    server.use(http.post(`${ESI_BASE_URL}/universe/names`, () => HttpResponse.error()));

    const names = await resolveNames([1]);

    expect(names.get(1)).toBe('Alice');
  });

  it('returns an empty map for ids with neither a live nor cached name', async () => {
    server.use(http.post(`${ESI_BASE_URL}/universe/names`, () => HttpResponse.error()));

    const names = await resolveNames([999]);

    expect(names.has(999)).toBe(false);
  });

  it('serves fresh cached names without any request', async () => {
    // The wait this removes: every route loader that resolves a name used to
    // block on a live POST before it could render, even with every name
    // already local.
    let called = false;
    await db.esiCache.put({ characterId: 0, key: 'name:1', value: 'Alice', fetchedAt: Date.now() });
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, () => {
        called = true;
        return HttpResponse.json([]);
      })
    );

    const names = await resolveNames([1]);

    expect(names.get(1)).toBe('Alice');
    expect(called).toBe(false);
  });

  it('asks only for the ids it has no name for', async () => {
    let asked: number[] = [];
    await db.esiCache.put({ characterId: 0, key: 'name:1', value: 'Alice', fetchedAt: Date.now() });
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, async ({ request }) => {
        asked = (await request.json()) as number[];
        return HttpResponse.json([{ id: 2, name: 'Bob', category: 'character' }]);
      })
    );

    const names = await resolveNames([1, 2]);

    expect(asked).toEqual([2]);
    expect(names.get(1)).toBe('Alice');
    expect(names.get(2)).toBe('Bob');
  });

  it('returns a lapsed cached name at once and refreshes it behind the caller', async () => {
    // A name that has gone past its window is still a name. Blocking on it
    // would put a whole page behind a lookup of something that almost never
    // changes.
    const resolved = deferred();
    await db.esiCache.put({ characterId: 0, key: 'name:1', value: 'Old Corp', fetchedAt: 1 });
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, async () => {
        await resolved.promise;
        return HttpResponse.json([{ id: 1, name: 'New Corp', category: 'corporation' }]);
      })
    );

    expect((await resolveNames([1])).get(1)).toBe('Old Corp');

    resolved.resolve();
    await vi.waitFor(async () =>
      expect((await db.esiCache.get([0, 'name:1']))?.value).toBe('New Corp')
    );
  });

  it('returns an empty map without a request for an empty id list', async () => {
    let called = false;
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, () => {
        called = true;
        return HttpResponse.json([]);
      })
    );

    const names = await resolveNames([]);

    expect(names.size).toBe(0);
    expect(called).toBe(false);
  });
});

describe('resolveNames — cache writes', () => {
  it('stores a whole resolved batch in one bulk write, not a transaction per name', async () => {
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, () =>
        HttpResponse.json([
          { id: 1, name: 'Alice', category: 'character' },
          { id: 2, name: 'Bob', category: 'character' },
          { id: 3, name: 'Carol', category: 'character' },
        ])
      )
    );
    const put = vi.spyOn(db.esiCache, 'put');
    const bulkPut = vi.spyOn(db.esiCache, 'bulkPut');

    await resolveNames([1, 2, 3]);

    expect(put).not.toHaveBeenCalled();
    expect(bulkPut).toHaveBeenCalledTimes(1);
    expect((await db.esiCache.get([0, 'name:3']))?.value).toBe('Carol');
    put.mockRestore();
    bulkPut.mockRestore();
  });
});

describe('resolveCategories', () => {
  it('resolves and caches the category beside the name', async () => {
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, () =>
        HttpResponse.json([{ id: 7, name: 'Some Corp', category: 'corporation' }])
      )
    );

    const categories = await resolveCategories([7, 7]);

    expect(categories.get(7)).toBe('corporation');
    expect((await db.esiCache.get([0, 'category:7']))?.value).toBe('corporation');
    expect((await db.esiCache.get([0, 'name:7']))?.value).toBe('Some Corp');
  });

  it('answers from cache with no request', async () => {
    await db.esiCache.put({ characterId: 0, key: 'category:7', value: 'alliance', fetchedAt: 1 });
    server.use(http.post(`${ESI_BASE_URL}/universe/names`, () => HttpResponse.error()));

    expect((await resolveCategories([7])).get(7)).toBe('alliance');
  });

  it('looks up a name cached before categories were stored', async () => {
    await db.esiCache.put({ characterId: 0, key: 'name:7', value: 'Old', fetchedAt: 1 });
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, () =>
        HttpResponse.json([{ id: 7, name: 'Old', category: 'character' }])
      )
    );

    expect((await resolveCategories([7])).get(7)).toBe('character');
  });

  it('leaves the id absent when the lookup fails', async () => {
    server.use(http.post(`${ESI_BASE_URL}/universe/names`, () => HttpResponse.error()));

    expect((await resolveCategories([7])).has(7)).toBe(false);
  });
});

describe('resolveNames with an invalid id in the batch', () => {
  it('still names the valid ids when ESI 404s the whole POST for one bad id', async () => {
    const BAD = 777;
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, async ({ request }) => {
        const ids = (await request.json()) as number[];
        if (ids.includes(BAD)) {
          return HttpResponse.json({ error: 'Ensure all IDs are valid' }, { status: 404 });
        }
        return HttpResponse.json(
          ids.map((id) => ({ id, name: `Name ${id}`, category: 'character' }))
        );
      })
    );

    const names = await resolveNames([1, 2, BAD, 3, 4]);

    expect([...names.keys()].sort()).toEqual([1, 2, 3, 4]);
    expect(names.get(3)).toBe('Name 3');
    expect(names.has(BAD)).toBe(false);
  });

  it('does not ask ESI about a refused id again in the same session', async () => {
    const BAD = 778;
    let badAsks = 0;
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, async ({ request }) => {
        const ids = (await request.json()) as number[];
        if (ids.includes(BAD)) {
          badAsks += 1;
          return HttpResponse.json({ error: 'Ensure all IDs are valid' }, { status: 404 });
        }
        return HttpResponse.json(ids.map((id) => ({ id, name: `N${id}`, category: 'character' })));
      })
    );

    await resolveNames([BAD, 11]);
    const asksAfterFirst = badAsks;
    await db.esiCache.clear();
    await resolveNames([BAD, 12]);

    expect(badAsks).toBe(asksAfterFirst);
  });

  it('stops splitting once a lookup has spent its 404 allowance', async () => {
    let posts = 0;
    server.use(
      http.post(`${ESI_BASE_URL}/universe/names`, async ({ request }) => {
        posts += 1;
        const ids = (await request.json()) as number[];
        // Every other id is invalid: the worst case for bisecting.
        if (ids.some((id) => id % 2 === 0)) {
          return HttpResponse.json({ error: 'Ensure all IDs are valid' }, { status: 404 });
        }
        return HttpResponse.json(ids.map((id) => ({ id, name: `N${id}`, category: 'character' })));
      })
    );

    await resolveNames(Array.from({ length: 200 }, (_, i) => 5000 + i));

    expect(posts).toBeLessThanOrEqual(25);
  });
});
