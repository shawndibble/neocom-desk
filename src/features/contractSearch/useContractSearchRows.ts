import { useDeferredValue, useMemo } from 'react';
import type { PublicContractOfferRow } from '@/engine/contracts/contractOffers';
import type { ContractOfferFilter, ContractOfferStats } from '@/engine/contracts/contractSearch';
import type { ContractOfferQuery } from '@/engine/contracts/contractSearchQuery';
import type { withinJumpRange } from '@/engine/route/jumpRange';
import type { OfferLocation } from '@/features/contractSearch/offerLocations';
import type { useOfferIndex } from '@/features/contractSearch/useIndexedOffers';
import { useContractOfferQuery } from '@/features/contractSearch/useContractOfferQuery';
import { parseNumeric } from '@/lib/isk';

const NO_LOCATION_SYSTEMS: ReadonlyMap<number, number | null> = new Map();

interface RowsFilter {
  regionId: number | null;
  maxPrice: string;
  minQuantity: string;
  hideExchanges: boolean;
  hideAuctions: boolean;
  hidePlex: boolean;
}

interface ContractSearchRowsInput {
  uiFilter: RowsFilter;
  rows: readonly PublicContractOfferRow[];
  offerIndex: ReturnType<typeof useOfferIndex>;
  earlyRows: readonly PublicContractOfferRow[] | null;
  plexPrice: number | null;
  offerLocations: ReadonlyMap<number, OfferLocation>;
  allowedSystems: Parameters<typeof withinJumpRange>[1] | null;
  typeIds: ReadonlySet<number> | null;
  belowMarket: boolean;
}

export function useContractSearchRows({
  uiFilter,
  rows,
  offerIndex,
  earlyRows,
  plexPrice,
  offerLocations,
  allowedSystems,
  typeIds,
  belowMarket,
}: ContractSearchRowsInput) {
  const nonTypeFilter = useMemo<ContractOfferFilter>(
    () => ({
      regionId: uiFilter.regionId,
      maxPrice: parseNumeric(uiFilter.maxPrice),
      minQuantity: parseNumeric(uiFilter.minQuantity),
      hideExchanges: uiFilter.hideExchanges,
      hideAuctions: uiFilter.hideAuctions,
      hidePlexRequests: uiFilter.hidePlex,
      plexPrice,
    }),
    [
      uiFilter.regionId,
      uiFilter.maxPrice,
      uiFilter.minQuantity,
      uiFilter.hideExchanges,
      uiFilter.hideAuctions,
      uiFilter.hidePlex,
      plexPrice,
    ]
  );
  const locationSystems = useMemo(
    () =>
      allowedSystems === null
        ? NO_LOCATION_SYSTEMS
        : new Map([...offerLocations].map(([id, location]) => [id, location.systemId])),
    [allowedSystems, offerLocations]
  );
  const deferredNonTypeFilter = useDeferredValue(nonTypeFilter);
  const itemQuery = useMemo<ContractOfferQuery>(
    () => ({
      filter: deferredNonTypeFilter,
      typeIds,
      allowedSystems,
      locationSystems,
      sort: !belowMarket,
    }),
    [deferredNonTypeFilter, typeIds, allowedSystems, locationSystems, belowMarket]
  );
  const {
    displayRows,
    stats: queryStats,
    awaitingFirst: awaitingQuery,
  } = useContractOfferQuery(rows, itemQuery);
  const statsByType = useMemo(() => {
    if (offerIndex) {
      const stats = new Map<number, ContractOfferStats>(
        [...offerIndex.types.values()].map((entry) => [
          entry.typeId,
          { offerCount: entry.count, cheapest: entry.cheapest },
        ])
      );
      if (earlyRows !== null) {
        for (const [typeId, typeStats] of queryStats) stats.set(typeId, typeStats);
      }
      return stats;
    }
    return queryStats;
  }, [offerIndex, earlyRows, queryStats]);

  return { nonTypeFilter, statsByType, displayRows, awaitingQuery };
}
