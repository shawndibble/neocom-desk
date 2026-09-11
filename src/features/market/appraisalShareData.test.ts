import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { FUZZWORK_AGGREGATES_URL } from '@/market/fuzzwork';
import { clearMarketPriceCache } from '@/market/prices';
import { DEFAULT_TRADE_HUB, TRADE_HUBS } from '@/market/hubs';
import { encodeAppraisalShare, MAX_SHARE_ITEMS } from '@/engine/market/appraisalShare';
import type { AppraisalOutcome } from './appraisalData';
import { buildAppraisalShareLink, resolveAppraisalShare } from './appraisalShareData';

vi.mock('@/sde/loadMarketSde', () => ({
  loadMarketTypes: vi.fn(async () => [
    { typeId: 34, name: 'Tritanium', marketGroupId: 18 },
    { typeId: 2048, name: 'Damage Control II', marketGroupId: 300 },
  ]),
}));

const server = setupServer();
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  clearMarketPriceCache();
});
afterAll(() => server.close());

function aggregates(body: Record<string, unknown>) {
  return http.get(FUZZWORK_AGGREGATES_URL, () => HttpResponse.json(body));
}

const PRICED = {
  34: {
    buy: { min: '5.0', max: '5.41', volume: '100', orderCount: '4' },
    sell: { min: '5.62', max: '6.0', volume: '200', orderCount: '9' },
  },
};

function outcome(): AppraisalOutcome {
  return {
    appraisal: {
      rows: [
        {
          typeId: 34,
          name: 'Tritanium',
          quantity: 100,
          buyEach: 5,
          sellEach: 6,
          buyTotal: 500,
          sellTotal: 600,
        },
      ],
      totals: {
        buy: 500,
        sell: 600,
        spread: 100,
        unpricedRows: 0,
        refine: 0,
        refineUnpricedRows: 0,
      },
    },
    unmatched: [],
  };
}

describe('buildAppraisalShareLink', () => {
  it('encodes the priced rows into a link the read-only route can decode', () => {
    const result = buildAppraisalShareLink(outcome(), DEFAULT_TRADE_HUB, 90);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.url).toContain('/share/appraisal?d=');
    const payload = decodeURIComponent(new URL(result.url).searchParams.get('d') ?? '');
    expect(payload.startsWith('jita:90:')).toBe(true);
  });

  it('refuses a pile with nothing priced rather than link to nothing', () => {
    const empty = outcome();
    empty.appraisal.rows = [];
    expect(buildAppraisalShareLink(empty, DEFAULT_TRADE_HUB, 90)).toEqual({
      ok: false,
      reason: 'empty',
    });
  });

  it('refuses a pile over the share ceiling', () => {
    const oversized = outcome();
    oversized.appraisal.rows = Array.from({ length: MAX_SHARE_ITEMS + 1 }, (_, i) => ({
      typeId: i + 1,
      name: `Item ${i}`,
      quantity: 1,
      buyEach: null,
      sellEach: null,
      buyTotal: null,
      sellTotal: null,
    }));
    expect(buildAppraisalShareLink(oversized, DEFAULT_TRADE_HUB, 90)).toEqual({
      ok: false,
      reason: 'too-large',
    });
  });
});

describe('resolveAppraisalShare', () => {
  it('re-prices the decoded typeId:quantity pairs live, at the encoded hub and percent', async () => {
    server.use(aggregates(PRICED));
    const encoded = encodeAppraisalShare({
      hub: 'jita',
      pricePercent: 90,
      generatedAt: 1,
      items: [{ typeId: 34, quantity: 100 }],
    });
    if (!encoded.ok) throw new Error('encode failed');

    const result = await resolveAppraisalShare(encoded.payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hub).toBe(TRADE_HUBS[0]);
    expect(result.value.pricePercent).toBe(90);
    expect(result.value.appraisal.rows).toEqual([
      {
        typeId: 34,
        name: 'Tritanium',
        quantity: 100,
        buyEach: 4.869000000000001,
        sellEach: 5.058,
        buyTotal: 486.9000000000001,
        sellTotal: 505.79999999999995,
      },
    ]);
    expect(result.value.unresolvedTypeIds).toEqual([]);
  });

  it('lists a type id this build cannot name, rather than dropping it', async () => {
    server.use(aggregates(PRICED));
    const encoded = encodeAppraisalShare({
      hub: 'jita',
      pricePercent: 100,
      generatedAt: 1,
      items: [
        { typeId: 34, quantity: 1 },
        { typeId: 999_999, quantity: 1 },
      ],
    });
    if (!encoded.ok) throw new Error('encode failed');

    const result = await resolveAppraisalShare(encoded.payload);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.unresolvedTypeIds).toEqual([999_999]);
  });

  it('rejects a payload that fails to decode', async () => {
    expect(await resolveAppraisalShare('garbage')).toEqual({
      ok: false,
      reason: 'invalid-payload',
    });
  });

  it('rejects a hub id that names no real Trade Hub', async () => {
    const encoded = encodeAppraisalShare({
      hub: 'not-a-hub',
      pricePercent: 100,
      generatedAt: 1,
      items: [{ typeId: 34, quantity: 1 }],
    });
    if (!encoded.ok) throw new Error('encode failed');
    expect(await resolveAppraisalShare(encoded.payload)).toEqual({
      ok: false,
      reason: 'unknown-hub',
    });
  });
});
