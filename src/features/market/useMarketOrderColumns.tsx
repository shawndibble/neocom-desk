/**
 * The order book's Sell/Buy table columns: the fixed set both tables can
 * show (`MARKET_ORDER_COLUMN_IDS`), which of them are actually visible (a
 * device-local preference, `marketOrderColumns.ts`), and per-column render.
 */
import { useCallback, useEffect, useMemo } from 'react';
import type { TFunction } from 'i18next';
import type { DataTableColumn } from '@/components/ui';
import {
  SELL_ORDER_COLUMN_IDS,
  BUY_ORDER_COLUMN_IDS,
  useVisibleMarketOrderColumns,
  type MarketOrderColumnId,
} from '@/features/market/marketOrderColumns';
import { formatVolume } from '@/features/market/format';
import {
  resolveOrderLocation,
  orderExpiry,
  type NpcStationLookup,
  type SolarSystemLookup,
} from '@/engine/market/orderBook';
import { LocationCell, SecurityCell } from '@/features/market/marketOrderCells';
import { renderJumpsCell } from '@/features/route/jumpsCell';
import type { JumpRangeFilter, JumpsCellValue } from '@/features/route/currentSystem';
import type { RegionOrder } from '@/esi/endpoints';
import { formatIsk } from '@/lib/isk';
import { rangeLabel } from '@/features/market/orderBookCsv';

export interface UseMarketOrderColumnsArgs {
  t: TFunction;
  npcStationMap: ReadonlyMap<number, NpcStationLookup>;
  solarSystemMap: ReadonlyMap<number, SolarSystemLookup>;
  myOrderIds: ReadonlySet<number>;
  jumpRangeFilter: JumpRangeFilter;
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
}: UseMarketOrderColumnsArgs): MarketOrderColumns {
  const visibleOrderColumns = useVisibleMarketOrderColumns((state) => state.value);
  const setVisibleOrderColumns = useVisibleMarketOrderColumns((state) => state.setValue);
  const hydrateVisibleOrderColumns = useVisibleMarketOrderColumns((state) => state.hydrate);
  useEffect(() => {
    void hydrateVisibleOrderColumns();
  }, [hydrateVisibleOrderColumns]);
  function toggleOrderColumn(id: MarketOrderColumnId) {
    const next = visibleOrderColumns.includes(id)
      ? visibleOrderColumns.filter((existing) => existing !== id)
      : [...visibleOrderColumns, id];
    void setVisibleOrderColumns(next);
  }

  /**
   * A row's own distance from the Current System — independent of whether a
   * Jump Range filter is even active (`jumpRangeFilter.jumps`/`jumpsStatus`
   * are populated at every range, `useJumpRangeFilter`). `count: null` is a
   * settled row this app cannot place on the stargate graph — not the same
   * as still loading, same "unknowable, not pending" rule the Courier
   * board's own Jumps column follows.
   */
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
        align: 'right',
        className: 'tabular-nums',
        render: (o) => (
          <>
            {formatIsk(o.price, 2)}
            {/*
              The tinted row (`row-mine`, styles/index.css) is the visible
              marker for "this one is mine" — no badge, no gap figure,
              nothing that adds a line to every row of a book you scan by
              price. Colour is never the sole signal though (docs/DESIGN.md
              §7), so the word rides along unseen, the way `CorpBoardRow`'s
              severity label does.
            */}
            {myOrderIds.has(o.order_id) && <span className="sr-only">{t('market.myOrder')}</span>}
          </>
        ),
        sortValue: (o) => o.price,
      },
      quantity: {
        id: 'quantity',
        header: t('market.quantity'),
        align: 'right',
        className: 'tabular-nums',
        render: (o) => formatVolume(o.volume_remain),
        sortValue: (o) => o.volume_remain,
      },
      location: {
        id: 'location',
        header: t('market.location'),
        render: (o) => (
          <LocationCell order={o} npcStations={npcStationMap} solarSystems={solarSystemMap} t={t} />
        ),
      },
      security: {
        id: 'security',
        header: t('market.securityColumn'),
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
        align: 'right',
        className: 'tabular-nums',
        sortValue: (o) => {
          const cell = orderJumps(o.system_id);
          return cell.kind === 'value' ? (cell.count ?? undefined) : undefined;
        },
        render: (o) => renderJumpsCell(orderJumps(o.system_id), t, 'market.jumpsUnavailableHint'),
      },
      expiry: {
        id: 'expiry',
        header: t('market.expiry'),
        className: 'whitespace-nowrap text-text-dim',
        render: (o) => orderExpiry(o).toLocaleDateString(),
        sortValue: (o) => orderExpiry(o).getTime(),
      },
      range: {
        id: 'range',
        header: t('market.range'),
        className: 'text-text-dim',
        render: (o) => rangeLabel(o.range, t),
      },
      minVolume: {
        id: 'minVolume',
        header: t('market.minVolume'),
        align: 'right',
        className: 'tabular-nums',
        render: (o) => formatVolume(o.min_volume),
        sortValue: (o) => o.min_volume,
      },
    }),
    [t, npcStationMap, solarSystemMap, myOrderIds, orderJumps]
  );

  const baseColumns = useMemo<DataTableColumn<RegionOrder>[]>(
    () =>
      SELL_ORDER_COLUMN_IDS.filter((id) => visibleOrderColumns.includes(id)).map(
        (id) => orderColumnsById[id]
      ),
    [visibleOrderColumns, orderColumnsById]
  );
  const buyColumns = useMemo<DataTableColumn<RegionOrder>[]>(
    () =>
      BUY_ORDER_COLUMN_IDS.filter((id) => visibleOrderColumns.includes(id)).map(
        (id) => orderColumnsById[id]
      ),
    [visibleOrderColumns, orderColumnsById]
  );
  // What each table's row expand (`OrderDetailPanel`) shows that the visible
  // columns don't — the picker's hidden ids, per table, since Sell and Buy
  // don't offer the same columns to begin with.
  const sellHiddenColumns = useMemo(
    () => SELL_ORDER_COLUMN_IDS.filter((id) => !visibleOrderColumns.includes(id)),
    [visibleOrderColumns]
  );
  const buyHiddenColumns = useMemo(
    () => BUY_ORDER_COLUMN_IDS.filter((id) => !visibleOrderColumns.includes(id)),
    [visibleOrderColumns]
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
