import { planTrendSeries, type TrendSeriesRef } from '@/engine/market/trendSeries';
import type { MarketHistoryPoint } from '@/engine/market/priceHistory';
import { DAY_MS } from '@/lib/age';

export interface MarketTrendSeries {
  key: string;
  typeId: number;
  hubId: string | null;
  name: string;
  points: MarketHistoryPoint[];
  to: string;
  fromCache: boolean;
  failed: boolean;
}

export interface MarketTrendFeed {
  quickbar: { typeId: number; name: string }[];
  defaultHubId: string;
  globalTypeIds: number[];
  series: Record<string, MarketTrendSeries>;
  fetchedAt: Date | null;
}

export interface MarketTrendRequest {
  quickbar: readonly { typeId: number; name: string }[];
  defaultHubId: string;
  sets: readonly { typeIds: readonly number[]; hubIds: readonly string[] }[];
}

const KEEP_DAYS = 400;

export async function loadMarketTrend(request: MarketTrendRequest): Promise<MarketTrendFeed> {
  const [
    { loadPriceHistory },
    { loadGlobalMarketOverrides },
    { buildMarketParams },
    { EsiError },
    { getTradeHub, DEFAULT_TRADE_HUB },
  ] = await Promise.all([
    import('@/features/market/priceHistory'),
    import('@/features/market/orderBookView'),
    import('@/engine/market/urlState'),
    import('@/esi/errors'),
    import('@/market/hubs'),
  ]);
  const overrides = await loadGlobalMarketOverrides();
  const isGlobal = (typeId: number) => overrides.has(typeId);

  const refs = new Map<string, TrendSeriesRef>();
  for (const set of request.sets) {
    for (const ref of planTrendSeries(set.typeIds, set.hubIds, isGlobal).refs) {
      refs.set(ref.key, ref);
    }
  }

  const names = new Map(request.quickbar.map((item) => [item.typeId, item.name]));
  if ([...refs.values()].some((ref) => !names.has(ref.typeId))) {
    const { loadMarketTypesById } = await import('@/sde/marketTypesById');
    const catalogue = await loadMarketTypesById().catch(() => null);
    for (const ref of refs.values()) {
      const name = catalogue?.get(ref.typeId)?.name;
      if (name !== undefined && !names.has(ref.typeId)) names.set(ref.typeId, name);
    }
  }

  let failures = 0;
  const reads = await Promise.all(
    [...refs.values()].map(async (ref) => {
      const hub = getTradeHub(ref.hubId ?? request.defaultHubId) ?? DEFAULT_TRADE_HUB;
      const global = overrides.get(ref.typeId);
      const params = buildMarketParams(
        ref.typeId,
        global ? { mode: 'region', regionId: global.regionId } : { mode: 'hub', hubId: hub.id }
      );
      let failed = false;
      const result = await loadPriceHistory(global?.regionId ?? hub.regionId, ref.typeId).catch(
        (err: unknown) => {
          if (!(err instanceof EsiError && err.status === 400)) {
            failures += 1;
            failed = true;
          }
          return null;
        }
      );
      const points = result?.points ?? [];
      const newest = points.at(-1)?.date;
      const cutoff =
        newest === undefined
          ? ''
          : new Date(Date.parse(`${newest}T00:00:00Z`) - KEEP_DAYS * DAY_MS)
              .toISOString()
              .slice(0, 10);
      return {
        fetchedAt: result ? result.fetchedAt : null,
        series: {
          key: ref.key,
          typeId: ref.typeId,
          hubId: ref.hubId,
          name: names.get(ref.typeId) ?? `#${ref.typeId}`,
          points: points.filter((p) => p.date >= cutoff),
          to: `/market/browser?${new URLSearchParams(params)}`,
          fromCache: result?.fromCache ?? false,
          failed,
        } satisfies MarketTrendSeries,
      };
    })
  );
  if (reads.length > 0 && failures === reads.length) throw new Error('Market history unavailable');
  const stamps = reads.map((r) => r.fetchedAt).filter((v): v is number => v !== null);
  return {
    quickbar: [...request.quickbar],
    defaultHubId: request.defaultHubId,
    globalTypeIds: [...overrides.keys()],
    series: Object.fromEntries(reads.map((r) => [r.series.key, r.series])),
    fetchedAt: stamps.length === 0 ? null : new Date(Math.min(...stamps)),
  };
}
