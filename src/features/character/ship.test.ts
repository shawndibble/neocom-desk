import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { onEsiAuthFailure } from '@/esi/authFailureSignal';
import { db } from '@/db';
import { useActiveCharacter } from '@/stores/activeCharacter';
import { loadCharacterShipTypeId, useCharacterShipTypeId } from './ship';

const CHARACTER_ID = 42;
const SHIP_URL = `${ESI_BASE_URL}/characters/${CHARACTER_ID}/ship`;
const SHIP = { ship_item_id: 1, ship_name: 'Hulk', ship_type_id: 22544 };

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  await db.tokens.clear();
  useActiveCharacter.setState({ activeCharacterId: null, hydrated: true });
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

async function grant(scopes: string[]) {
  await db.tokens.put({
    characterId: CHARACTER_ID,
    refreshToken: 'r',
    accessToken: 'a',
    accessTokenExpiresAt: Date.now() + 60_000,
    scopes,
  } as never);
}

describe('loadCharacterShipTypeId', () => {
  it('fetches and caches the ship type id', async () => {
    server.use(http.get(SHIP_URL, () => HttpResponse.json(SHIP)));

    expect(await loadCharacterShipTypeId(CHARACTER_ID)).toBe(22544);
    expect((await db.esiCache.get([CHARACTER_ID, 'characterShip']))?.value).toBe(22544);
  });

  it('returns null on a 403 (missing grant) WITHOUT signalling a re-auth failure', async () => {
    server.use(
      http.get(SHIP_URL, () => HttpResponse.json({ error: 'Forbidden' }, { status: 403 }))
    );
    const authFailures: number[] = [];
    const unsubscribe = onEsiAuthFailure((id) => authFailures.push(id));

    const typeId = await loadCharacterShipTypeId(CHARACTER_ID);

    unsubscribe();
    expect(typeId).toBeNull();
    expect(authFailures).toEqual([]);
  });

  it('returns null when unresolvable (offline + uncached)', async () => {
    server.use(http.get(SHIP_URL, () => HttpResponse.error()));
    expect(await loadCharacterShipTypeId(CHARACTER_ID)).toBeNull();
  });
});

describe('useCharacterShipTypeId', () => {
  it('is ready with the ship type once loaded', async () => {
    await grant(['esi-location.read_ship_type.v1']);
    server.use(http.get(SHIP_URL, () => HttpResponse.json(SHIP)));
    useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });

    const { result } = renderHook(() => useCharacterShipTypeId());

    await waitFor(() => expect(result.current).toEqual({ typeId: 22544, status: 'ready' }));
  });

  it('needsScope, without calling ESI, when the grant lacks the scope', async () => {
    await grant(['esi-location.read_location.v1']);
    const called = vi.fn();
    server.use(
      http.get(SHIP_URL, () => {
        called();
        return HttpResponse.json(SHIP);
      })
    );
    useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });

    const { result } = renderHook(() => useCharacterShipTypeId());

    await waitFor(() => expect(result.current.status).toBe('needsScope'));
    expect(result.current.typeId).toBeNull();
    await act(async () => {});
    expect(called).not.toHaveBeenCalled();
  });

  it('is unavailable when ESI fails with the scope granted', async () => {
    await grant(['esi-location.read_ship_type.v1']);
    server.use(http.get(SHIP_URL, () => HttpResponse.error()));
    useActiveCharacter.setState({ activeCharacterId: CHARACTER_ID, hydrated: true });

    const { result } = renderHook(() => useCharacterShipTypeId());

    await waitFor(() => expect(result.current.status).toBe('unavailable'));
  });

  it('is unavailable with no active character', () => {
    const { result } = renderHook(() => useCharacterShipTypeId());
    expect(result.current).toEqual({ typeId: null, status: 'unavailable' });
  });
});
