/**
 * What the Market Browser's order book says about itself: the header Refresh
 * action, the scope words (hub or region, range, station count), the tree's
 * "No orders" cue and each row's context menu. Derived from the browser's
 * location and the loaded book; owns no state of its own.
 */
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
  /** Only the Browser tab draws the tree, so only it asks for the "No orders" list. */
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
    // On Appraisal the button re-prices the pasted list instead, dropping the
    // Fuzzwork TTL for those types only (`invalidateHubPrices`). Nothing
    // below applies: there is no selected item and no order book on this tab.
    if (onAppraisalTab) {
      refreshAppraisal();
      return;
    }
    // A failed catalogue load leaves no item to select, so Refresh retries
    // the catalogue itself, the one recovery this page has short of F5.
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

  // The tree's "No orders in {Region}" cue (#6200) names the browser's one
  // region; a region pick with no name yet shows no cue rather than a guess.
  const noOrders = useNoOrdersCue(
    onBrowserTab ? singleRegionId : null,
    effectiveLocation.mode === 'hub'
      ? effectiveHub.regionName
      : (marketRegions?.find((region) => region.id === singleRegionId)?.name ?? null),
    globalMarkets
  );

  // The header's hub or region, as the Distance select's "no range" option:
  // with no range set, that is what the book reads.
  const scopeLabel =
    effectiveLocation.mode === 'hub'
      ? effectiveHub.systemName
      : allRegions
        ? t('market.allRegions')
        : (marketRegions?.find((region) => region.id === chosenRegionId)?.name ?? hubRegionName);

  // What the scope bar says the book is reading. Distances are known at every
  // range, so the hub's own distance shows even with no range set.
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
  // Where the per-item prices beside the book (the hub comparison, the
  // Variations rows) are read: `orderBookLocation`, which is one region even
  // under All regions — the hub's — so it is named as that, not "All regions".
  const priceScopeName = allRegions ? hubRegionName : scopeLabel;
  // What still reads the header's hub or region while the book reaches past it.
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
    scopeLabel,
    bookScope,
    priceScopeName,
    scopeNote,
  };
}
