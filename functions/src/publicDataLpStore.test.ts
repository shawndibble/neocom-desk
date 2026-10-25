import { gunzipSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { LP_STORE_OFFERS_R2_KEY } from './r2DailySnapshots.js';
import {
  publishCostIndices,
  publishLpStoreAndCostIndices,
  publishLpStoreOffers,
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
      })
    ).rejects.toThrow('Sync failed: LP store offers');
    expect(put.mock.calls.map((c) => c[0])).toEqual(['cost-indices/30000001.json']);
  });
});
