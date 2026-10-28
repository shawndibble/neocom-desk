import { gunzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { VolumeFold } from './marketHistoryVolume.js';
import { LP_STORE_OFFERS_R2_KEY } from './r2DailySnapshots.js';
import {
  publishCostIndices,
  publishLpStoreAndCostIndices,
  publishLpStoreOffers,
  publishLpStoreVolume,
} from './publicDataLpStore.js';

const NOW = Date.UTC(2026, 9, 25, 0, 30);
const offer = {
  offer_id: 1,
  type_id: 34,
  quantity: 10,
  lp_cost: 100,
  isk_cost: 5,
  required_items: [],
};
const CORPS = { 1000001: [30000001], 1000002: [30000002], 1000003: [30000003] };

type Put = (key: string, body: Buffer | string, headers: Record<string, string>) => Promise<void>;
const sleepImpl = async () => {};

function esi(opts: { failCorps?: number[]; industry?: unknown; industryStatus?: number } = {}) {
  return (async (input: string | URL | Request) => {
    const url = String(input);
    if (url.includes('/industry/systems')) {
      return Response.json(
        opts.industry ?? [
          {
            solar_system_id: 30000001,
            cost_indices: [{ activity: 'manufacturing', cost_index: 0.05 }],
          },
        ],
        { status: opts.industryStatus ?? 200 }
      );
    }
    const corp = Number(/stores\/(\d+)\//.exec(url)?.[1]);
    return opts.failCorps?.includes(corp)
      ? new Response('', { status: 500 })
      : Response.json([offer]);
  }) as typeof fetch;
}

const foldDay = (opts: { missing?: string[]; fail?: string[] } = {}) =>
  vi.fn<(date: string, fold: VolumeFold) => Promise<'folded' | 'missing'>>(async (date, fold) => {
    if (opts.fail?.includes(date)) throw new Error('HTTP 500');
    if (opts.missing?.includes(date)) return 'missing';
    fold.add(10000002, 34, 60);
    fold.add(10000002, 35, 0);
    return 'folded';
  });

describe('publishLpStoreOffers', () => {
  it('publishes the snapshot under the existing key', async () => {
    const put = vi.fn<Put>(async () => {});
    await publishLpStoreOffers({
      get: async () => null,
      put,
      fetchImpl: esi(),
      now: () => NOW,
      sleepImpl,
      corporations: CORPS,
      requestGapMs: 0,
    });
    expect(put).toHaveBeenCalledTimes(1);
    const [key, body] = put.mock.calls[0];
    expect(key).toBe(LP_STORE_OFFERS_R2_KEY);
    const parsed = JSON.parse(gunzipSync(body as Buffer).toString());
    expect(parsed.lastSyncedAt).toBe(NOW);
    expect(parsed.rows).toHaveLength(3);
  });

  it('sends the ESI identification headers', async () => {
    const seen: Array<Record<string, string>> = [];
    await publishLpStoreOffers({
      get: async () => null,
      put: async () => {},
      fetchImpl: (async (_url: string | URL | Request, init?: RequestInit) => {
        seen.push(init?.headers as Record<string, string>);
        return Response.json([offer]);
      }) as typeof fetch,
      sleepImpl,
      corporations: { 1000001: [30000001] },
      requestGapMs: 0,
    });
    expect(seen[0]['X-Compatibility-Date']).toBeTruthy();
    expect(seen[0]['X-User-Agent']).toContain('Neocom Desk');
  });

  it('publishes nothing and throws when too many corporations failed', async () => {
    const put = vi.fn<Put>(async () => {});
    await expect(
      publishLpStoreOffers({
        get: async () => null,
        put,
        fetchImpl: esi({ failCorps: [1000001, 1000002] }),
        sleepImpl,
        corporations: CORPS,
        requestGapMs: 0,
      })
    ).rejects.toThrow('nothing published');
    expect(put).not.toHaveBeenCalled();
  });
});

describe('publishCostIndices', () => {
  it('merges today into each system object', async () => {
    const put = vi.fn<Put>(async () => {});
    await publishCostIndices({ get: async () => null, put, fetchImpl: esi(), now: () => NOW });
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0]).toBe('cost-indices/30000001.json');
    const stored = JSON.parse(gunzipSync(put.mock.calls[0][1] as Buffer).toString());
    expect(stored.dates).toEqual(['2026-10-25']);
  });

  it('throws on an HTTP error or an empty body, writing nothing', async () => {
    const put = vi.fn<Put>(async () => {});
    await expect(
      publishCostIndices({
        get: async () => null,
        put,
        fetchImpl: esi({ industryStatus: 503 }),
      })
    ).rejects.toThrow('HTTP 503');
    await expect(
      publishCostIndices({ get: async () => null, put, fetchImpl: esi({ industry: [] }) })
    ).rejects.toThrow('no systems parsed');
    expect(put).not.toHaveBeenCalled();
  });
});

