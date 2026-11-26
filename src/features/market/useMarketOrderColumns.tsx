import { useCallback, useMemo } from 'react';
import type { TFunction } from 'i18next';
import type { DataTableColumn } from '@/components/ui';
import { COL_DATE, COL_ISK, COL_QUANTITY, COL_SMALL_NUMBER } from '@/components/ui/dataTableWidths';
import {
  SELL_ORDER_COLUMN_IDS,
  BUY_ORDER_COLUMN_IDS,
  useVisibleMarketOrderColumns,
  ORDER_BOOK_LOCATION_CLASS,
  isColumnWithheld,
  type MarketOrderColumnId,
} from '@/features/market/marketOrderColumns';
import { formatVolume } from '@/features/market/format';
import { feeColumnTooltip } from '@/features/market/feeColumnTooltip';
import {
  resolveOrderLocation,
  orderExpiry,
  type NpcStationLookup,
  type SolarSystemLookup,
} from '@/engine/market/orderBook';
import {
  BaitFlag,
  LocationCell,
  MyOrderMark,
  SecurityCell,
} from '@/features/market/marketOrderCells';
import { renderJumpsCell } from '@/features/route/jumpsCell';
import type { JumpRangeFilter, JumpsCellValue } from '@/features/route/currentSystem';
import type { RegionOrder } from '@/esi/endpoints';
import { orderFees, type OrderFeeContext } from '@/engine/market/orderFees';
import { formatMarketIsk } from '@/lib/isk';
import { rangeLabel } from '@/features/market/orderBookCsv';
import { sellOutlierMultiple } from '@/engine/market/orderBookDepth';
import { useHydratedStore } from '@/lib/useHydratedStore';
import { useTimeZone } from '@/lib/timeFormat';
import { formatDateOnly } from '@/lib/timestamp';

function rangeRank(range: string): number | undefined {
  if (range === 'station') return 0;
  if (range === 'solarsystem') return 1;
  if (range === 'region') return Number.MAX_SAFE_INTEGER;
  const jumps = Number(range);
  return Number.isFinite(jumps) ? 2 + jumps : undefined;
}

export interface UseMarketOrderColumnsArgs {
  t: TFunction;
  npcStationMap: ReadonlyMap<number, NpcStationLookup>;
  solarSystemMap: ReadonlyMap<number, SolarSystemLookup>;
  myOrderIds: ReadonlySet<number>;
  jumpRangeFilter: JumpRangeFilter;
  bestSell: number | null;
  cards: boolean;
  locationSqueezed: boolean;
  hideLocation: boolean;
  feeContext: OrderFeeContext | null;
}

export interface MarketOrderColumns {
  visibleOrderColumns: readonly MarketOrderColumnId[];
  toggleOrderColumn: (id: MarketOrderColumnId) => void;
  orderColumnsById: Record<MarketOrderColumnId, DataTableColumn<RegionOrder>>;
  baseColumns: DataTableColumn<RegionOrder>[];
  buyColumns: DataTableColumn<RegionOrder>[];
  sellHiddenColumns: readonly MarketOrderColumnId[];
  buyHiddenColumns: readonly MarketOrderColumnId[];
}

