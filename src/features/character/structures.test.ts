import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { onEsiAuthFailure } from '@/esi/authFailureSignal';
import { db } from '@/db';
import { STALE_AFTER, resetRevalidationState } from '@/esi/cache';
import { loadStructureName } from './structures';

const CHARACTER_ID = 42;
const OTHER_CHARACTER_ID = 43;
const THIRD_CHARACTER_ID = 44;

function seedCharacter(characterId: number, name = `char-${characterId}`): Promise<unknown> {
  return db.characters.put({ characterId, name, ownerHash: 'oh', addedAt: 0 });
}

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  await db.characters.clear();
  resetRevalidationState();
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

describe('loadStructureName', () => {
  it('fetches and caches the structure name under both the character and the shared roster row', async () => {
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
    // Mirrored to the shared roster row too, so a Character with no ACL access
    // of their own can still read the name another Character resolved.
    expect((await db.esiCache.get([0, 'structure:1000000000001']))?.value).toMatchObject({
      name: 'Amarr VIII (Oris) - Emperor Family Academy',
    });
  });

  it('serves the shared roster row without asking ESI at all, for a character with nothing of its own', async () => {
    await db.esiCache.put({
      characterId: 0,
      key: 'structure:1000000000009',
      value: { name: 'Resolved By An Alt', owner_id: 1, solar_system_id: 30000142 },
      fetchedAt: Date.now(),
    });
    // No handler registered for this id: `onUnhandledRequest: 'error'` fails
    // the test if this path reaches the network at all.

    const name = await loadStructureName(CHARACTER_ID, 1000000000009);

    expect(name).toBe('Resolved By An Alt');
  });

  it('falls back to another Character in the roster on a 403, and shares the name it finds', async () => {
    await seedCharacter(CHARACTER_ID);
    await seedCharacter(OTHER_CHARACTER_ID);
    const requestsByToken: string[] = [];
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/1000000000010`, ({ request }) => {
        const auth = request.headers.get('authorization') ?? '';
        requestsByToken.push(auth);
        return auth.includes(String(OTHER_CHARACTER_ID))
          ? HttpResponse.json({ name: 'Seen By The Alt', owner_id: 1, solar_system_id: 30000142 })
          : HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
      })
    );
    configureEsi({
      getToken: vi.fn(async (characterId: number) => `tok-${characterId}`),
    });

    const name = await loadStructureName(CHARACTER_ID, 1000000000010);

    expect(name).toBe('Seen By The Alt');
    expect(requestsByToken).toHaveLength(2);
    // Shared, so a third Character with no memo of its own reads it with no
    // further request.
    await seedCharacter(THIRD_CHARACTER_ID);
    expect(await loadStructureName(THIRD_CHARACTER_ID, 1000000000010)).toBe('Seen By The Alt');
    expect(requestsByToken).toHaveLength(2);
  });

  it('memoizes a roster-wide refusal once every Character has 403d, instead of sweeping the roster again', async () => {
    await seedCharacter(CHARACTER_ID);
    await seedCharacter(OTHER_CHARACTER_ID);
    let requests = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/1000000000011`, () => {
        requests += 1;
        return HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
      })
    );

    expect(await loadStructureName(CHARACTER_ID, 1000000000011)).toBeNull();
    expect(requests).toBe(2); // this Character, then the one other Character

    // A Character new to the roster still gets its own live shot — it could
    // be the one with real access — but that shot alone does not re-sweep
    // the rest of the roster the memo already covers.
    await seedCharacter(THIRD_CHARACTER_ID);
    expect(await loadStructureName(THIRD_CHARACTER_ID, 1000000000011)).toBeNull();
    expect(requests).toBe(3);

    // Asked again, even by the original Character: no further requests at
    // all — its own memo answers first, then the roster memo.
    expect(await loadStructureName(CHARACTER_ID, 1000000000011)).toBeNull();
    expect(requests).toBe(3);
  });

  it('does not sweep the roster on a network failure, only on a confirmed 403', async () => {
    await seedCharacter(CHARACTER_ID);
    await seedCharacter(OTHER_CHARACTER_ID);
    let requests = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/1000000000012`, () => {
        requests += 1;
        return HttpResponse.error();
      })
    );

    expect(await loadStructureName(CHARACTER_ID, 1000000000012)).toBeNull();

    expect(requests).toBe(1);
  });

  it('does not memoize a roster-wide refusal when a fallback Character only failed transiently', async () => {
    await seedCharacter(CHARACTER_ID);
    await seedCharacter(OTHER_CHARACTER_ID);
    let requests = 0;
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/1000000000013`, ({ request }) => {
        requests += 1;
        const auth = request.headers.get('authorization') ?? '';
        // The asking Character is confirmed off the ACL; the fallback
        // Character's own attempt is inconclusive (a network blip), never a
        // real answer about whether it can see the structure.
        return auth.includes(String(OTHER_CHARACTER_ID))
          ? HttpResponse.error()
          : HttpResponse.json({ error: 'Forbidden' }, { status: 403 });
      })
    );
    configureEsi({
      getToken: vi.fn(async (characterId: number) => `tok-${characterId}`),
    });

    expect(await loadStructureName(CHARACTER_ID, 1000000000013)).toBeNull();
    expect(requests).toBe(2);
    expect(await db.esiCache.get([0, 'structure:1000000000013:roster-forbidden'])).toBeUndefined();

    // Asked again: the inconclusive attempt was not memoized, so the fallback
    // Character is tried again rather than a citadel it could actually see
    // staying hidden for a day over one blip. (The asking Character itself
    // makes no new request here — its own 403 from moments ago is still
    // within its own same-day memo.)
    expect(await loadStructureName(CHARACTER_ID, 1000000000013)).toBeNull();
    expect(requests).toBe(3);
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

  it('does not re-request a structure that already answered 403 (issue #655)', async () => {
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