describe('publishLpStoreAndCostIndices', () => {
  it('still runs cost indices when the LP half fails, then fails naming it', async () => {
    const put = vi.fn<Put>(async () => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      publishLpStoreAndCostIndices({
        get: async () => null,
        put,
        fetchImpl: esi({ failCorps: [1000001, 1000002, 1000003] }),
        sleepImpl,
        corporations: CORPS,
        requestGapMs: 0,
        now: () => NOW,
        foldDayImpl: foldDay(),
      })
    ).rejects.toThrow('Sync failed: LP store offers');
    const keys = put.mock.calls.map((c) => c[0]);
    expect(keys).toContain('cost-indices/30000001.json');
    expect(keys).toContain('lp-store-volume/10000002.json');
    expect(keys).not.toContain(LP_STORE_OFFERS_R2_KEY);
  });
});

describe('publishLpStoreVolume', () => {
  const base = { get: async () => null, now: () => NOW, sleepImpl };

  it('publishes one object per hub region: units per day over the days read', async () => {
    const put = vi.fn<Put>(async () => {});
    const fold = foldDay({ missing: ['2026-10-24', '2026-10-23'] });
    await publishLpStoreVolume({ ...base, put, foldDayImpl: fold });
    expect(fold).toHaveBeenCalledTimes(30);
    expect(
      put.mock.calls
        .map((c) => c[0])
        .filter((k) => k.startsWith('lp-store-volume/'))
        .sort()
    ).toEqual(
      [10000002, 10000043, 10000032, 10000030, 10000042]
        .map((r) => `lp-store-volume/${r}.json`)
        .sort()
    );
    const forge = put.mock.calls.find((c) => c[0] === 'lp-store-volume/10000002.json')!;
    expect(JSON.parse(gunzipSync(forge[1] as Buffer).toString())).toEqual({
      lastSyncedAt: NOW,
      days: 28,
      // 28 days x 60 units / 28 days; type 35 never traded, so it is absent.
      perDay: { 34: 60 },
    });
    const domain = put.mock.calls.find((c) => c[0] === 'lp-store-volume/10000043.json')!;
    expect(JSON.parse(gunzipSync(domain[1] as Buffer).toString()).perDay).toEqual({});
  });

  it('publishes a sibling hauling-demand object per hub region, as of the newest day of the window', async () => {
    const put = vi.fn<Put>(async () => {});
    const fold = vi.fn<(date: string, fold: VolumeFold) => Promise<'folded' | 'missing'>>(
      async (date, f) => {
        if (date === '2026-10-24' || date === '2026-10-23') return 'missing';
        f.addDay(10000002, 34, { date, volume: 60, highest: 5, lowest: 4, orderCount: 3 });
        return 'folded';
      }
    );
    await publishLpStoreVolume({ ...base, put, foldDayImpl: fold });
    expect(
      put.mock.calls
        .map((c) => c[0])
        .filter((k) => k.startsWith('hauling-demand/'))
        .sort()
    ).toEqual(
      [10000002, 10000043, 10000032, 10000030, 10000042]
        .map((r) => `hauling-demand/${r}.json`)
        .sort()
    );
    const forge = put.mock.calls.find((c) => c[0] === 'hauling-demand/10000002.json')!;
    expect(JSON.parse(gunzipSync(forge[1] as Buffer).toString())).toEqual({
      lastSyncedAt: NOW,
      asOf: '2026-10-24',
      days: 28,
      // 28 trading days x 60 units; the newest folded day is the 22nd.
      types: { 34: [1680, 28, 84, 5, '2026-10-22', 5, 4] },
    });
  });

  it('publishes nothing when a day keeps failing', async () => {
    const put = vi.fn<Put>(async () => {});
    await expect(
      publishLpStoreVolume({ ...base, put, foldDayImpl: foldDay({ fail: ['2026-10-20'] }) })
    ).rejects.toThrow(/nothing published/);
    expect(put).not.toHaveBeenCalled();
  });

  it('publishes nothing when too few days are published', async () => {
    const put = vi.fn<Put>(async () => {});
    const missing = Array.from({ length: 15 }, (_, i) => `2026-10-${String(10 + i)}`);
    await expect(
      publishLpStoreVolume({ ...base, put, foldDayImpl: foldDay({ missing }) })
    ).rejects.toThrow(/nothing published/);
    expect(put).not.toHaveBeenCalled();
  });
});