export function useMarketOrderColumns({
  t,
  npcStationMap,
  solarSystemMap,
  myOrderIds,
  jumpRangeFilter,
  bestSell,
  cards,
  locationSqueezed,
  hideLocation,
  feeContext,
}: UseMarketOrderColumnsArgs): MarketOrderColumns {
  const timeZone = useTimeZone();
  const pickedOrderColumns = useVisibleMarketOrderColumns((state) => state.value);
  const visibleOrderColumns = useMemo(
    () => pickedOrderColumns.filter((id) => !isColumnWithheld(id, { hideLocation, feeContext })),
    [hideLocation, feeContext, pickedOrderColumns]
  );
  const setVisibleOrderColumns = useVisibleMarketOrderColumns((state) => state.setValue);
  useHydratedStore(useVisibleMarketOrderColumns);
  function toggleOrderColumn(id: MarketOrderColumnId) {
    const next = pickedOrderColumns.includes(id)
      ? pickedOrderColumns.filter((existing) => existing !== id)
      : [...pickedOrderColumns, id];
    void setVisibleOrderColumns(next);
  }

  const orderJumps = useCallback(
    (systemId: number): JumpsCellValue => {
      if (jumpRangeFilter.jumpsStatus !== 'ready') return { kind: jumpRangeFilter.jumpsStatus };
      return { kind: 'value', count: jumpRangeFilter.jumps?.get(systemId) ?? null };
    },
    [jumpRangeFilter]
  );

  const orderColumnsById = useMemo<Record<MarketOrderColumnId, DataTableColumn<RegionOrder>>>(
    () => ({
      price: {
        id: 'price',
        header: t('market.price'),
        width: '24ch',
        align: 'right',
        className: 'tabular-nums',
        cardCorner: visibleOrderColumns.includes('location'),
        render: (o) => (
          <>
            {myOrderIds.has(o.order_id) && <MyOrderMark t={t} />}
            {!o.is_buy_order && (
              <BaitFlag multiple={sellOutlierMultiple(o.price, bestSell)} t={t} />
            )}
            {formatMarketIsk(o.price)}
          </>
        ),
        sortValue: (o) => o.price,
      },
      fees: {
        id: 'fees',
        header: t('market.feesColumn'),
        width: '16ch',
        align: 'right',
        className: 'tabular-nums text-text-dim',
        stackAffix: { before: t('market.feesAffix') },
        render: (o) => (feeContext === null ? '—' : formatMarketIsk(orderFees(o, feeContext).fees)),
        sortValue: (o) => (feeContext === null ? undefined : orderFees(o, feeContext).fees),
      },
      finalPrice: {
        id: 'finalPrice',
        header: t('market.finalPriceColumn'),
        width: COL_ISK,
        align: 'right',
        className: 'tabular-nums',
        stackAffix: { before: t('market.finalPriceAffix') },
        render: (o) =>
          feeContext === null ? '—' : formatMarketIsk(orderFees(o, feeContext).finalPrice),
        sortValue: (o) => (feeContext === null ? undefined : orderFees(o, feeContext).finalPrice),
      },
      quantity: {
        id: 'quantity',
        header: t('market.quantityColumn'),
        width: COL_QUANTITY,
        align: 'right',
        className: 'tabular-nums',
        stackAffix: { before: t('market.quantityAffix') },
        render: (o) => formatVolume(o.volume_remain),
        sortValue: (o) => o.volume_remain,
      },
      location: {
        id: 'location',
        header: t('market.location'),
        className: cards ? '' : ORDER_BOOK_LOCATION_CLASS[locationSqueezed ? 'squeezed' : 'roomy'],
        primary: true,
        sortValue: (o) =>
          resolveOrderLocation(o, npcStationMap, solarSystemMap).stationName ?? undefined,
        render: (o) => (
          <LocationCell
            order={o}
            npcStations={npcStationMap}
            solarSystems={solarSystemMap}
            t={t}
            card={cards}
          />
        ),
      },
      security: {
        id: 'security',
        header: t('market.securityColumn'),
        width: '10ch',
        align: 'right',
        className: 'tabular-nums',
        sortValue: (o) => resolveOrderLocation(o, npcStationMap, solarSystemMap).security,
        render: (o) => (
          <SecurityCell order={o} npcStations={npcStationMap} solarSystems={solarSystemMap} t={t} />
        ),
      },
      jumps: {
        id: 'jumps',
        header: t('market.jumpsColumn'),
        width: COL_SMALL_NUMBER,
        align: 'right',
        className: 'tabular-nums',
        sortFirst: 'asc',
        sortValue: (o) => {
          const cell = orderJumps(o.system_id);
          return cell.kind === 'value' ? (cell.count ?? undefined) : undefined;
        },
        render: (o) => {
          const cell = orderJumps(o.system_id);
          return (
            <>
              {renderJumpsCell(cell, t, 'market.jumpsUnavailableHint', o.system_id)}
              {cards && cell.kind === 'value' && cell.count !== null && (
                <> {t('market.jumpsWord', { count: cell.count })}</>
              )}
            </>
          );
        },
      },
      expiry: {
        id: 'expiry',
        header: t('market.expiry'),
        width: COL_DATE,
        className: 'whitespace-nowrap text-text-dim',
        stackAffix: { before: t('market.expiryAffix') },
        render: (o) => formatDateOnly(orderExpiry(o), timeZone),
        sortValue: (o) => orderExpiry(o).getTime(),
      },
      range: {
        id: 'range',
        header: t('market.range'),
        width: '14ch',
        className: 'text-text-dim',
        stackAffix: { before: t('market.rangeAffix') },
        sortValue: (o) => rangeRank(o.range),
        render: (o) => rangeLabel(o.range, t),
      },
      minVolume: {
        id: 'minVolume',
        header: t('market.minVolume'),
        width: COL_QUANTITY,
        align: 'right',
        className: 'tabular-nums',
        stackAffix: { before: t('market.minVolumeAffix') },
        render: (o) => formatVolume(o.min_volume),
        sortValue: (o) => o.min_volume,
      },
    }),
    [
      t,
      npcStationMap,
      solarSystemMap,
      myOrderIds,
      orderJumps,
      bestSell,
      cards,
      locationSqueezed,
      visibleOrderColumns,
      feeContext,
      timeZone,
    ]
  );

  const withFeeTooltips = useCallback(
    (ids: readonly MarketOrderColumnId[], side: 'sell' | 'buy') =>
      ids
        .filter((id) => visibleOrderColumns.includes(id))
        .map((id) =>
          id === 'fees' || id === 'finalPrice'
            ? {
                ...orderColumnsById[id],
                headerTooltip: feeColumnTooltip(t, id, side),
              }
            : orderColumnsById[id]
        ),
    [visibleOrderColumns, orderColumnsById, t]
  );
  const baseColumns = useMemo<DataTableColumn<RegionOrder>[]>(
    () => withFeeTooltips(SELL_ORDER_COLUMN_IDS, 'sell'),
    [withFeeTooltips]
  );
  const buyColumns = useMemo<DataTableColumn<RegionOrder>[]>(
    () => withFeeTooltips(BUY_ORDER_COLUMN_IDS, 'buy'),
    [withFeeTooltips]
  );
  const sellHiddenColumns = useMemo(
    () =>
      SELL_ORDER_COLUMN_IDS.filter(
        (id) =>
          !visibleOrderColumns.includes(id) && !isColumnWithheld(id, { hideLocation, feeContext })
      ),
    [visibleOrderColumns, hideLocation, feeContext]
  );
  const buyHiddenColumns = useMemo(
    () =>
      BUY_ORDER_COLUMN_IDS.filter(
        (id) =>
          !visibleOrderColumns.includes(id) && !isColumnWithheld(id, { hideLocation, feeContext })
      ),
    [visibleOrderColumns, hideLocation, feeContext]
  );

  return {
    visibleOrderColumns,
    toggleOrderColumn,
    orderColumnsById,
    baseColumns,
    buyColumns,
    sellHiddenColumns,
    buyHiddenColumns,
  };
}
