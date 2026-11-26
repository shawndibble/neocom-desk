import { useCallback, useMemo } from 'react';
import type { TFunction } from 'i18next';
import { ZERO_STANDINGS } from '@/engine/market/standings';
import type { OrderFeeContext } from '@/engine/market/orderFees';
import type { NpcStationLookup, SolarSystemLookup } from '@/engine/market/orderBook';
import type { RegionOrder } from '@/esi/endpoints';
import type { TradeHub } from '@/market/hubs';
import type { JumpRangeFilter } from '@/features/route/currentSystem';
import { useElementNarrowerThan } from '@/lib/useElementNarrowerThan';
import { useIsPhone } from '@/lib/useIsPhone';
import { useTableExport } from '@/components/ui/useTableExport';
import { useOrderFeeSkills } from '@/features/market/useOrderFeeSkills';
import {
  tradeHubStanding,
  type TradeHubStandingsMap,
} from '@/features/market/useTradeHubStandings';
import type { LoadedOrderBookView } from '@/features/market/orderBookView';
import { orderBookCsvColumns } from '@/features/market/orderBookCsv';
import { useMarketOrderColumns } from '@/features/market/useMarketOrderColumns';
import {
  orderBookFigureChars,
  orderBookWidthsRem,
  isColumnWithheld,
  useVisibleMarketOrderColumns,
  type MarketOrderColumnId,
} from '@/features/market/marketOrderColumns';

export interface UseMarketOrderTablesArgs {
  t: TFunction;
  activeCharacterId: number | null;
  hubMode: boolean;
  effectiveHubId: TradeHub['id'];
  tradeHubStandings: TradeHubStandingsMap;
  npcStationMap: ReadonlyMap<number, NpcStationLookup>;
  solarSystemMap: ReadonlyMap<number, SolarSystemLookup>;
  myOrderIds: ReadonlySet<number>;
  jumpRangeFilter: JumpRangeFilter;
  singleStationBook: boolean;
  loadedView: LoadedOrderBookView | null;
  sortedSell: readonly RegionOrder[];
  sortedBuy: readonly RegionOrder[];
  shownSell: readonly RegionOrder[];
}

export function useMarketOrderTables({
  t,
  activeCharacterId,
  hubMode,
  effectiveHubId,
  tradeHubStandings,
  npcStationMap,
  solarSystemMap,
  myOrderIds,
  jumpRangeFilter,
  singleStationBook,
  loadedView,
  sortedSell,
  sortedBuy,
  shownSell,
}: UseMarketOrderTablesArgs) {
  const isPhone = useIsPhone();
  const bookBestSell = loadedView?.summary.bestSell ?? null;
  const bookBestBuy = loadedView?.summary.bestBuy ?? null;
  const truncated = loadedView?.truncated ?? false;
  const feeSkills = useOrderFeeSkills(activeCharacterId);
  const hubStanding = hubMode
    ? tradeHubStanding(tradeHubStandings, effectiveHubId)
    : ZERO_STANDINGS;
  const feeContext = useMemo<OrderFeeContext | null>(
    () => (feeSkills ? { ...feeSkills, standing: hubStanding } : null),
    [feeSkills, hubStanding]
  );
  const knownJumps = jumpRangeFilter.jumpsStatus === 'ready' ? jumpRangeFilter.jumps : null;
  const exportJumpsFor = useCallback(
    (systemId: number) => knownJumps?.get(systemId) ?? null,
    [knownJumps]
  );
  const sellCsvColumns = useMemo(
    () =>
      orderBookCsvColumns(t, {
        npcStations: npcStationMap,
        solarSystems: solarSystemMap,
        isBuy: false,
        jumpsFor: exportJumpsFor,
        feeContext,
        myOrderIds,
        best: bookBestSell,
      }),
    [t, npcStationMap, solarSystemMap, exportJumpsFor, feeContext, myOrderIds, bookBestSell]
  );
  const buyCsvColumns = useMemo(
    () =>
      orderBookCsvColumns(t, {
        npcStations: npcStationMap,
        solarSystems: solarSystemMap,
        isBuy: true,
        jumpsFor: exportJumpsFor,
        feeContext,
        myOrderIds,
        best: bookBestBuy,
      }),
    [t, npcStationMap, solarSystemMap, exportJumpsFor, feeContext, myOrderIds, bookBestBuy]
  );
  const sellExport = useTableExport({
    surface: 'market-sell',
    rows: sortedSell,
    columns: sellCsvColumns,
    truncated,
    source: 'sorted-rows',
  });
  const buyExport = useTableExport({
    surface: 'market-buy',
    rows: sortedBuy,
    columns: buyCsvColumns,
    truncated,
    source: 'sorted-rows',
  });

  const pickedOrderColumns = useVisibleMarketOrderColumns((state) => state.value);
  const notWithheld = useCallback(
    (ids: readonly MarketOrderColumnId[]) =>
      ids.filter((id) => !isColumnWithheld(id, { hideLocation: singleStationBook, feeContext })),
    [singleStationBook, feeContext]
  );
  const unwithheldPicked = useMemo(
    () => notWithheld(pickedOrderColumns),
    [notWithheld, pickedOrderColumns]
  );
  const orderBookWidths = orderBookWidthsRem(
    unwithheldPicked,
    orderBookFigureChars([...shownSell, ...sortedBuy], bookBestSell, myOrderIds)
  );
  const [orderBookRef, [orderLocationSqueezed = false, orderBookNarrow = false]] =
    useElementNarrowerThan<HTMLDivElement>([orderBookWidths.roomy, orderBookWidths.cards]);
  const orderCards = isPhone || orderBookNarrow;

  const columns = useMarketOrderColumns({
    t,
    npcStationMap,
    solarSystemMap,
    myOrderIds,
    jumpRangeFilter,
    bestSell: bookBestSell,
    cards: orderCards,
    locationSqueezed: orderLocationSqueezed,
    hideLocation: singleStationBook,
    feeContext,
  });

  return {
    ...columns,
    sellExport,
    buyExport,
    pickableColumns: notWithheld,
    orderBookRef,
    orderCards,
  };
}
