import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { loadCharacterLoyaltyPoints, PARAGON_CORPORATION_ID, splitEverMarks } from './loyalty';

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

describe('loadCharacterLoyaltyPoints', () => {
  it('fetches and caches the loyalty points payload', async () => {
    const payload = [
      { corporation_id: 1000167, loyalty_points: 5000 },
      { corporation_id: 1000169, loyalty_points: 120 },
    ];
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/loyalty/points`, () =>
        HttpResponse.json(payload)
      )
    );
    const result = await loadCharacterLoyaltyPoints(CHAR_ID);
    expect(result.needsReauth).toBe(false);
    expect(result.cached?.data).toEqual(payload);
    expect((await db.esiCache.get([CHAR_ID, 'loyalty']))?.value).toEqual(payload);
  });

  it('falls back to cache offline', async () => {
    const payload = [{ corporation_id: 1000167, loyalty_points: 5000 }];
    await db.esiCache.put({ characterId: CHAR_ID, key: 'loyalty', value: payload, fetchedAt: 2 });
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/loyalty/points`, () => HttpResponse.error())
    );
    const result = await loadCharacterLoyaltyPoints(CHAR_ID);
    expect(result.needsReauth).toBe(false);
    expect(result.cached).toEqual({
      data: payload,
      fetchedAt: new Date(2),
      fromCache: true,
      truncated: false,
    });
  });

  it('reports needsReauth when the loyalty scope was revoked (403) and nothing is cached', async () => {
    server.use(
      http.get(`${ESI_BASE_URL}/characters/${CHAR_ID}/loyalty/points`, () =>
        HttpResponse.json({ error: 'missing scope' }, { status: 403 })
      )
    );
    const result = await loadCharacterLoyaltyPoints(CHAR_ID);
    expect(result.needsReauth).toBe(true);
    expect(result.cached).toBeNull();
  });
});

describe('splitEverMarks', () => {
  it('pulls the Paragon entry out as EverMarks, leaving the rest untouched', () => {
    const result = splitEverMarks([
      { corporation_id: 1000167, loyalty_points: 5000 },
      { corporation_id: PARAGON_CORPORATION_ID, loyalty_points: 250 },
      { corporation_id: 1000169, loyalty_points: 120 },
    ]);
    expect(result.everMarks).toBe(250);
    expect(result.otherLoyalty).toEqual([
      { corporation_id: 1000167, loyalty_points: 5000 },
      { corporation_id: 1000169, loyalty_points: 120 },
    ]);
  });

  it('reports zero EverMarks when the character has no Paragon LP', () => {
    const result = splitEverMarks([{ corporation_id: 1000167, loyalty_points: 5000 }]);
    expect(result.everMarks).toBe(0);
    expect(result.otherLoyalty).toEqual([{ corporation_id: 1000167, loyalty_points: 5000 }]);
  });

  it('handles an empty list', () => {
    expect(splitEverMarks([])).toEqual({ everMarks: 0, otherLoyalty: [] });
  });
});
