import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { mergeDays } from './marketOpenPrices.js';
import {
  LP_STORE_OFFERS_R2_KEY,
  OPEN_PRICES_SHARD_COUNT,
  openPricesR2Key,
  openPricesShardR2Key,
  publishLpStoreOffersToR2,
  readOpenPricesFromR2,
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
  const day = (date: string, buy: number | null, sell: number | null) => ({
    date,
    stations: { 1: { buy, sell } },
  });
  const SIBLING = 34 + OPEN_PRICES_SHARD_COUNT;
  const shardOf = (puts: ReturnType<typeof fakeR2>['puts'], typeId: number) =>
    (puts.find((p) => p.key === openPricesShardR2Key(typeId))?.json as {
      types: Record<string, unknown>;
    }) ?? null;

  it("merges into the type's entry in its shard, with an hour's cache", async () => {
    const { get, put, puts } = fakeR2({
      [openPricesShardR2Key(34)]: {
        types: {
          34: { typeId: 34, dates: ['2026-10-16'], stations: { 1: { buy: [1], sell: [2] } } },
        },
      },
    });
    const result = await writeOpenPricesToR2(
      [{ typeId: 34, days: [day('2026-10-17', 3, 4)] }],
      mergeDays,
      { get, put }
    );
    expect(result).toEqual({ written: 1, skipped: 0, failed: 0, firstError: null });
    expect(shardOf(puts, 34).types['34']).toEqual({
      typeId: 34,
      dates: ['2026-10-16', '2026-10-17'],
      stations: { 1: { buy: [1, 3], sell: [2, 4] } },
    });
    expect(puts[0].headers['Cache-Control']).toBe('public, max-age=3600');
    expect(puts[0].headers['Content-Encoding']).toBe('gzip');
  });

  it("seeds a type new to its shard from the type's own object, so its history carries over", async () => {
    const reads: string[] = [];
    const r2 = fakeR2({
      [openPricesR2Key(34)]: {
        typeId: 34,
        dates: ['2026-10-16'],
        stations: { 1: { buy: [1], sell: [2] } },
      },
    });
    const get = async (key: string) => (reads.push(key), r2.get(key));
    await writeOpenPricesToR2(
      [
        { typeId: 34, days: [day('2026-10-17', 3, 4)] },
        { typeId: 35, days: [day('2026-10-17', null, 5)] },
      ],
      mergeDays,
      { get, put: r2.put }
    );
    expect(shardOf(r2.puts, 34).types['34']).toMatchObject({ dates: ['2026-10-16', '2026-10-17'] });
    expect(shardOf(r2.puts, 35).types['35']).toMatchObject({
      dates: ['2026-10-17'],
      stations: { 1: { buy: [null], sell: [5] } },
    });
    expect(r2.puts.some((p) => p.key === openPricesR2Key(34))).toBe(false);
    expect(reads).toContain(openPricesR2Key(34));
  });

  it("never reads the type's own object once its shard holds it", async () => {
    const reads: string[] = [];
    const r2 = fakeR2({
      [openPricesShardR2Key(34)]: {
        types: {
          34: { typeId: 34, dates: ['2026-10-16'], stations: { 1: { buy: [1], sell: [2] } } },
        },
      },
    });
    const get = async (key: string) => (reads.push(key), r2.get(key));
    await writeOpenPricesToR2([{ typeId: 34, days: [day('2026-10-17', 3, 4)] }], mergeDays, {
      get,
      put: r2.put,
    });
    expect(reads).toEqual([openPricesShardR2Key(34)]);
  });

  it('writes the types that share a shard in one put, keeping the ones not priced today', async () => {
    const kept = { typeId: 34 + 2 * OPEN_PRICES_SHARD_COUNT, dates: ['2026-10-01'], stations: {} };
    const { get, put, puts } = fakeR2({
      [openPricesShardR2Key(34)]: { types: { [kept.typeId]: kept } },
    });
    const result = await writeOpenPricesToR2(
      [
        { typeId: 34, days: [day('2026-10-17', 1, 2)] },
        { typeId: SIBLING, days: [day('2026-10-17', 3, 4)] },
      ],
      mergeDays,
      { get, put }
    );
    expect(result.written).toBe(1);
    expect(puts.map((p) => p.key)).toEqual([openPricesShardR2Key(34)]);
    expect(Object.keys(shardOf(puts, 34).types).sort()).toEqual(
      [String(kept.typeId), '34', String(SIBLING)].sort()
    );
    expect(shardOf(puts, 34).types[String(kept.typeId)]).toEqual(kept);
  });

  it('skips the put when the merge leaves the shard unchanged', async () => {
    const stored = { typeId: 34, dates: ['2026-10-16'], stations: { 1: { buy: [1], sell: [2] } } };
    const { get, put, puts } = fakeR2({ [openPricesShardR2Key(34)]: { types: { 34: stored } } });
    const seen: number[] = [];
    const result = await writeOpenPricesToR2(
      [
        { typeId: 34, days: [day('2026-10-16', 1, 2)] },
        { typeId: 35, days: [day('2026-10-16', 1, 2)] },
      ],
      mergeDays,
      { get, put },
      (n) => seen.push(n)
    );
    expect(result).toEqual({ written: 1, skipped: 1, failed: 0, firstError: null });
    expect(puts.map((p) => p.key)).toEqual([openPricesShardR2Key(35)]);
    expect(seen.at(-1)).toBe(1);
  });

  it('counts a shard it cannot read instead of throwing, never overwrites it, and keeps going', async () => {
    const { put, puts } = fakeR2();
    const get = async (key: string) => {
      if (key === openPricesShardR2Key(34)) throw new Error('R2 GET failed: 500');
      return null;
    };
    const result = await writeOpenPricesToR2(
      [
        { typeId: 34, days: [day('2026-10-17', 1, 2)] },
        { typeId: 35, days: [day('2026-10-17', 1, 2)] },
      ],
      mergeDays,
      { get, put }
    );
    expect(result).toMatchObject({ written: 1, failed: 1 });
    expect(result.firstError).toContain('500');
    expect(puts.map((p) => p.key)).toEqual([openPricesShardR2Key(35)]);
  });

  it('fails a shard not shaped like one rather than overwriting it', async () => {
    const { get, put, puts } = fakeR2({ [openPricesShardR2Key(34)]: ['nope'] });
    const result = await writeOpenPricesToR2(
      [{ typeId: 34, days: [day('2026-10-17', 1, 2)] }],
      mergeDays,
      { get, put }
    );
    expect(result).toMatchObject({ written: 0, failed: 1 });
    expect(puts).toEqual([]);
  });

  it('consumes a lazy iterable and reports progress', async () => {
    const { get, put } = fakeR2();
    function* items() {
      for (let typeId = 1; typeId <= 70; typeId += 1) {
        yield { typeId, days: [day('2026-10-17', 1, 2)] };
      }
    }
    const seen: number[] = [];
    const result = await writeOpenPricesToR2(items(), mergeDays, { get, put }, (n) => seen.push(n));
    expect(result.written).toBe(70);
    expect(seen.at(-1)).toBe(70);
  });
});

