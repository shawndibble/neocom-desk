import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { onEsiAuthFailure } from '@/esi/authFailureSignal';
import { db } from '@/db';
import { loadStructureName } from './structures';

const CHARACTER_ID = 42;

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
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

  it('returns null when unresolvable (offline + uncached)', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/universe/structures/1000000000003`, () => HttpResponse.error())
    );

    const name = await loadStructureName(CHARACTER_ID, 1000000000003);

    expect(name).toBeNull();
  });
});
