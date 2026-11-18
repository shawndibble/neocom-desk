/**
 * The Market Browser's order-book tables as one unit: the fee context the fee
 * columns price with, the CSV exports, which columns are picked and how wide
 * the book needs to be, and the column definitions. The route only mounts them.
 */
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
  /** The browser is in Trade Hub mode, so one station owner sets the broker fee standings. */
  hubMode: boolean;
  effectiveHubId: TradeHub['id'];
  tradeHubStandings: TradeHubStandingsMap;
  npcStationMap: ReadonlyMap<number, NpcStationLookup>;
  solarSystemMap: ReadonlyMap<number, SolarSystemLookup>;
  myOrderIds: ReadonlySet<number>;
  jumpRangeFilter: JumpRangeFilter;
  /** The book covers exactly one station, which the scope bar already names. */
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
  // Broker fee standings come from the selected hub's station owner; a region
  // or structure book has no single owner, so it prices with none.
  const hubStanding = hubMode
    ? tradeHubStanding(tradeHubStandings, effectiveHubId)
    : ZERO_STANDINGS;
  const feeContext = useMemo<OrderFeeContext | null>(
    () => (feeSkills ? { ...feeSkills, standing: hubStanding } : null),
    [feeSkills, hubStanding]
  );
  const knownJumps = jumpRangeFilter.jumpsStatus === 'ready' ? jumpRangeFilter.jumps : null;
  // A row's distance from the Current System, for the export: the Jumps column's own rule.
  const exportJumpsFor = useCallback(
    (systemId: number) => knownJumps?.get(systemId) ?? null,
    [knownJumps]
  );
  // Every row, not the ROW_CAP the tables mount before "Show all"; every column, not the picker's.
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
  // A held-back column can't be ticked, so the picker doesn't offer it, and it
  // doesn't count toward the width the book needs.
  const notWithheld = useCallback(
    (ids: readonly MarketOrderColumnId[]) =>
      ids.filter((id) => !isColumnWithheld(id, { hideLocation: singleStationBook, feeContext })),
    [singleStationBook, feeContext]
  );
  const unwithheldPicked = useMemo(
    () => notWithheld(pickedOrderColumns),
    [notWithheld, pickedOrderColumns]
  );
  // The order book's own width picks columns or two-line cards: a phone,
  // and a desktop whose finder column leaves the book too narrow for the
  // columns the pilot has picked and the figures on screen, both get the
  // card. Short of that, Location narrows first, so fewer widths need cards.
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