describe('readOpenPricesFromR2', () => {
  const doc = { typeId: 34, dates: ['2026-10-16'], stations: { 1: { buy: [1], sell: [2] } } };

  it('names a shard by the type id modulo the shard count, like the client', () => {
    expect(openPricesShardR2Key(34)).toBe('open-prices/shards/34.json');
    expect(openPricesShardR2Key(34 + OPEN_PRICES_SHARD_COUNT)).toBe('open-prices/shards/34.json');
  });

  it("reads the type out of its shard, not the type's own object", async () => {
    const reads: string[] = [];
    const { get } = fakeR2({ [openPricesShardR2Key(34)]: { types: { 34: doc } } });
    const tracked = async (key: string) => (reads.push(key), get(key));
    expect(await readOpenPricesFromR2(tracked, 34)).toEqual(doc);
    expect(reads).toEqual([openPricesShardR2Key(34)]);
  });

  it("falls back to the type's own object when no shard holds it", async () => {
    const { get } = fakeR2({
      [openPricesShardR2Key(34)]: { types: {} },
      [openPricesR2Key(34)]: doc,
    });
    expect(await readOpenPricesFromR2(get, 34)).toEqual(doc);
  });

  it("falls back to the type's own object before any shard exists", async () => {
    const { get } = fakeR2({ [openPricesR2Key(34)]: doc });
    expect(await readOpenPricesFromR2(get, 34)).toEqual(doc);
  });

  it('is null when neither has the type', async () => {
    expect(await readOpenPricesFromR2(fakeR2().get, 34)).toBeNull();
  });
});
