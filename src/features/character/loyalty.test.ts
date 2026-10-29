import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { mswServer } from '@/test/msw';
import { configureEsi, ESI_BASE_URL } from '@/esi/client';
import { db } from '@/db';
import { writeCached } from '@/esi/cache';
import {
  loadCharacterLoyaltyPoints,
  PARAGON_CORPORATION_ID,
  readCachedLoyaltyBalances,
  combineLoyaltyStatuses,
  splitEverMarks,
  sumLoyaltyByCorporation,
} from './loyalty';

const CHAR_ID = 91;
const server = mswServer();

beforeEach(async () => {
  configureEsi({ getToken: vi.fn(async () => 'tok') });
  await db.esiCache.clear();
});
afterEach(() => {
  configureEsi({ getToken: null });
});

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

describe('readCachedLoyaltyBalances', () => {
  it('maps the cached balances by corporation without calling ESI', async () => {
    await writeCached(
      CHAR_ID,
      'loyalty',
      [
        { corporation_id: 1000130, loyalty_points: 700 },
        { corporation_id: 1000035, loyalty_points: 0 },
      ],
      Date.now()
    );
    const balances = await readCachedLoyaltyBalances(CHAR_ID);
    expect([...balances]).toEqual([
      [1000130, 700],
      [1000035, 0],
    ]);
  });

  it('is empty when nothing is cached yet', async () => {
    expect((await readCachedLoyaltyBalances(CHAR_ID)).size).toBe(0);
  });
});

describe('sumLoyaltyByCorporation', () => {
  it("adds each corporation's points across every list", () => {
    const summed = sumLoyaltyByCorporation([
      [
        { corporation_id: 1000035, loyalty_points: 100 },
        { corporation_id: PARAGON_CORPORATION_ID, loyalty_points: 5 },
      ],
      [
        { corporation_id: 1000035, loyalty_points: 250 },
        { corporation_id: 1000180, loyalty_points: 40 },
        { corporation_id: PARAGON_CORPORATION_ID, loyalty_points: 7 },
      ],
    ]);
    expect(summed).toEqual([
      { corporation_id: 1000035, loyalty_points: 350 },
      { corporation_id: PARAGON_CORPORATION_ID, loyalty_points: 12 },
      { corporation_id: 1000180, loyalty_points: 40 },
    ]);
  });

  it('passes one list through unchanged and gives an empty list for none', () => {
    const one = [{ corporation_id: 1000035, loyalty_points: 100 }];
    expect(sumLoyaltyByCorporation([one])).toEqual(one);
    expect(sumLoyaltyByCorporation([])).toEqual([]);
  });
});

describe('combineLoyaltyStatuses', () => {
  const at = (iso: string) => new Date(iso);
  const cached = (points: number, fetchedAt: Date, fromCache = false) => ({
    data: [{ corporation_id: 1000035, loyalty_points: points }],
    fetchedAt,
    fromCache,
    truncated: false,
  });

  it('sums the readable Characters and names the ones needing a new grant', () => {
    const combined = combineLoyaltyStatuses([
      {
        characterId: 1,
        status: { cached: cached(100, at('2026-10-21T10:00Z')), needsReauth: false },
      },
      {
        characterId: 2,
        status: { cached: cached(50, at('2026-10-21T08:00Z'), true), needsReauth: false },
      },
      { characterId: 3, status: { cached: null, needsReauth: true } },
    ]);
    expect(combined.reauthCharacterIds).toEqual([3]);
    expect(combined.result).toEqual({
      data: [{ corporation_id: 1000035, loyalty_points: 150 }],
      // As fresh as the stalest list in the sum.
      fetchedAt: at('2026-10-21T08:00Z'),
      fromCache: true,
      truncated: false,
    });
  });

  it('leaves out a stale cached list behind a revoked grant', () => {
    const combined = combineLoyaltyStatuses([
      {
        characterId: 1,
        status: { cached: cached(100, at('2026-10-21T10:00Z')), needsReauth: false },
      },
      {
        characterId: 2,
        status: { cached: cached(70, at('2026-10-20T10:00Z'), true), needsReauth: true },
      },
    ]);
    expect(combined.reauthCharacterIds).toEqual([2]);
    expect(combined.result?.data).toEqual([{ corporation_id: 1000035, loyalty_points: 100 }]);
  });

  it('has no result when no Character could be read', () => {
    expect(
      combineLoyaltyStatuses([{ characterId: 1, status: { cached: null, needsReauth: false } }])
    ).toEqual({ result: null, reauthCharacterIds: [] });
  });
});
