import { useCallback, type ReactElement } from 'react';
import type { TFunction } from 'i18next';
import type { RegionOrder } from '@/esi/endpoints';
import type { NpcStationLookup, SolarSystemLookup } from '@/engine/market/orderBook';
import type { MarketLocationParam } from '@/engine/market/urlState';
import type { MarketRegionEntry } from '@/sde/marketTypes';
import type { TradeHub } from '@/market/hubs';
import { OrderRowContextMenu } from '@/features/market/OrderRowContextMenu';
import type { OrderBookScope } from '@/features/market/OrderBookScopeBar';
import type { BrowserFilterValue } from '@/features/market/useBrowserFilters';
import { useNoOrdersCue } from '@/features/market/regionMarketTypes';

export interface UseMarketOrderBookViewArgs {
  t: TFunction;
  onBrowserTab: boolean;
  onAppraisalTab: boolean;
  refreshAppraisal: () => void;
  catalogueError: boolean;
  retryCatalogue: () => void;
  refreshOrderBook: () => void;
  npcStationMap: ReadonlyMap<number, NpcStationLookup>;
  solarSystemMap: ReadonlyMap<number, SolarSystemLookup>;
  marketRegions: MarketRegionEntry[] | null;
  myOrderIds: ReadonlySet<number>;
  setStationFilter: (locationId: number) => void;
  selectedTypeId: number | null;
  selectedItemName: string | undefined;
  effectiveLocation: MarketLocationParam;
  effectiveHub: TradeHub;
  allRegions: boolean;
  chosenRegionId: number;
  hubRegionName: string;
  rangeAcross: boolean;
  browserFilterValue: BrowserFilterValue;
  singleRegionId: number | null;
  globalMarkets: ReadonlyMap<number, unknown> | null;
  sortedSell: readonly RegionOrder[];
  sortedBuy: readonly RegionOrder[];
  knownJumps: ReadonlyMap<number, number> | null;
}

export function useMarketOrderBookView({
  t,
  onBrowserTab,
  onAppraisalTab,
  refreshAppraisal,
  catalogueError,
  retryCatalogue,
  refreshOrderBook,
  npcStationMap,
  solarSystemMap,
  marketRegions,
  myOrderIds,
  setStationFilter,
  selectedTypeId,
  selectedItemName,
  effectiveLocation,
  effectiveHub,
  allRegions,
  chosenRegionId,
  hubRegionName,
  rangeAcross,
  browserFilterValue,
  singleRegionId,
  globalMarkets,
  sortedSell,
  sortedBuy,
  knownJumps,
}: UseMarketOrderBookViewArgs) {
  function handleRefresh() {
    if (onAppraisalTab) {
      refreshAppraisal();
      return;
    }
    if (catalogueError) {
      retryCatalogue();
      return;
    }
    refreshOrderBook();
  }

  const orderRowClassName = useCallback(
    (order: RegionOrder) => (myOrderIds.has(order.order_id) ? 'row-mine' : undefined),
    [myOrderIds]
  );

  const orderRowContextMenu = useCallback(
    (order: RegionOrder, tr: ReactElement) => (
      <OrderRowContextMenu
        order={order}
        trigger={tr}
        npcStations={npcStationMap}
        solarSystems={solarSystemMap}
        onFilterToStation={setStationFilter}
        typeId={selectedTypeId ?? 0}
        itemName={selectedItemName ?? ''}
      />
    ),
    [npcStationMap, solarSystemMap, setStationFilter, selectedTypeId, selectedItemName]
  );

  const noOrders = useNoOrdersCue(
    onBrowserTab ? singleRegionId : null,
    effectiveLocation.mode === 'hub'
      ? effectiveHub.regionName
      : (marketRegions?.find((region) => region.id === singleRegionId)?.name ?? null),
    globalMarkets
  );

  const scopeLabel =
    effectiveLocation.mode === 'hub'
      ? effectiveHub.systemName
      : allRegions
        ? t('market.allRegions')
        : (marketRegions?.find((region) => region.id === chosenRegionId)?.name ?? hubRegionName);
  const anyRangeLabel =
    effectiveLocation.mode === 'hub'
      ? t('market.scope.hubStationOnly', { hub: scopeLabel })
      : allRegions
        ? scopeLabel
        : t('market.scope.anywhereIn', { region: scopeLabel });

  const bookStationCount = new Set([...sortedSell, ...sortedBuy].map((o) => o.location_id)).size;
  const bookScope: OrderBookScope =
    rangeAcross && browserFilterValue.jumps !== 'any'
      ? { kind: 'range', jumps: browserFilterValue.jumps, stationCount: bookStationCount }
      : effectiveLocation.mode === 'hub'
        ? {
            kind: 'station',
            stationName: npcStationMap.get(effectiveHub.stationId)?.name ?? effectiveHub.systemName,
            systemId: effectiveHub.systemId,
            security: solarSystemMap.get(effectiveHub.systemId)?.security ?? null,
            jumpsAway: knownJumps?.get(effectiveHub.systemId) ?? null,
          }
        : { kind: 'region', regionName: scopeLabel, stationCount: bookStationCount };
  const priceScopeName = allRegions ? hubRegionName : scopeLabel;
  const scopeNote = allRegions
    ? t('market.allRegionsSecondaryNote', { regionName: hubRegionName })
    : rangeAcross
      ? t('market.rangeSecondaryNote', { scope: scopeLabel })
      : null;

  return {
    handleRefresh,
    orderRowClassName,
    orderRowContextMenu,
    noOrders,
    anyRangeLabel,
    bookScope,
    priceScopeName,
    scopeNote,
  };
}
