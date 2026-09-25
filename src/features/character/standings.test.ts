import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { useAuthFailure } from '@/stores/authFailure';
import { loadCharacterStandings } from './standings';

const CHAR_ID = 91;
const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  await db.tokens.clear();
  useAuthFailure.getState().dismiss();
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

describe('loadCharacterStandings', () => {
  it('fetches and caches standings from ESI', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/standings`, () =>
        HttpResponse.json([{ from_id: 1000035, from_type: 'npc_corp', standing: 5 }])
      )
    );

    const result = await loadCharacterStandings(CHAR_ID);

    expect(result).toEqual([{ from_id: 1000035, from_type: 'npc_corp', standing: 5 }]);
  });

  it('falls back to an empty list, with no reconnect banner, when the scope is missing', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/standings`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );

    const result = await loadCharacterStandings(CHAR_ID);

    expect(result).toEqual([]);
    expect(useAuthFailure.getState().failure).toBeNull();
  });

  it('falls back to the cached list on a later failure, still with no banner', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/standings`, () =>
        HttpResponse.json([{ from_id: 1000035, from_type: 'npc_corp', standing: 5 }])
      )
    );
    await loadCharacterStandings(CHAR_ID);

    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/standings`, () =>
        HttpResponse.json({ error: 'offline' }, { status: 500 })
      )
    );
    await db.esiCache.where({ characterId: CHAR_ID, key: 'standings' }).modify({ fetchedAt: 0 });

    const result = await loadCharacterStandings(CHAR_ID);

    expect(result).toEqual([{ from_id: 1000035, from_type: 'npc_corp', standing: 5 }]);
    expect(useAuthFailure.getState().failure).toBeNull();
  });

  it('does not call ESI at all when the stored grant lacks the scope', async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 60_000,
      scopes: ['esi-characters.read_contacts.v1'],
    });
    // onUnhandledRequest is 'error', so any fetch here fails the test.
    expect(await loadCharacterStandings(CHAR_ID)).toEqual([]);
  });

  it('still fetches when the stored grant includes the scope', async () => {
    await db.tokens.put({
      characterId: CHAR_ID,
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: Date.now() + 60_000,
      scopes: ['esi-characters.read_standings.v1'],
    });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/standings`, () =>
        HttpResponse.json([{ from_id: 1000035, from_type: 'npc_corp', standing: 5 }])
      )
    );
    expect(await loadCharacterStandings(CHAR_ID)).toHaveLength(1);
  });
});
