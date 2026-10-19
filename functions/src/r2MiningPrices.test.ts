import { gunzipSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { SNAPSHOT_HUBS } from './marketOpenPrices.js';
import { MINING_PRICES_MIGRATED_KEY } from './miningHubPrices.js';
import { publishMiningPricesToR2 } from './r2MiningPrices.js';

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

describe('publishMiningPricesToR2', () => {
  const jitaDay = (buy: number) => ({
    tier: 'saved' as const,
    prices: { 34: [buy, 6] as [number, number] },
  });
  const legacyDoc = (source: string, buy: number) => ({
    source,
    hubs: { 60003760: { 34: { buy, sell: 6, buyCount: 1, sellCount: 1 } } },
  });

  function io(
    stored: Record<string, unknown> = {},
    legacy: { date: string; data: unknown }[] = []
  ) {
    const r2 = fakeR2(stored);
    const deleted: string[] = [];
    let legacyReads = 0;
    return {
      r2,
      deleted,
      legacyReads: () => legacyReads,
      io: {
        get: r2.get,
        put: r2.put,
        del: async (key: string) => {
          deleted.push(key);
        },
        loadLegacyDays: async () => {
          legacyReads += 1;
          return legacy;
        },
      },
    };
  }

  it('copies the old marketHistory days once, keeping their tiers, then marks the copy done', async () => {
    const t = io({}, [
      { date: '2026-09-30', data: legacyDoc('fuzzwork', 4) },
      { date: '2026-08-01', data: legacyDoc('adam4eve', 3) },
      // The day the fold also publishes: the fold's end-of-day price wins.
      { date: '2026-10-17', data: legacyDoc('fuzzwork', 1) },
    ]);
    const result = await publishMiningPricesToR2(
      '2026-10-17',
      [{ hubId: 'jita', date: '2026-10-17', day: jitaDay(5) }],
      SNAPSHOT_HUBS,
      t.io
    );
    expect(result).toMatchObject({ objects: 3, migratedDays: 3 });
    const byKey = Object.fromEntries(t.r2.puts.map((p) => [p.key, p]));
    expect(byKey['mining-prices/jita/2026-10.json'].json).toEqual({
      hub: 'jita',
      month: '2026-10',
      days: { '2026-10-17': jitaDay(5) },
    });
    expect(byKey['mining-prices/jita/2026-09.json'].json).toMatchObject({
      days: { '2026-09-30': { tier: 'saved', prices: { 34: [4, 6] } } },
    });
    expect(byKey['mining-prices/jita/2026-08.json'].json).toMatchObject({
      days: { '2026-08-01': { tier: 'historical', prices: { 34: [3, 6] } } },
    });
    expect(byKey['mining-prices/jita/2026-10.json'].headers).toMatchObject({
      'Content-Encoding': 'gzip',
      'Cache-Control': 'public, max-age=3600',
    });
    expect(byKey[MINING_PRICES_MIGRATED_KEY].json).toMatchObject({ date: '2026-10-17', days: 3 });
  });

  it('skips the copy once the marker exists, and merges into the stored month', async () => {
    const t = io({
      [MINING_PRICES_MIGRATED_KEY]: { date: '2026-10-01', days: 90 },
      'mining-prices/jita/2026-10.json': {
        hub: 'jita',
        month: '2026-10',
        days: { '2026-10-16': jitaDay(4) },
      },
    });
    const result = await publishMiningPricesToR2(
      '2026-10-17',
      [{ hubId: 'jita', date: '2026-10-17', day: jitaDay(5) }],
      SNAPSHOT_HUBS,
      t.io
    );
    expect(t.legacyReads()).toBe(0);
    expect(result).toMatchObject({ objects: 1, migratedDays: null });
    expect(t.r2.puts.map((p) => p.key)).toEqual(['mining-prices/jita/2026-10.json']);
    expect(t.r2.puts[0].json).toMatchObject({
      days: { '2026-10-16': jitaDay(4), '2026-10-17': jitaDay(5) },
    });
  });

  it('throws on a failed write and leaves the marker unwritten, so the retry copies again', async () => {
    const t = io({}, [{ date: '2026-09-30', data: legacyDoc('fuzzwork', 4) }]);
    const put: typeof t.io.put = async (key, body, headers) => {
      if (key.endsWith('2026-09.json')) throw new Error('R2 PUT failed: 500');
      return t.r2.put(key, body, headers);
    };
    await expect(
      publishMiningPricesToR2('2026-10-17', [], SNAPSHOT_HUBS, { ...t.io, put })
    ).rejects.toThrow(/500/);
    expect(t.r2.puts.map((p) => p.key)).not.toContain(MINING_PRICES_MIGRATED_KEY);
  });

  it('deletes the month objects past retention and counts, not throws, a failed delete', async () => {
    const t = io({ [MINING_PRICES_MIGRATED_KEY]: {} });
    const del = async (key: string) => {
      if (key === 'mining-prices/hek/2025-07.json') throw new Error('R2 DELETE failed: 500');
      t.deleted.push(key);
    };
    const result = await publishMiningPricesToR2('2026-10-17', [], SNAPSHOT_HUBS, { ...t.io, del });
    expect(t.deleted).toContain('mining-prices/jita/2025-08.json');
    expect(t.deleted).toHaveLength(9);
    expect(result.deleteFailed).toBe(1);
  });
});
