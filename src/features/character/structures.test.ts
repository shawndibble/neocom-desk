import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { onEsiAuthFailure } from '@/esi/authFailureSignal';
import { db } from '@/db';
import { STALE_AFTER, resetRevalidationState } from '@/esi/cache';
import { loadStructureName } from './structures';

const CHARACTER_ID = 42;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  resetRevalidationState();
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

describe('loadStructureName', () => {
  it('fetches and caches the structure name under the character (never the global sentinel)', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/1000000000001`, () =>
        HttpResponse.json({
          name: 'Amarr VIII (Oris) - Emperor Family Academy',
          owner_id: 98000001,
          solar_system_id: 30002187,
        })
      )
    );

    const name = await loadStructureName(CHARACTER_ID, 1000000000001);

    expect(name).toBe('Amarr VIII (Oris) - Emperor Family Academy');
    expect((await db.esiCache.get([CHARACTER_ID, 'structure:1000000000001']))?.value).toMatchObject(
      { name: 'Amarr VIII (Oris) - Emperor Family Academy' }
    );
    expect(await db.esiCache.get([0, 'structure:1000000000001'])).toBeUndefined();
  });

  it('returns null on a 403 (not on the ACL) WITHOUT signalling a re-auth failure', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/1000000000002`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
      )
    );
    const authFailures: number[] = [];
    const unsubscribe = onEsiAuthFailure((characterId) => authFailures.push(characterId));

    const name = await loadStructureName(CHARACTER_ID, 1000000000002);

    unsubscribe();
    expect(name).toBeNull();
    expect(authFailures).toEqual([]);
  });

  it('does not re-request a structure that already answered 403 (issue: ESI error limit)', async () => {
    let requests = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/1000000000004`, () => {
        requests += 1;
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
      })
    );

    expect(await loadStructureName(CHARACTER_ID, 1000000000004)).toBeNull();
    expect(await loadStructureName(CHARACTER_ID, 1000000000004)).toBeNull();
    expect(await loadStructureName(CHARACTER_ID, 1000000000004)).toBeNull();

    expect(requests).toBe(1);
  });

  it('memoizes the 403 durably, so a fresh session does not re-request it either', async () => {
    let requests = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/1000000000005`, () => {
        requests += 1;
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
      })
    );

    expect(await loadStructureName(CHARACTER_ID, 1000000000005)).toBeNull();
    // What a reload looks like from this module: Dexie survives, the in-memory
    // revalidation state does not.
    resetRevalidationState();
    expect(await loadStructureName(CHARACTER_ID, 1000000000005)).toBeNull();

    expect(requests).toBe(1);
  });

  it('keeps the memo per character: another character still asks for itself', async () => {
    let requests = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/1000000000006`, () => {
        requests += 1;
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
      })
    );

    expect(await loadStructureName(CHARACTER_ID, 1000000000006)).toBeNull();
    expect(await loadStructureName(CHARACTER_ID + 1, 1000000000006)).toBeNull();

    expect(requests).toBe(2);
  });

  it('retries once the memo lapses, so ACL access gained later still resolves', async () => {
    let requests = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/1000000000007`, () => {
        requests += 1;
        return requests === 1
          ? HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
          : HttpResponse.json({ name: 'Now On The ACL', owner_id: 1, solar_system_id: 30000142 });
      })
    );

    expect(await loadStructureName(CHARACTER_ID, 1000000000007)).toBeNull();
    // Age the memo past its window rather than faking timers: the row is the
    // only state that decides this.
    const row = await db.esiCache.get([CHARACTER_ID, 'structure:1000000000007:forbidden']);
    expect(row).toBeDefined();
    await db.esiCache.put({ ...row!, fetchedAt: row!.fetchedAt - STALE_AFTER.static - 1 });
    resetRevalidationState();

    expect(await loadStructureName(CHARACTER_ID, 1000000000007)).toBe('Now On The ACL');
    expect(requests).toBe(2);
  });

  it('does not memoize a network failure as forbidden', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/1000000000008`, () => HttpResponse.error())
    );

    expect(await loadStructureName(CHARACTER_ID, 1000000000008)).toBeNull();

    expect(
      await db.esiCache.get([CHARACTER_ID, 'structure:1000000000008:forbidden'])
    ).toBeUndefined();
  });

  it('returns null when unresolvable (offline + uncached)', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/1000000000003`, () => HttpResponse.error())
    );

    const name = await loadStructureName(CHARACTER_ID, 1000000000003);

    expect(name).toBeNull();
  });
});
