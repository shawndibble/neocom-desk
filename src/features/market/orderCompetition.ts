import type { HubAggregate } from '@/market/fuzzwork';
import { getStationPricesWithStatus, invalidateHubPrices } from '@/market/prices';
import { getOrderBook } from './orderBook';
import { getStructureMarketOrders, type StructureMarketOrder } from '@/esi/endpoints';
import { conditionalPagedFetch, loadPaginatedWithCache } from '@/esi/cache';
import { isCredentialFailure } from '@/esi/client';
import type { CompetingOrder } from '@/engine/market/undercut';
import { ESI_FANOUT_CONCURRENCY, mapWithConcurrencyLimit } from '@/lib/concurrency';
import { stationPriceKey } from './stationPriceKey';
import type { StructureCompetitor } from './openOrdersModel';

export async function loadStationBestPrices(
  requests: readonly { stationId: number; typeIds: readonly number[] }[]
): Promise<Map<string, HubAggregate>> {
  const result = new Map<string, HubAggregate>();

  await mapWithConcurrencyLimit(
    requests,
    ESI_FANOUT_CONCURRENCY,
    async ({ stationId, typeIds }) => {
      const uniqueTypeIds = Array.from(new Set(typeIds));
      if (uniqueTypeIds.length === 0) return;

      try {
        const { prices, unreachable } = await getStationPricesWithStatus(
          stationId,
          uniqueTypeIds,
          Date.now,
          { allowStale: false }
        );
        if (unreachable) return;
        for (const typeId of uniqueTypeIds) {
          const aggregate = prices.get(typeId);
          if (aggregate) result.set(stationPriceKey(stationId, typeId), aggregate);
        }
      } catch {}
    }
  );

  return result;
}

export function invalidateStationBestPrices(loaded: ReadonlyMap<string, HubAggregate>): void {
  const typesByStation = new Map<number, number[]>();
  for (const key of loaded.keys()) {
    const [stationId, typeId] = key.split(':').map(Number);
    const ids = typesByStation.get(stationId) ?? [];
    ids.push(typeId);
    typesByStation.set(stationId, ids);
  }
  for (const [stationId, ids] of typesByStation) invalidateHubPrices(stationId, ids);
}

export interface RegionCompetition {
  competitors: CompetingOrder[];
  fetchedAt: number;
  truncated: boolean;
}

export async function loadRegionCompetition(
  regionId: number,
  typeId: number
): Promise<RegionCompetition> {
  const { orders, truncated, fetchedAt } = await getOrderBook(regionId, typeId);
  const competitors: CompetingOrder[] = orders.map((o) => ({
    orderId: o.order_id,
    price: o.price,
    locationId: o.location_id,
    systemId: o.system_id,
    volumeRemain: o.volume_remain,
    isBuyOrder: o.is_buy_order,
    range: o.range,
    minVolume: o.min_volume,
  }));
  return { competitors, fetchedAt, truncated };
}

export interface StructureCompetition {
  competitors: StructureCompetitor[];
  truncated: boolean;
}

const STRUCTURE_MARKET_STALE_AFTER_MS = 300_000;

function structureMarketCacheKey(structureId: number): string {
  return `structure-market:${structureId}`;
}

export async function loadStructureCompetition(
  characterId: number,
  structureId: number
): Promise<StructureCompetition | null> {
  const { fetchLive, conditional } = conditionalPagedFetch((options) =>
    getStructureMarketOrders(characterId, structureId, options)
  );
  const result = await loadPaginatedWithCache<StructureMarketOrder>(
    characterId,
    structureMarketCacheKey(structureId),
    fetchLive,
    {
      conditional,
      staleAfterMs: STRUCTURE_MARKET_STALE_AFTER_MS,
      detectAuthFailure: isCredentialFailure,
    }
  );
  if (!result) return null;
  const competitors: StructureCompetitor[] = result.data.map((o) => ({
    orderId: o.order_id,
    typeId: o.type_id,
    price: o.price,
    locationId: o.location_id,
    systemId: 0,
    volumeRemain: o.volume_remain,
    isBuyOrder: o.is_buy_order,
  }));
  return { competitors, truncated: result.truncated };
}
