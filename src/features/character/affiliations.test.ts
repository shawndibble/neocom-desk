import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { STALE_AFTER } from '@/esi/cache';
import { resolveAffiliations } from './affiliations';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  await db.esiCache.clear();
});
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ALICE = { character_id: 1, corporation_id: 1000, alliance_id: 99 };
const BOB = { character_id: 2, corporation_id: 2000 };

describe('resolveAffiliations', () => {
  it('POSTs unique ids and caches each row under the global sentinel', async () => {
    let bodies = 0;
    server.use(
      http.post(`${ESI_BASE_URL}/characters/affiliation`, () => {
        bodies += 1;
        return HttpResponse.json([ALICE, BOB]);
      })
    );

    const map = await resolveAffiliations([1, 2, 1]);

    expect(map.get(1)).toEqual(ALICE);
    expect(map.get(2)?.alliance_id).toBeUndefined();
    expect(bodies).toBe(1);
    expect((await db.esiCache.get([0, 'affiliation:1']))?.value).toEqual(ALICE);
  });

  it('makes no request at all when every id is cached and fresh', async () => {
    await db.esiCache.put({
      characterId: 0,
      key: 'affiliation:1',
      value: ALICE,
      fetchedAt: Date.now(),
    });
    server.use(
      http.post(`${ESI_BASE_URL}/characters/affiliation`, () => {
        throw new Error('should not be called');
      })
    );

    expect((await resolveAffiliations([1])).get(1)).toEqual(ALICE);
  });

  it('serves a lapsed row immediately rather than waiting on the refresh', async () => {
    await db.esiCache.put({
      characterId: 0,
      key: 'affiliation:1',
      value: ALICE,
      fetchedAt: Date.now() - STALE_AFTER.default - 1,
    });
    server.use(
      http.post(`${ESI_BASE_URL}/characters/affiliation`, async () => {
        await new Promise(() => {});
        return HttpResponse.json([]);
      })
    );

    expect((await resolveAffiliations([1])).get(1)).toEqual(ALICE);
  });

  it('falls back to whatever is cached when ESI fails', async () => {
    await db.esiCache.put({ characterId: 0, key: 'affiliation:1', value: ALICE, fetchedAt: 1 });
    server.use(http.post(`${ESI_BASE_URL}/characters/affiliation`, () => HttpResponse.error()));

    const map = await resolveAffiliations([1, 2]);

    expect(map.get(1)).toEqual(ALICE);
    expect(map.has(2)).toBe(false);
  });

  it('resolves an empty list without touching the cache or the network', async () => {
    expect((await resolveAffiliations([])).size).toBe(0);
  });
});
