import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { onEsiAuthFailure } from '@/esi/authFailureSignal';
import { db } from '@/db';
import { loadCharacterSolarSystemId } from './location';

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

describe('loadCharacterSolarSystemId', () => {
  it('fetches and caches the current solar system id', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/location`, () =>
        HttpResponse.json({ solar_system_id: 30000142 })
      )
    );

    const systemId = await loadCharacterSolarSystemId(CHARACTER_ID);

    expect(systemId).toBe(30000142);
    expect(
      (await db.esiCache.get([CHARACTER_ID, 'characterLocation']))?.value
    ).toBe(30000142);
  });

  it('returns null on a 403 (missing grant) WITHOUT signalling a re-auth failure', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/location`, () =>
        HttpResponse.json({ error: 'Forbidden' }, { status: 403 })
      )
    );
    const authFailures: number[] = [];
    const unsubscribe = onEsiAuthFailure((characterId) => authFailures.push(characterId));

    const systemId = await loadCharacterSolarSystemId(CHARACTER_ID);

    unsubscribe();
    expect(systemId).toBeNull();
    expect(authFailures).toEqual([]);
  });

  it('returns null when unresolvable (offline + uncached)', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHARACTER_ID}/location`, () => HttpResponse.error())
    );

    const systemId = await loadCharacterSolarSystemId(CHARACTER_ID);

    expect(systemId).toBeNull();
  });
});
