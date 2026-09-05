import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { resolveNames } from './names';

const server = setupServer();

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await db.esiCache.clear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

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
