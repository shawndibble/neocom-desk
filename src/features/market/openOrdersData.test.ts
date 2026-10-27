import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse, delay } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import type { MarketOrder } from '@/esi/endpoints';
import { loadAllCharactersOpenOrders } from './openOrdersData';

const ORDERS_SCOPE = 'esi-markets.read_character_orders.v1';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
  await db.characters.clear();
  await db.tokens.clear();
});
afterEach(() => {
  server.resetHandlers();
  configureEsi({ getToken: null });
});
afterAll(() => server.close());

function tokenWith(characterId: number, scopes: string[]) {
  return {
    characterId,
    accessToken: 'at',
    refreshToken: 'rt',
    expiresAt: Date.now() + 6e5,
    scopes,
  };
}

function order(characterId: number, overrides: Partial<MarketOrder> = {}): MarketOrder {
  return {
    order_id: characterId * 10 + 1,
    type_id: 34,
    region_id: 10000002,
    location_id: 60003760,
    is_buy_order: false,
    is_corporation: false,
    price: 5.5,
    volume_remain: 100,
    volume_total: 200,
    issued: '2026-08-01T00:00:00Z',
    duration: 90,
    range: 'region',
    ...overrides,
  };
}

const CHAR_A = 1;
const CHAR_B = 2;
const CHAR_C = 3;

describe('loadAllCharactersOpenOrders', () => {
  beforeEach(async () => {
    await db.characters.bulkPut([
      { characterId: CHAR_A, name: 'Alice', ownerHash: 'oh1', addedAt: 1 },
      { characterId: CHAR_B, name: 'Bob', ownerHash: 'oh2', addedAt: 2 },
      { characterId: CHAR_C, name: 'Carol', ownerHash: 'oh3', addedAt: 3 },
    ]);
  });

  it('skips a Character without the orders scope, never calling ESI for it', async () => {
    await db.tokens.bulkPut([tokenWith(CHAR_A, [ORDERS_SCOPE]), tokenWith(CHAR_B, [ORDERS_SCOPE])]);
    // CHAR_C has no token at all: never granted anything.
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_A}/orders`, () =>
        HttpResponse.json([order(CHAR_A)])
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_B}/orders`, () =>
        HttpResponse.json([order(CHAR_B)])
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_C}/orders`, () => {
        throw new Error('must not fetch a Character without the orders scope');
      })
    );

    const { entries, skipped } = await loadAllCharactersOpenOrders();

    expect(entries.map((e) => e.characterId)).toEqual([CHAR_A, CHAR_B]);
    expect(skipped).toEqual([{ characterId: CHAR_C, name: 'Carol' }]);
  });

  it('surfaces needsReauth on one Character entry without failing the others', async () => {
    await db.tokens.bulkPut([
      tokenWith(CHAR_A, [ORDERS_SCOPE]),
      tokenWith(CHAR_B, [ORDERS_SCOPE]),
      tokenWith(CHAR_C, [ORDERS_SCOPE]),
    ]);
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_A}/orders`, () =>
        HttpResponse.json([order(CHAR_A)])
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_B}/orders`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      ),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_C}/orders`, () =>
        HttpResponse.json([order(CHAR_C)])
      )
    );

    const { entries, skipped } = await loadAllCharactersOpenOrders();

    expect(skipped).toEqual([]);
    expect(entries.map((e) => e.characterId)).toEqual([CHAR_A, CHAR_B, CHAR_C]);

    const bob = entries.find((e) => e.characterId === CHAR_B);
    expect(bob?.needsReauth).toBe(true);
    expect(bob?.orders).toEqual([]);

    const alice = entries.find((e) => e.characterId === CHAR_A);
    expect(alice?.needsReauth).toBe(false);
    expect(alice?.orders).toEqual([order(CHAR_A)]);
    const carol = entries.find((e) => e.characterId === CHAR_C);
    expect(carol?.needsReauth).toBe(false);
  });

  it('keeps entries in stable, character-list order regardless of which fetch resolves first', async () => {
    await db.tokens.bulkPut([
      tokenWith(CHAR_A, [ORDERS_SCOPE]),
      tokenWith(CHAR_B, [ORDERS_SCOPE]),
      tokenWith(CHAR_C, [ORDERS_SCOPE]),
    ]);
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_A}/orders`, () =>
        HttpResponse.json([order(CHAR_A)])
      ),
      // CHAR_B is deliberately the slowest response of the three.
      http.get(`${ESI_BASE_URL}/characters/${CHAR_B}/orders`, async () => {
        await delay(30);
        return HttpResponse.json([order(CHAR_B)]);
      }),
      http.get(`${ESI_BASE_URL}/characters/${CHAR_C}/orders`, () =>
        HttpResponse.json([order(CHAR_C)])
      )
    );

    const { entries } = await loadAllCharactersOpenOrders();

    expect(entries.map((e) => e.characterId)).toEqual([CHAR_A, CHAR_B, CHAR_C]);
  });
});
