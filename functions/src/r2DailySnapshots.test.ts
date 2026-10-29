import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { mergeDays } from './marketOpenPrices.js';
import {
  LP_STORE_OFFERS_R2_KEY,
  openPricesR2Key,
  publishLpStoreOffersToR2,
  writeOpenPricesToR2,
} from './r2DailySnapshots.js';

type Put = (key: string, body: Buffer | string, headers: Record<string, string>) => Promise<void>;

function fakeR2(stored: Record<string, unknown> = {}) {
  const puts: Array<{ key: string; json: unknown; headers: Record<string, string> }> = [];
  const get = async (key: string) => (key in stored ? stored[key] : null);
  const put: Put = async (key, body, headers) => {
    const raw = typeof body === 'string' ? body : gunzipSync(body).toString('utf8');
    puts.push({ key, json: JSON.parse(raw), headers });
  };
  return { get, put, puts };
}

describe('publishLpStoreOffersToR2', () => {
  it('uploads one gzip object holding the stamp and the rows, with a short cache', async () => {
    const { put, puts } = fakeR2();
    const rows = [{ corporationId: 1000001, systemIds: [30000142], offers: [] }];
    await publishLpStoreOffersToR2(rows, 123, put);
    expect(puts).toHaveLength(1);
    expect(puts[0].key).toBe(LP_STORE_OFFERS_R2_KEY);
    expect(puts[0].json).toEqual({ lastSyncedAt: 123, rows });
    expect(puts[0].headers['Content-Encoding']).toBe('gzip');
    expect(puts[0].headers['Cache-Control']).toBe('public, max-age=300');
  });
});

describe('writeOpenPricesToR2', () => {
  it('merges into the stored object and creates a missing one', async () => {
    const { get, put, puts } = fakeR2({
      [openPricesR2Key(34)]: {
        typeId: 34,
        dates: ['2026-10-16'],
        stations: { 1: { buy: [1], sell: [2] } },
      },
    });
    const result = await writeOpenPricesToR2(
      [
        { typeId: 34, days: [{ date: '2026-10-17', stations: { 1: { buy: 3, sell: 4 } } }] },
        { typeId: 35, days: [{ date: '2026-10-17', stations: { 1: { buy: null, sell: 5 } } }] },
      ],
      mergeDays,
      { get, put }
    );
    expect(result).toEqual({ written: 2, skipped: 0, failed: 0, firstError: null });
    const byKey = Object.fromEntries(puts.map((p) => [p.key, p]));
    expect(byKey['open-prices/34.json'].json).toEqual({
      typeId: 34,
      dates: ['2026-10-16', '2026-10-17'],
      stations: { 1: { buy: [1, 3], sell: [2, 4] } },
    });
    expect(byKey['open-prices/35.json'].json).toMatchObject({
      dates: ['2026-10-17'],
      stations: { 1: { buy: [null], sell: [5] } },
    });
    expect(byKey['open-prices/34.json'].headers['Cache-Control']).toBe('public, max-age=3600');
  });

  it('skips the put when the merge leaves the stored object unchanged', async () => {
    const stored = {
      typeId: 34,
      dates: ['2026-10-16'],
      stations: { 1: { buy: [1], sell: [2] } },
    };
    const { get, put, puts } = fakeR2({ [openPricesR2Key(34)]: stored });
    const seen: number[] = [];
    const result = await writeOpenPricesToR2(
      [
        { typeId: 34, days: [{ date: '2026-10-16', stations: { 1: { buy: 1, sell: 2 } } }] },
        { typeId: 35, days: [{ date: '2026-10-16', stations: { 1: { buy: 1, sell: 2 } } }] },
      ],
      mergeDays,
      { get, put },
      (n) => seen.push(n)
    );
    expect(result).toEqual({ written: 1, skipped: 1, failed: 0, firstError: null });
    expect(puts.map((p) => p.key)).toEqual(['open-prices/35.json']);
    expect(seen.at(-1)).toBe(1);
  });

  it('still writes when the stored object differs from the merge', async () => {
    const stored = {
      typeId: 34,
      dates: ['2026-10-16'],
      stations: { 1: { buy: [1], sell: [2] } },
    };
    const { get, put, puts } = fakeR2({ [openPricesR2Key(34)]: stored });
    const result = await writeOpenPricesToR2(
      [{ typeId: 34, days: [{ date: '2026-10-16', stations: { 1: { buy: 1, sell: 3 } } }] }],
      mergeDays,
      { get, put }
    );
    expect(result).toEqual({ written: 1, skipped: 0, failed: 0, firstError: null });
    expect(puts.map((p) => p.key)).toEqual(['open-prices/34.json']);
  });

  it('counts a failing type instead of throwing, and keeps going', async () => {
    const { put, puts } = fakeR2();
    const get = async (key: string) => {
      if (key === openPricesR2Key(34)) throw new Error('R2 GET open-prices/34.json failed: 500');
      return null;
    };
    const day = { date: '2026-10-17', stations: { 1: { buy: 1, sell: 2 } } };
    const result = await writeOpenPricesToR2(
      [
        { typeId: 34, days: [day] },
        { typeId: 35, days: [day] },
      ],
      mergeDays,
      { get, put }
    );
    expect(result.written).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.firstError).toContain('500');
    expect(puts.map((p) => p.key)).toEqual(['open-prices/35.json']);
  });

  it('consumes a lazy iterable and reports progress', async () => {
    const { get, put } = fakeR2();
    function* items() {
      for (let typeId = 1; typeId <= 70; typeId += 1) {
        yield { typeId, days: [{ date: '2026-10-17', stations: { 1: { buy: 1, sell: 2 } } }] };
      }
    }
    const seen: number[] = [];
    const result = await writeOpenPricesToR2(items(), mergeDays, { get, put }, (n) => seen.push(n));
    expect(result.written).toBe(70);
    expect(seen.at(-1)).toBe(70);
  });
});
