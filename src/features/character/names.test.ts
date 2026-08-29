import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { resolveNames } from './names';

const server = setupServer();

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
