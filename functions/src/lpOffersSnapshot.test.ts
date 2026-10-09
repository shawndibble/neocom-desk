import { describe, expect, it, vi } from 'vitest';
import {
  buildLpStoreRow,
  fetchLpStoreRows,
  lpOffersUrl,
  parseLpOffers,
  type FetchJsonResult,
} from './lpOffersSnapshot.js';

const ESI_OFFERS = [
  {
    offer_id: 3001,
    type_id: 34,
    quantity: 5000,
    isk_cost: 100000,
    lp_cost: 2500,
    required_items: [{ type_id: 9999, quantity: 2 }],
  },
  { offer_id: 3002, type_id: 587, quantity: 1, isk_cost: 0, lp_cost: 900, required_items: [] },
];

describe('parseLpOffers', () => {
  it('reads each offer into a compact tuple', () => {
    expect(parseLpOffers(ESI_OFFERS)).toEqual([
      [3001, 34, 5000, 100000, 2500, [[9999, 2]]],
      [3002, 587, 1, 0, 900, []],
    ]);
  });

  it('yields empty for a malformed body without throwing', () => {
    expect(parseLpOffers(null)).toEqual([]);
    expect(parseLpOffers({ error: 'nope' })).toEqual([]);
    expect(parseLpOffers('x')).toEqual([]);
  });

  it('skips malformed offers and tolerates malformed required items', () => {
    const body = [
      { offer_id: 'a', type_id: 1 },
      null,
      { offer_id: 1, type_id: 2, quantity: 1, isk_cost: 5, lp_cost: 6, required_items: 'bad' },
      {
        offer_id: 2,
        type_id: 3,
        quantity: 1,
        isk_cost: 5,
        lp_cost: 6,
        required_items: [{ type_id: 1, quantity: 1 }, { type_id: 'x' }],
      },
    ];
    expect(parseLpOffers(body)).toEqual([
      [1, 2, 1, 5, 6, []],
      [2, 3, 1, 5, 6, [[1, 1]]],
    ]);
  });
});

describe('buildLpStoreRow', () => {
  it('joins the corporation to its station systems', () => {
    expect(buildLpStoreRow(1000120, [30000001, 30000003], ESI_OFFERS)).toEqual({
      corporationId: 1000120,
      systemIds: [30000001, 30000003],
      offers: parseLpOffers(ESI_OFFERS),
    });
  });

  it('drops a corporation with no station systems', () => {
    expect(buildLpStoreRow(1000120, [], ESI_OFFERS)).toBeNull();
  });

  it('drops a corporation whose store has no offers or a malformed body', () => {
    expect(buildLpStoreRow(1000120, [30000001], [])).toBeNull();
    expect(buildLpStoreRow(1000120, [30000001], { oops: true })).toBeNull();
  });
});

describe('fetchLpStoreRows', () => {
  const corporations = { 1000120: [30000001], 1000130: [30000002], 1000140: [] as number[] };

  it('fetches each corporation that has stations and builds its row', async () => {
    const fetchJson = vi.fn(async (): Promise<FetchJsonResult> => ({
      status: 200,
      retryAfter: null,
      body: ESI_OFFERS,
    }));
    const result = await fetchLpStoreRows({
      corporations,
      fetchJson,
      sleep: async () => {},
      requestGapMs: 0,
    });
    expect(fetchJson).toHaveBeenCalledTimes(2);
    expect(fetchJson).toHaveBeenCalledWith(lpOffersUrl(1000120));
    expect(result.rows.map((row) => row.corporationId)).toEqual([1000120, 1000130]);
    expect(result.failed).toEqual([]);
  });

  it('retries a rate-limited request after Retry-After, then records a hard failure', async () => {
    const responses: Record<string, FetchJsonResult[]> = {
      [lpOffersUrl(1000120)]: [
        { status: 429, retryAfter: '3', body: null },
        { status: 200, retryAfter: null, body: ESI_OFFERS },
      ],
      [lpOffersUrl(1000130)]: [{ status: 500, retryAfter: null, body: null }],
    };
    const sleep = vi.fn(async () => {});
    const result = await fetchLpStoreRows({
      corporations,
      fetchJson: async (url) => responses[url].shift() as FetchJsonResult,
      sleep,
      requestGapMs: 0,
    });
    expect(sleep).toHaveBeenCalledWith(3000);
    expect(result.rows.map((row) => row.corporationId)).toEqual([1000120]);
    expect(result.failed).toEqual([1000130]);
  });

  it('treats a 404 as a store that no longer exists, not a failure', async () => {
    const result = await fetchLpStoreRows({
      corporations,
      fetchJson: async () => ({ status: 404, retryAfter: null, body: null }),
      sleep: async () => {},
      requestGapMs: 0,
    });
    expect(result.rows).toEqual([]);
    expect(result.failed).toEqual([]);
  });
});
