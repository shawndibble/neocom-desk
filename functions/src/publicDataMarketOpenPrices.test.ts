import { gunzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { SNAPSHOT_HUBS } from './marketOpenPrices.js';
import type { foldSnapshotUrl } from './marketOrdersArchive.js';
import {
  MARKET_OPEN_PRICES_STATE_R2_KEY,
  publishMarketOpenPrices,
} from './publicDataMarketOpenPrices.js';

const NOW = Date.UTC(2026, 9, 25, 0, 45);
const DATE = '2026-10-24';
const JITA = SNAPSHOT_HUBS[0];
const REGIONS = SNAPSHOT_HUBS.map((h) => h.regionId);

type Put = (key: string, body: Buffer | string, headers: Record<string, string>) => Promise<void>;

const final = async () => ({
  final: true as const,
  snapshot: { url: 'https://example.test/orders.csv.bz2', fileTime: `${DATE}T23:45:00Z` },
});

/** Folds one Jita type, plus `perRegion` priced types in every tracked region. */
const fold =
  (perRegion: number): typeof foldSnapshotUrl =>
  async (_url, f, _ua, stations) => {
    for (const regionId of REGIONS) {
      for (let t = 1; t <= perRegion; t++) f.add(regionId, t, false, 10);
    }
    stations?.add(JITA.stationId, 34, true, 5);
    stations?.add(JITA.stationId, 34, false, 7);
    return 1;
  };

function deps(over: Record<string, unknown> = {}, state: unknown = null) {
  const put = vi.fn<Put>(async () => {});
  return {
    put,
    d: {
      get: async (key: string) => (key === MARKET_OPEN_PRICES_STATE_R2_KEY ? state : null),
      put,
      now: () => NOW,
      findFinalImpl: final,
      foldUrlImpl: fold(2000),
      ...over,
    } as Parameters<typeof publishMarketOpenPrices>[0],
  };
}

describe('publishMarketOpenPrices', () => {
  it('writes the open-prices object and then the state', async () => {
    const { d, put } = deps();
    expect(await publishMarketOpenPrices(d)).toBe(true);
    const [key, body] = put.mock.calls[0];
    expect(key).toBe('open-prices/34.json');
    expect(JSON.parse(gunzipSync(body as Buffer).toString())).toMatchObject({
      typeId: 34,
      dates: [DATE],
    });
    const [stateKey, stateBody] = put.mock.calls[1];
    expect(stateKey).toBe(MARKET_OPEN_PRICES_STATE_R2_KEY);
    expect(JSON.parse(stateBody as string).date).toBe(DATE);
  });

  it('exits early when the day is already published', async () => {
    const foldUrlImpl = vi.fn();
    const { d, put } = deps({ foldUrlImpl }, { date: DATE, regions: {} });
    expect(await publishMarketOpenPrices(d)).toBe(false);
    expect(foldUrlImpl).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  it('throws while the final snapshot is not listed', async () => {
    const { d, put } = deps({ findFinalImpl: async () => ({ final: false, snapshot: null }) });
    await expect(publishMarketOpenPrices(d)).rejects.toThrow(/no final snapshot/);
    expect(put).not.toHaveBeenCalled();
  });

  it('publishes nothing for an implausibly thin snapshot', async () => {
    const { d, put } = deps({ foldUrlImpl: fold(10) });
    await expect(publishMarketOpenPrices(d)).rejects.toThrow(/nothing published/);
    expect(put).not.toHaveBeenCalled();
  });

  it('publishes nothing when a region shrank under half its last count', async () => {
    const regions = Object.fromEntries(REGIONS.map((id) => [String(id), 5000]));
    const { d, put } = deps({}, { date: '2026-10-23', regions });
    await expect(publishMarketOpenPrices(d)).rejects.toThrow(/shrank/);
    expect(put).not.toHaveBeenCalled();
  });

  it('records no state when a type fails to write', async () => {
    const put = vi.fn<Put>(async (key) => {
      if (key.startsWith('open-prices/')) throw new Error('boom');
    });
    const { d } = deps({ put });
    await expect(publishMarketOpenPrices(d)).rejects.toThrow(/failed to write/);
    expect(put.mock.calls.some(([k]) => k === MARKET_OPEN_PRICES_STATE_R2_KEY)).toBe(false);
  });
});
