import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadCharacterBlueprints, findOwnedBlueprint } from './data';
import type { CharacterBlueprint } from '@/esi/endpoints';

const CHAR_ID = 91;
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

describe('loadCharacterBlueprints', () => {
  const payload: CharacterBlueprint[] = [
    {
      item_id: 1,
      type_id: 638,
      runs: -1,
      material_efficiency: 10,
      time_efficiency: 20,
      quantity: 1,
    },
  ];

  it('fetches from ESI, writes the cache, and reports fromCache: false', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/blueprints`, () => HttpResponse.json(payload))
    );

    const result = await loadCharacterBlueprints(CHAR_ID);

    expect(result.needsReauth).toBe(false);
    expect(result.cached?.fromCache).toBe(false);
    expect(result.cached?.data).toEqual(payload);
    const cached = await db.esiCache.get([CHAR_ID, 'blueprints']);
    expect(cached?.value).toEqual(payload);
  });

  it('falls back to the cache when ESI is unreachable', async () => {
    await db.esiCache.put({
      characterId: CHAR_ID,
      key: 'blueprints',
      value: payload,
      fetchedAt: 1234,
    });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/blueprints`, () => HttpResponse.error())
    );

    const result = await loadCharacterBlueprints(CHAR_ID);

    expect(result.needsReauth).toBe(false);
    expect(result.cached?.fromCache).toBe(true);
    expect(result.cached?.data).toEqual(payload);
  });

  it('returns null cached when ESI fails and nothing is cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/blueprints`, () => HttpResponse.error())
    );
    const result = await loadCharacterBlueprints(CHAR_ID);
    expect(result.needsReauth).toBe(false);
    expect(result.cached).toBeNull();
  });

  it('reports needsReauth when the blueprints scope was revoked (403) and nothing is cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/blueprints`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );

    const result = await loadCharacterBlueprints(CHAR_ID);

    expect(result.needsReauth).toBe(true);
    expect(result.cached).toBeNull();
  });
});

describe('findOwnedBlueprint', () => {
  const bpo: CharacterBlueprint = {
    item_id: 1,
    type_id: 638,
    runs: -1,
    material_efficiency: 8,
    time_efficiency: 16,
    quantity: 1,
  };
  const bpcLow: CharacterBlueprint = {
    item_id: 2,
    type_id: 638,
    runs: 5,
    material_efficiency: 4,
    time_efficiency: 6,
    quantity: 1,
  };
  const bpcHigh: CharacterBlueprint = {
    item_id: 3,
    type_id: 638,
    runs: 1,
    material_efficiency: 10,
    time_efficiency: 20,
    quantity: 1,
  };

  it('returns null when none owned', () => {
    expect(findOwnedBlueprint([], 638)).toBeNull();
  });

  it('prefers the original (BPO) over any copy, even a higher-ME copy', () => {
    expect(findOwnedBlueprint([bpcHigh, bpo, bpcLow], 638)).toEqual(bpo);
  });

  it('picks the highest-ME copy when no original is owned', () => {
    expect(findOwnedBlueprint([bpcLow, bpcHigh], 638)).toEqual(bpcHigh);
  });

  it('ignores blueprints of a different typeID', () => {
    expect(findOwnedBlueprint([{ ...bpo, type_id: 640 }], 638)).toBeNull();
  });
});
