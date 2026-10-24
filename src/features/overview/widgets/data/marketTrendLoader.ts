/**
 * The Market Trend widgets' price history, read once for every widget.
 *
 * One read per line (item at a Trade Hub), shared by the widgets that draw it:
 * two Market Trend widgets pricing Tritanium at Jita make one request. The
 * request names each widget's items and hubs; this plans their lines, reads
 * the distinct ones through Price History's own cached loader, and hands the
 * builder a table keyed by line. A global-market item (PLEX) is read at its
 * own region whatever the hub.
 */
import { planTrendSeries, type TrendSeriesRef } from '@/engine/market/trendSeries';
import type { MarketHistoryPoint } from '@/engine/market/priceHistory';

export interface MarketTrendSeries {
  key: string;
  typeId: number;
  /** The Trade Hub it is priced at; null for a global-market item. */
  hubId: string | null;
  name: string;
  /** Daily rows, oldest first; empty for a type with no market. */
  points: MarketHistoryPoint[];
  /** Where the item's Price History opens. */
  to: string;
  fromCache: boolean;
}

export interface MarketTrendFeed {
  /** The Quickbar entries the widgets that follow it draw from. */
  quickbar: { typeId: number; name: string }[];
  /** The hub a widget with none of its own prices at. */
  defaultHubId: string;
  /** Items that trade in one region whatever the hub. */
  globalTypeIds: number[];
  series: Record<string, MarketTrendSeries>;
  /** The oldest of the reads, so the widget's age is the staleest of its lines. */
  fetchedAt: Date | null;
}

export interface MarketTrendRequest {
  quickbar: readonly { typeId: number; name: string }[];
  defaultHubId: string;
  /** One entry per Market Trend widget: the items and hubs it resolved to. */
  sets: readonly { typeIds: readonly number[]; hubIds: readonly string[] }[];
}

/** Rows kept per line: the longest chart range (a year) plus the base row a 30-day change needs. */
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
      // A type with no market (ESI 400) is a row of unknowns; any other failure is counted.
      const result = await loadPriceHistory(global?.regionId ?? hub.regionId, ref.typeId).catch(
        (err: unknown) => {
          if (!(err instanceof EsiError && err.status === 400)) failures += 1;
          return null;
        }
      );
      const points = result?.points ?? [];
      const newest = points.at(-1)?.date;
      const cutoff =
        newest === undefined
          ? ''
          : new Date(Date.parse(`${newest}T00:00:00Z`) - KEEP_DAYS * 86_400_000)
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
        } satisfies MarketTrendSeries,
      };
    })
  );
  // Every read failing is a failed widget, not a quiet "no history".
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
